import logging
import re
from typing import List, Dict, Any, Optional
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from .llm_client import get_llm
from .neo4j_client import Neo4jClient
from .vector_retriever import VectorRetriever

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


class QueryVariations(BaseModel):
    """Exactly 2 distinct search query variations of the input question."""
    variations: List[str] = Field(description="List containing exactly 2 distinct search query variations of the input question")


class MultiHopReasoner:
    def __init__(self):
        logger.info("Initializing MultiHopReasoner service.")
        self.neo4j_client = Neo4jClient()
        self.vector_retriever = VectorRetriever()
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

        # Query variations prompt and chain for query expansion
        self.variations_prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert search query variation assistant. "
                "Generate exactly 2 distinct search query variations of the input question to find connected entities in a graph."
            )),
            ("human", "{question}")
        ])
        self.variations_chain = self.variations_prompt | self.llm.with_structured_output(QueryVariations)

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

    def _resolve_hybrid_entity_name(self, name: str, user_id: str) -> str:
        """Resolves an entity name to the closest existing entity name in the graph."""
        if not name:
            return name
        name_clean = name.strip()
        
        # 1. First, check if exact match exists
        exact_cypher = (
            "MATCH (e:Entity {name: $name, user_id: $user_id}) "
            "RETURN e.name AS name LIMIT 1"
        )
        records = self.neo4j_client.execute_query(exact_cypher, {"name": name_clean, "user_id": str(user_id)})
        if records:
            return records[0]["name"]
            
        # 2. Case-insensitive exact match
        case_cypher = (
            "MATCH (e:Entity {user_id: $user_id}) "
            "WHERE toLower(e.name) = toLower($name) "
            "RETURN e.name AS name LIMIT 1"
        )
        records = self.neo4j_client.execute_query(case_cypher, {"name": name_clean, "user_id": str(user_id)})
        if records:
            return records[0]["name"]

        # 3. CONTAINS / partial match in Cypher
        contains_cypher = (
            "MATCH (e:Entity {user_id: $user_id}) "
            "WHERE toLower(e.name) CONTAINS toLower($name) OR toLower($name) CONTAINS toLower(e.name) "
            "RETURN e.name AS name LIMIT 1"
        )
        records = self.neo4j_client.execute_query(contains_cypher, {"name": name_clean, "user_id": str(user_id)})
        if records:
            return records[0]["name"]

        # 4. Fetch all entity names and use difflib to find the closest match
        all_cypher = (
            "MATCH (e:Entity {user_id: $user_id}) "
            "RETURN DISTINCT e.name AS name"
        )
        try:
            all_records = self.neo4j_client.execute_query(all_cypher, {"user_id": str(user_id)})
            all_names = [r["name"] for r in all_records if r.get("name")]
            
            import difflib
            matches = difflib.get_close_matches(name_clean, all_names, n=1, cutoff=0.3)
            if matches:
                logger.info("Fuzzy resolved entity '%s' -> '%s'", name_clean, matches[0])
                return matches[0]
        except Exception as e:
            logger.error("Failed fuzzy matching name resolution: %s", str(e))
            
        return name_clean

    def find_alternative_paths(self, entity_a: str, entity_b: str, user_id: str, max_paths: int = 5) -> List[List[Dict]]:
        """Find multiple alternative paths of different lengths between two entities."""
        entity_a = self._resolve_hybrid_entity_name(entity_a, user_id)
        entity_b = self._resolve_hybrid_entity_name(entity_b, user_id)
        cypher = (
            "MATCH p = (a:Entity {name: $entity_a, user_id: $user_id})-[*1..4]-(b:Entity {name: $entity_b, user_id: $user_id}) "
            "RETURN p LIMIT 30"
        )
        params = {
            "entity_a": entity_a,
            "entity_b": entity_b,
            "user_id": str(user_id)
        }

        try:
            records = self.neo4j_client.execute_query(cypher, params)
            all_paths = []
            for record in records:
                path_obj = record.get("p")
                if not path_obj:
                    continue
                nodes, relationships = self._get_nodes_and_rels(path_obj)
                
                # Filter out paths with cycles (node repetition)
                node_names = [dict(n).get("name", "Unknown") for n in nodes]
                if len(node_names) != len(set(node_names)):
                    continue
                
                path_steps = []
                for i in range(len(relationships)):
                    now_name = dict(nodes[i]).get("name", "Unknown")
                    next_name = dict(nodes[i + 1]).get("name", "Unknown")
                    rel = relationships[i]
                    rel_type = self._get_rel_type(rel)
                    
                    source_doc = ""
                    page = 1
                    if isinstance(rel, dict):
                        source_doc = rel.get("source_doc", "")
                        page = rel.get("page", 1)
                    elif hasattr(rel, "get"):
                        source_doc = rel.get("source_doc", "")
                        page = rel.get("page", 1)
                    else:
                        try:
                            source_doc = dict(rel).get("source_doc", "")
                            page = dict(rel).get("page", 1)
                        except Exception:
                            pass
                    
                    chunk_text = ""
                    if source_doc and page:
                        chunk_text = self.vector_retriever.get_chunk_by_page(source_doc, page, user_id) or ""

                    path_steps.append({
                        "source": now_name,
                        "target": next_name,
                        "type": rel_type,
                        "source_doc": source_doc,
                        "page": page,
                        "chunk_text": chunk_text
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
        # Resolve names using hybrid fuzzy matching
        entity_a = self._resolve_hybrid_entity_name(entity_a, user_id)
        entity_b = self._resolve_hybrid_entity_name(entity_b, user_id)
        
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

                # Extract source_doc and page
                source_doc = ""
                page = 1
                if isinstance(rel, dict):
                    source_doc = rel.get("source_doc", "")
                    page = rel.get("page", 1)
                elif hasattr(rel, "get"):
                    source_doc = rel.get("source_doc", "")
                    page = rel.get("page", 1)
                else:
                    try:
                        source_doc = dict(rel).get("source_doc", "")
                        page = dict(rel).get("page", 1)
                    except Exception:
                        pass

                # Get chunk text from vector retriever
                chunk_text = ""
                if source_doc and page:
                    chunk_text = self.vector_retriever.get_chunk_by_page(source_doc, page, user_id) or ""

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
                    "page": page,
                    "chunk_text": chunk_text
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

            # Generate explanation for alternative paths
            alternative_paths_with_explanations = []
            for alt in alternative_paths[:2]:
                alt_steps = []
                for step in alt:
                    alt_steps.append(f"({step['source']}) --[{step['type']}]--> ({step['target']})")
                alt_details = "\n".join(alt_steps)
                
                try:
                    alt_response = self.chain.invoke({
                        "entity_a": entity_a,
                        "entity_b": entity_b,
                        "path_details": alt_details
                    })
                    alt_explanation = alt_response.content.strip()
                except Exception as alt_err:
                    logger.error("Failed to generate explanation for alt path: %s", str(alt_err))
                    alt_explanation = "Could not generate reasoning explanation for this alternative path."
                
                alternative_paths_with_explanations.append({
                    "hops": alt,
                    "explanation": alt_explanation
                })

            return {
                "found": True,
                "explanation": explanation,
                "path": serialized_path,
                "alternative_paths": alternative_paths_with_explanations,
                "hop_count": len(relationships)
            }

        except Exception as e:
            logger.error("Failed to execute path reasoning query: %s", str(e), exc_info=True)
            return {
                "found": False,
                "explanation": "An internal error occurred while analyzing the connection.",
                "path": []
            }

    def generate_query_variations(self, question: str) -> List[str]:
        """Generate 2 alternative variations of the query using the LLM with structured schema enforcement."""
        try:
            result: QueryVariations = self.variations_chain.invoke({"question": question})
            return [v.strip() for v in result.variations if v.strip()]
        except Exception as e:
            logger.error("Failed to generate query variations: %s", str(e))
            return []

    def find_all_reasoning_paths(self, query: str, primary_a: str, primary_b: str, user_id: str) -> Dict[str, Any]:
        """
        Runs query expansion to find multiple alternative connecting paths between entities related to the query.
        Returns the primary path with generated explanation, and other unique paths with empty explanations (for on-demand generation).
        """
        pairs_to_search = []
        if primary_a and primary_b:
            resolved_a = self._resolve_hybrid_entity_name(primary_a, user_id)
            resolved_b = self._resolve_hybrid_entity_name(primary_b, user_id)
            pairs_to_search.append((resolved_a, resolved_b))

        # Generate query variations using LLM if a natural language query is provided
        if query:
            variations = self.generate_query_variations(query)
            logger.info("Generated query variations: %s", variations)
            for var in variations:
                pair = self.extract_entities_from_query(var)
                if pair:
                    resolved_var_a = self._resolve_hybrid_entity_name(pair["entity_a"], user_id)
                    resolved_var_b = self._resolve_hybrid_entity_name(pair["entity_b"], user_id)
                    pair_tuple = (resolved_var_a, resolved_var_b)
                    if pair_tuple not in pairs_to_search:
                        pairs_to_search.append(pair_tuple)

        all_unique_paths = []
        seen_signatures = set()

        # Helper to generate path signature
        def get_signature(hops):
            return "-".join(f"{h.get('source') or h.get('from')}->{h.get('type') or h.get('rel')}->{h.get('target') or h.get('to')}" for h in hops)

        # First, search primary pair's alternative shortest paths
        if pairs_to_search:
            p_a, p_b = pairs_to_search[0]
            primary_res = self.explain_connection(p_a, p_b, user_id)
            if primary_res.get("found"):
                p_hops = primary_res["path"]
                sig = get_signature(p_hops)
                if sig not in seen_signatures:
                    seen_signatures.add(sig)
                    all_unique_paths.append({
                        "hops": p_hops,
                        "explanation": primary_res["explanation"]
                    })
                
                # Also check other shortest paths between the same pair
                alt_shortest = self.find_alternative_paths(p_a, p_b, user_id)
                for path in alt_shortest:
                    sig = get_signature(path)
                    if sig not in seen_signatures:
                        seen_signatures.add(sig)
                        all_unique_paths.append({
                            "hops": path,
                            "explanation": "" # Empty explanation for on-demand generation
                        })

        # Second, search paths for other query-expanded entity pairs
        for p_a, p_b in pairs_to_search[1:4]: # Limit to top 3 variations
            try:
                cypher = (
                    "MATCH p = shortestPath("
                    "  (a:Entity {name: $entity_a, user_id: $user_id})-[*..5]-(b:Entity {name: $entity_b, user_id: $user_id})"
                    ") "
                    "RETURN p"
                )
                records = self.neo4j_client.execute_query(cypher, {
                    "entity_a": p_a,
                    "entity_b": p_b,
                    "user_id": str(user_id)
                })
                if records and records[0].get("p"):
                    path_obj = records[0]["p"]
                    nodes, relationships = self._get_nodes_and_rels(path_obj)
                    path_steps = []
                    for i in range(len(relationships)):
                        now_name = dict(nodes[i]).get("name", "Unknown")
                        next_name = dict(nodes[i + 1]).get("name", "Unknown")
                        now_type = dict(nodes[i]).get("type", "Entity")
                        next_type = dict(nodes[i + 1]).get("type", "Entity")
                        rel = relationships[i]
                        rel_type = self._get_rel_type(rel)
                        
                        source_doc = ""
                        page = 1
                        if isinstance(rel, dict):
                            source_doc = rel.get("source_doc", "")
                            page = rel.get("page", 1)
                        elif hasattr(rel, "get"):
                            source_doc = rel.get("source_doc", "")
                            page = rel.get("page", 1)
                        else:
                            try:
                                source_doc = dict(rel).get("source_doc", "")
                                page = dict(rel).get("page", 1)
                            except Exception:
                                pass
                        
                        chunk_text = ""
                        if source_doc and page:
                            chunk_text = self.vector_retriever.get_chunk_by_page(source_doc, page, user_id) or ""

                        path_steps.append({
                            "source": now_name,
                            "source_type": now_type,
                            "target": next_name,
                            "target_type": next_type,
                            "type": rel_type,
                            "source_doc": source_doc,
                            "page": page,
                            "chunk_text": chunk_text
                        })

                    sig = get_signature(path_steps)
                    if sig not in seen_signatures:
                        seen_signatures.add(sig)
                        all_unique_paths.append({
                            "hops": path_steps,
                            "explanation": "" # Empty for on-demand generation
                        })
            except Exception as e:
                logger.error("Failed to query path for expanded pair (%s, %s): %s", p_a, p_b, str(e))

        # Third, if no paths found, run hybrid vector fallback search
        if not all_unique_paths and query:
            logger.info("No direct paths found. Executing hybrid vector-graph search fallback...")
            try:
                chunks = self.vector_retriever.retrieve_relevant_chunks(query, user_id, limit=5)
                
                # Fetch all existing entity names for this user from Neo4j
                all_entities_cypher = (
                    "MATCH (e:Entity {user_id: $user_id}) "
                    "RETURN DISTINCT e.name AS name, e.type AS type"
                )
                entity_records = self.neo4j_client.execute_query(all_entities_cypher, {"user_id": str(user_id)})
                known_entities = {r["name"]: r.get("type", "Entity") for r in entity_records if r.get("name")}
                
                # Scan chunks to find mentioned known entities
                mentioned_entities = []
                for chunk in chunks:
                    chunk_text = chunk.get("text", "")
                    for name in known_entities:
                        if name.lower() in chunk_text.lower():
                            if name not in mentioned_entities:
                                mentioned_entities.append(name)
                
                if len(mentioned_entities) >= 2:
                    logger.info("Hybrid fallback found entities in chunks: %s", mentioned_entities)
                    found_fallback = False
                    for i in range(len(mentioned_entities)):
                        for j in range(i + 1, min(len(mentioned_entities), 4)):
                            ent_a = mentioned_entities[i]
                            ent_b = mentioned_entities[j]
                            
                            cypher = (
                                "MATCH p = shortestPath("
                                "  (a:Entity {name: $entity_a, user_id: $user_id})-[*..5]-(b:Entity {name: $entity_b, user_id: $user_id})"
                                ") "
                                "RETURN p"
                            )
                            records = self.neo4j_client.execute_query(cypher, {
                                "entity_a": ent_a,
                                "entity_b": ent_b,
                                "user_id": str(user_id)
                            })
                            if records and records[0].get("p"):
                                path_obj = records[0]["p"]
                                nodes, relationships = self._get_nodes_and_rels(path_obj)
                                path_steps = []
                                for k in range(len(relationships)):
                                    now_name = dict(nodes[k]).get("name", "Unknown")
                                    next_name = dict(nodes[k + 1]).get("name", "Unknown")
                                    now_type = dict(nodes[k]).get("type", "Entity")
                                    next_type = dict(nodes[k + 1]).get("type", "Entity")
                                    rel = relationships[k]
                                    rel_type = self._get_rel_type(rel)
                                    
                                    source_doc = ""
                                    page = 1
                                    if isinstance(rel, dict):
                                        source_doc = rel.get("source_doc", "")
                                        page = rel.get("page", 1)
                                    elif hasattr(rel, "get"):
                                        source_doc = rel.get("source_doc", "")
                                        page = rel.get("page", 1)
                                    else:
                                        try:
                                            source_doc = dict(rel).get("source_doc", "")
                                            page = dict(rel).get("page", 1)
                                        except Exception:
                                            pass
                                    
                                    chunk_txt = ""
                                    if source_doc and page:
                                        chunk_txt = self.vector_retriever.get_chunk_by_page(source_doc, page, user_id) or ""

                                    path_steps.append({
                                        "source": now_name,
                                        "source_type": now_type,
                                        "target": next_name,
                                        "target_type": next_type,
                                        "type": rel_type,
                                        "source_doc": source_doc,
                                        "page": page,
                                        "chunk_text": chunk_txt
                                    })
                                
                                sig = get_signature(path_steps)
                                if sig not in seen_signatures:
                                    seen_signatures.add(sig)
                                    path_details = "\n".join(
                                        f"({step['source']} [{step.get('source_type', 'Entity')}]) --[{step['type']}]--> ({step['target']} [{step.get('target_type', 'Entity')}])"
                                        for step in path_steps
                                    )
                                    try:
                                        explain_res = self.chain.invoke({
                                            "entity_a": ent_a,
                                            "entity_b": ent_b,
                                            "path_details": path_details
                                        })
                                        explanation = explain_res.content.strip()
                                    except Exception:
                                        explanation = f"Connection between {ent_a} and {ent_b}."
                                    
                                    all_unique_paths.append({
                                        "hops": path_steps,
                                        "explanation": explanation
                                    })
                                    found_fallback = True
                                    
                                    # Query alternative paths between the fallback pair
                                    alt_paths = self.find_alternative_paths(ent_a, ent_b, user_id)
                                    for alt in alt_paths:
                                        alt_sig = get_signature(alt)
                                        if alt_sig not in seen_signatures:
                                            seen_signatures.add(alt_sig)
                                            all_unique_paths.append({
                                                "hops": alt,
                                                "explanation": ""
                                            })
                                    break
                            if found_fallback:
                                break
            except Exception as fallback_err:
                logger.error("Error in hybrid fallback search: %s", str(fallback_err), exc_info=True)

        if not all_unique_paths:
            return {
                "found": False,
                "explanation": "No connection path was found in the knowledge graph.",
                "path": [],
                "alternative_paths": [],
                "hop_count": 0
            }

        primary = all_unique_paths[0]
        alternatives = all_unique_paths[1:4] # Limit alternatives to top 3

        return {
            "found": True,
            "explanation": primary["explanation"],
            "path": primary["hops"],
            "alternative_paths": alternatives,
            "hop_count": len(primary["hops"])
        }
