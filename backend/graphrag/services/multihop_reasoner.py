import logging
import re
from typing import List, Dict, Any, Optional
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from .llm_client import get_llm
from .neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)

# Patterns that indicate multi-hop queries
MULTIHOP_PATTERNS = [
    r"who manages.*who",
    r"who leads.*that",
    r"what depends on.*that",
    r"what.*connected to.*through",
    r"who reports to.*who",
    r"which.*works at.*that",
    r"what.*built by.*that",
    r"find.*path between",
    r"how.*related to",
    r"who.*manages the team",
    r"what.*the manager of",
    r"list all.*connected",
]


class EntityPair(BaseModel):
    """Two entities to find a path between."""
    entity_a: str = Field(description="The first entity name")
    entity_b: str = Field(description="The second entity name")


class MultiHopReasoner:
    def __init__(self):
        logger.info("Initializing MultiHopReasoner service.")
        self.neo4j_client = Neo4jClient()
        self.llm = get_llm(temperature=0.0)

        # Entity extraction prompt for multi-hop queries
        self.entity_extract_prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "Extract the two main entities from this multi-hop question. "
                "Return them as entity_a and entity_b."
            )),
            ("human", "{question}")
        ])
        self.entity_extract_chain = self.entity_extract_prompt | self.llm.with_structured_output(EntityPair)

        # Prompt instruction to summarize path connections
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an AI analyst specialized in explaining graph connections.\n"
                "You will be given a path of nodes and relationships from a knowledge graph showing how two entities are connected.\n"
                "Your job is to summarize this connection path in a clear, natural paragraph.\n\n"
                "Format rules:\n"
                "- Clearly mention each step of the connection.\n"
                "- Keep the explanation factual based *only* on the provided path info."
            )),
            ("human", (
                "Explain the connection between '{entity_a}' and '{entity_b}' based on this graph path:\n\n"
                "{path_details}"
            ))
        ])

        self.chain = self.prompt | self.llm

    @staticmethod
    def is_multihop_query(question: str) -> bool:
        """Detect if a question requires multi-hop reasoning based on pattern matching."""
        q = question.lower()
        return any(re.search(pat, q) for pat in MULTIHOP_PATTERNS)

    def extract_entities_from_query(self, question: str) -> Optional[Dict[str, str]]:
        """Use LLM to extract entity pair from a multi-hop question."""
        try:
            result: EntityPair = self.entity_extract_chain.invoke({"question": question})
            return {"entity_a": result.entity_a.strip(), "entity_b": result.entity_b.strip()}
        except Exception as e:
            logger.error("Failed to extract entities from multi-hop query: %s", str(e))
            return None

    def _get_nodes_and_rels(self, path_obj):
        if isinstance(path_obj, list):
            nodes = [path_obj[i] for i in range(0, len(path_obj), 2)]
            relationships = [path_obj[i] for i in range(1, len(path_obj), 2)]
            return nodes, relationships
        else:
            return list(path_obj.nodes), list(path_obj.relationships)

    def _get_rel_type(self, rel):
        if isinstance(rel, str):
            return rel
        if isinstance(rel, dict):
            return rel.get("type", "RELATED_TO")
        if hasattr(rel, "type"):
            return rel.type
        return "RELATED_TO"

    def find_alternative_paths(self, entity_a: str, entity_b: str, user_id: str, max_paths: int = 3) -> List[List[Dict]]:
        """Find multiple alternative paths between two entities."""
        cypher = (
            "MATCH p = allShortestPaths("
            "  (a:Entity {name: $entity_a, user_id: $user_id})-[*..5]-(b:Entity {name: $entity_b, user_id: $user_id})"
            ") "
            "RETURN p LIMIT $limit"
        )
        params = {
            "entity_a": entity_a,
            "entity_b": entity_b,
            "user_id": str(user_id),
            "limit": max_paths
        }

        try:
            records = self.neo4j_client.execute_query(cypher, params)
            all_paths = []
            for record in records:
                path_obj = record.get("p")
                if not path_obj:
                    continue
                nodes, relationships = self._get_nodes_and_rels(path_obj)
                path_steps = []
                for i in range(len(relationships)):
                    now_name = dict(nodes[i]).get("name", "Unknown")
                    next_name = dict(nodes[i + 1]).get("name", "Unknown")
                    rel_type = self._get_rel_type(relationships[i])
                    path_steps.append({
                        "source": now_name,
                        "target": next_name,
                        "type": rel_type,
                    })
                if path_steps:
                    all_paths.append(path_steps)
            return all_paths
        except Exception as e:
            logger.error("Failed to find alternative paths: %s", str(e))
            return []

    def explain_connection(self, entity_a: str, entity_b: str, user_id: str) -> Dict[str, Any]:
        """
        Finds the shortest path between two entities in Neo4j and uses the LLM to explain the connection.
        """
        logger.info("Finding connection between '%s' and '%s' (User: %s)", entity_a, entity_b, user_id)
        
        # 1. Fetch shortest path from Neo4j
        cypher = (
            "MATCH p = shortestPath("
            "  (a:Entity {name: $entity_a, user_id: $user_id})-[*..5]-(b:Entity {name: $entity_b, user_id: $user_id})"
            ") "
            "RETURN p"
        )
        params = {
            "entity_a": entity_a,
            "entity_b": entity_b,
            "user_id": str(user_id)
        }

        try:
            records = self.neo4j_client.execute_query(cypher, params)
            if not records or not records[0].get("p"):
                logger.info("No connection path found between '%s' and '%s'.", entity_a, entity_b)
                return {
                    "found": False,
                    "explanation": f"No indirect connection (up to 4 hops) was found between '{entity_a}' and '{entity_b}' in the knowledge graph.",
                    "path": []
                }

            path_obj = records[0]["p"]
            nodes, relationships = self._get_nodes_and_rels(path_obj)

            # 2. Extract path details for prompt serialization
            path_steps = []
            serialized_path = []

            for i in range(len(relationships)):
                node_now = nodes[i]
                node_next = nodes[i + 1]
                rel = relationships[i]

                now_name = dict(node_now).get("name", "Unknown")
                next_name = dict(node_next).get("name", "Unknown")
                
                now_type = dict(node_now).get("type", "Entity")
                next_type = dict(node_next).get("type", "Entity")
                
                rel_type = self._get_rel_type(rel)

                # Extract source_doc from relationship props if available
                if isinstance(rel, dict):
                    source_doc = rel.get("source_doc", "")
                elif hasattr(rel, "get"):
                    source_doc = rel.get("source_doc", "")
                else:
                    try:
                        source_doc = dict(rel).get("source_doc", "")
                    except Exception:
                        source_doc = ""

                step_str = f"({now_name} [{now_type}]) --[{rel_type}]--> ({next_name} [{next_type}])"
                path_steps.append(step_str)
                
                # Keep tracking representation for the response payload
                serialized_path.append({
                    "source": now_name,
                    "source_type": now_type,
                    "target": next_name,
                    "target_type": next_type,
                    "type": rel_type,
                    "source_doc": source_doc,
                })

            path_details = "\n".join(path_steps)
            logger.info("Found path with %d hops: %s", len(relationships), path_details)

            # 3. Ask LLM to summarize/explain this path
            response = self.chain.invoke({
                "entity_a": entity_a,
                "entity_b": entity_b,
                "path_details": path_details
            })
            
            explanation = response.content.strip()

            # Find alternative paths
            alt_paths = self.find_alternative_paths(entity_a, entity_b, user_id)
            # Filter out the main path
            main_path_key = tuple((s["source"], s["target"], s["type"]) for s in serialized_path)
            alternative_paths = [
                p for p in alt_paths
                if tuple((s["source"], s["target"], s["type"]) for s in p) != main_path_key
            ]

            return {
                "found": True,
                "explanation": explanation,
                "path": serialized_path,
                "alternative_paths": alternative_paths[:2],
                "hop_count": len(relationships)
            }

        except Exception as e:
            logger.error("Failed to execute path reasoning query: %s", str(e), exc_info=True)
            return {
                "found": False,
                "explanation": "An internal error occurred while analyzing the connection.",
                "path": []
            }
