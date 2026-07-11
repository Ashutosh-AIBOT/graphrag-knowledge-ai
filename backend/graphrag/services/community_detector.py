import logging
from typing import List, Dict, Any, Optional
from collections import defaultdict
from django.core.cache import cache
from .neo4j_client import Neo4jClient
from .llm_client import get_llm
from langchain_core.prompts import ChatPromptTemplate

logger = logging.getLogger(__name__)

COMMUNITY_CACHE_TTL = 300  # 5 minutes


class CommunityDetector:
    """
    Detects communities/clusters in the knowledge graph using
    Label Propagation algorithm (simpler than Louvain, works well for Neo4j),
    then uses LLM to generate descriptive labels and summaries.
    """

    def __init__(self):
        logger.info("Initializing CommunityDetector service.")
        self.neo4j_client = Neo4jClient()
        self.llm = get_llm(temperature=0.3)

    def detect_communities(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Runs Label Propagation community detection on the user's subgraph.
        Returns list of community dicts with id, members, and labels.
        """
        logger.info("Running community detection for user: %s", user_id)

        # 1. Fetch the graph structure (adjacency list)
        edges_query = (
            "MATCH (a:Entity {user_id: $user_id})-[r]-(b:Entity {user_id: $user_id}) "
            "RETURN a.name AS source, b.name AS target"
        )
        try:
            edges = self.neo4j_client.execute_query(edges_query, {"user_id": str(user_id)})
        except Exception as e:
            logger.error("Neo4j unavailable for community detection: %s", str(e))
            return []

        if not edges:
            logger.info("No edges found. Cannot detect communities.")
            return []

        # 2. Build adjacency list
        adjacency = defaultdict(set)
        all_nodes = set()
        for edge in edges:
            adjacency[edge["source"]].add(edge["target"])
            adjacency[edge["target"]].add(edge["source"])
            all_nodes.add(edge["source"])
            all_nodes.add(edge["target"])

        # 3. Label Propagation Algorithm (synchronous)
        communities = self._label_propagation(all_nodes, adjacency)

        # 4. Fetch entity details for each community
        entity_details = self._fetch_entity_details(list(all_nodes), user_id)

        # 5. Build community objects
        community_list = []
        for i, (comm_id, members) in enumerate(communities.items()):
            if len(members) < 2:
                continue  # Skip singleton communities
            member_details = [
                entity_details.get(m, {"name": m, "type": "Unknown", "description": ""})
                for m in members
            ]
            
            # Count unique internal relationships
            members_set = set(members)
            seen_rels = set()
            for edge in edges:
                s, t = edge["source"], edge["target"]
                if s in members_set and t in members_set:
                    pair = tuple(sorted([s, t]))
                    seen_rels.add(pair)
            relationship_count = len(seen_rels)

            community_list.append({
                "id": i + 1,  # Sequential integer ID
                "members": list(members),
                "member_count": len(members),
                "member_details": member_details,
                "relationship_count": relationship_count
            })

        # 6. Cache the raw structure immediately (so fast requests get data right away)
        cache.set(f"communities_{user_id}", community_list, COMMUNITY_CACHE_TTL)

        # 7. Generate LLM labels and summaries for each community (may be slow)
        for comm in community_list:
            try:
                label_summary = self._generate_community_label_summary(comm)
                comm["label"] = label_summary.get("label", f"Community {comm['id']}")
                comm["summary"] = label_summary.get("summary", "")
            except Exception as e:
                logger.warning("LLM label generation failed for community %s: %s", comm['id'], str(e))
                comm["label"] = f"Community {comm['id']}"
                comm["summary"] = ""

        # 8. Cache final labeled result
        logger.info("Detected %d communities for user: %s", len(community_list), user_id)
        cache.set(f"communities_{user_id}", community_list, COMMUNITY_CACHE_TTL)

        # 9. Generate and cache document summary
        try:
            doc_summary = self._build_doc_summary_from_communities(community_list)
            cache.set(f"doc_summary_{user_id}", doc_summary, COMMUNITY_CACHE_TTL)
        except Exception:
            pass

        return community_list

    def _label_propagation(self, nodes: set, adjacency: dict, max_iterations: int = 20) -> Dict[int, set]:
        """
        Synchronous Label Propagation algorithm.
        Each node starts with its own label. Labels propagate through edges.
        Converges when no label changes.
        """
        # Initialize: each node gets its own label
        labels = {node: node for node in nodes}

        for iteration in range(max_iterations):
            new_labels = {}
            changed = False

            for node in nodes:
                if not adjacency[node]:
                    new_labels[node] = labels[node]
                    continue

                # Count labels among neighbors
                label_counts = defaultdict(int)
                for neighbor in adjacency[node]:
                    label_counts[labels[neighbor]] += 1

                # Pick the most common label (ties broken by deterministic min)
                max_count = max(label_counts.values())
                candidates = [l for l, c in label_counts.items() if c == max_count]
                new_label = min(candidates)

                if new_labels.get(node, None) != new_label:
                    changed = True
                new_labels[node] = new_label

            labels = new_labels
            if not changed:
                logger.info("Label Propagation converged after %d iterations.", iteration + 1)
                break

        # Group nodes by their final label
        communities = defaultdict(set)
        for node, label in labels.items():
            communities[label].add(node)

        return dict(communities)

    def _fetch_entity_details(self, names: List[str], user_id: str) -> Dict[str, dict]:
        """Fetch entity type and description for a list of entity names."""
        if not names:
            return {}

        query = (
            "MATCH (e:Entity {user_id: $user_id}) "
            "WHERE e.name IN $names "
            "RETURN e.name AS name, e.type AS type, e.description AS description"
        )
        try:
            records = self.neo4j_client.execute_query(query, {
                "user_id": str(user_id),
                "names": names
            })
            return {r["name"]: r for r in records}
        except Exception as e:
            logger.error("Failed to fetch entity details: %s", str(e))
            return {}

    def _generate_community_label_summary(self, community: Dict) -> Dict[str, str]:
        """Uses LLM to generate a descriptive label and summary for a community."""
        members_text = "\n".join([
            f"- {m['name']} ({m.get('type', 'Unknown')}): {m.get('description', 'No description')}"
            for m in community["member_details"]
        ])

        prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert at analyzing knowledge graph communities.\n"
                "Given a list of entities in a community cluster, generate:\n"
                "1. A short descriptive label (2-5 words) summarizing the community theme\n"
                "2. A 2-3 paragraph summary describing what this community represents, "
                "how the entities relate, and what themes they represent.\n\n"
                "Be factual and grounded in the entity descriptions."
            )),
            ("human", (
                "Community with {count} members:\n\n{members}\n\n"
                "Generate a label and summary."
            ))
        ])

        try:
            chain = prompt | self.llm
            response = chain.invoke({
                "count": community["member_count"],
                "members": members_text
            })

            # Parse response — expect "Label: ...\n\nSummary: ..."
            text = response.content.strip()
            lines = text.split("\n", 1)
            label = lines[0].strip().lstrip("#").strip()
            summary = lines[1].strip() if len(lines) > 1 else ""

            return {"label": label, "summary": summary}
        except Exception as e:
            logger.error("Failed to generate community label: %s", str(e))
            return {"label": f"Community {community['id']}", "summary": ""}

    def get_community_by_id(self, community_id: int, user_id: str) -> Optional[Dict]:
        """Returns a single community by ID, re-detecting if cache is empty."""
        cached = cache.get(f"communities_{user_id}", [])
        if not cached:
            cached = self.detect_communities(user_id)

        for comm in cached:
            if comm["id"] == community_id:
                return comm
        return None

    def get_all_communities(self, user_id: str) -> List[Dict]:
        """Returns all communities from cache only. Caller must trigger detect_communities() separately."""
        return cache.get(f"communities_{user_id}", [])

    def get_document_summary(self, user_id: str) -> str:
        """Returns cached document summary (never blocks on LLM)."""
        return cache.get(f"doc_summary_{user_id}", "")

    def _build_doc_summary_from_communities(self, communities: List[Dict]) -> str:
        """Generate a document-level summary by combining all community summaries."""
        if not communities:
            return ""

        community_texts = []
        for comm in communities:
            label = comm.get("label", f"Community {comm['id']}")
            summary = comm.get("summary", "")
            member_count = comm.get("member_count", 0)
            if summary:
                community_texts.append(f"**{label}** ({member_count} entities): {summary}")

        if not community_texts:
            return f"Document contains {len(communities)} topic clusters."

        prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert document analyst. Given summaries of different topic clusters "
                "found in a knowledge graph, write a cohesive 2-3 paragraph document overview.\n"
                "Synthesize the community summaries into a unified narrative."
            )),
            ("human", "Community summaries:\n\n{summaries}")
        ])

        try:
            chain = prompt | self.llm
            response = chain.invoke({"summaries": "\n\n".join(community_texts)})
            return response.content.strip()
        except Exception as e:
            logger.error("Failed to generate document summary: %s", str(e))
            return f"Document contains {len(communities)} topic clusters covering {sum(c.get('member_count', 0) for c in communities)} entities."
