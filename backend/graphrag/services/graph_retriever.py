import logging
from typing import List, Dict, Set, Any
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from .llm_client import get_llm
from .neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)

class QueryEntities(BaseModel):
    """
    List of key entities extracted from the search query.
    """
    entities: List[str] = Field(
        description="Key proper nouns, entities, products, technologies, or concepts extracted from the search query."
    )

class GraphRetriever:
    def __init__(self):
        logger.info("Initializing GraphRetriever service.")
        self.neo4j_client = Neo4jClient()
        self.llm = get_llm(temperature=0.0)
        self.structured_llm = self.llm.with_structured_output(QueryEntities)

        # Prompt instruction to isolate entity names
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an NLP entity extraction assistant. Your job is to extract a list of "
                "key entities (e.g., people, organizations, technologies, products, locations, concepts) "
                "specifically mentioned in the user's search query.\n\n"
                "Extract ONLY nouns and main topics that can be looked up in a database. Do not include verbs or questions."
            )),
            ("human", "Extract the key entities from this query:\n\n{query}")
        ])

        self.chain = self.prompt | self.structured_llm

    def retrieve_graph_context(self, query: str, user_id: str, hops: int = 2, doc_names: List[str] = None) -> str:
        """
        Extracts entities from the query, traverses their Neo4j subgraphs,
        and returns a serialized text block representing the graph context.
        Falls back to a keyword entity search if no exact entity match is found.
        """
        logger.info("Retrieving graph context for query: '%s' (User: %s, Docs: %s)", query, user_id, doc_names)
        
        # 1. Extract entities from query using LLM
        query_entities = self._extract_entities_from_query(query)
        logger.info("Extracted query entities: %s", query_entities)

        unique_nodes: Dict[str, dict] = {}
        unique_rels: Set[str] = set()

        # 2. Query Neo4j for each entity's neighborhood
        for entity_name in query_entities:
            try:
                paths = self.neo4j_client.get_entity_subgraph(entity_name, user_id, hops=hops, doc_names=doc_names)
                self._parse_subgraph_paths(paths, unique_nodes, unique_rels)
            except Exception as e:
                logger.error("Failed to query subgraph for entity: %s. Error: %s", entity_name, str(e))

        # 3. FALLBACK: If no graph nodes found from entity extraction, try keyword search
        # This handles broad queries like "list all persons" or "what companies are mentioned"
        if not unique_nodes:
            logger.info("No exact entity matches — falling back to keyword search across graph.")
            try:
                # Search across all entity names using the query words as keywords
                keywords = [w for w in query.split() if len(w) > 3]
                search_hits = []
                for kw in keywords[:5]:  # Limit to 5 keywords
                    results = self.neo4j_client.search_entities(kw, user_id, limit=10)
                    search_hits.extend(results)
                
                # De-duplicate by name
                seen = set()
                for hit in search_hits:
                    name = hit.get("name", "")
                    if name and name not in seen:
                        seen.add(name)
                        unique_nodes[name] = {
                            "type": hit.get("type", "Unknown"),
                            "description": hit.get("description", "")
                        }

                # If still nothing, do a broad entity-type match (e.g., "person" → fetch all PERSON nodes)
                if not unique_nodes:
                    entity_type_map = {
                        "person": "PERSON", "people": "PERSON", "persons": "PERSON",
                        "company": "ORGANIZATION", "companies": "ORGANIZATION", "organizations": "ORGANIZATION",
                        "product": "PRODUCT", "products": "PRODUCT",
                        "technology": "TECHNOLOGY", "technologies": "TECHNOLOGY",
                        "location": "LOCATION", "locations": "LOCATION",
                        "event": "EVENT", "events": "EVENT",
                        "concept": "CONCEPT", "concepts": "CONCEPT",
                    }
                    query_lower = query.lower()
                    target_type = None
                    for kw, etype in entity_type_map.items():
                        if kw in query_lower:
                            target_type = etype
                            break
                    
                    if target_type:
                        type_results = self.neo4j_client.execute_query(
                            "MATCH (e:Entity {user_id: $user_id, type: $type}) "
                            "RETURN e.name AS name, e.type AS type, e.description AS description "
                            "LIMIT 30",
                            {"user_id": str(user_id), "type": target_type}
                        )
                        for r in type_results:
                            name = r.get("name", "")
                            if name:
                                unique_nodes[name] = {
                                    "type": r.get("type", "Unknown"),
                                    "description": r.get("description", "")
                                }
            except Exception as e:
                logger.error("Keyword fallback search failed: %s", str(e))

        # 4. Serialize extracted graph information into a readable markdown string
        if not unique_nodes:
            logger.info("No matching entities or paths found in the graph for query.")
            return ""

        context_lines = ["### STRUCTURED KNOWLEDGE GRAPH CONTEXT\n"]
        
        context_lines.append("#### Entities:")
        for name, info in unique_nodes.items():
            context_lines.append(f"* **{name}** ({info.get('type', 'Unknown')}): {info.get('description', '')}")

        if unique_rels:
            context_lines.append("\n#### Relationships:")
            for rel in sorted(unique_rels):
                context_lines.append(f"* {rel}")

        serialized_context = "\n".join(context_lines)
        logger.info("Generated graph context (%d characters, %d entities).", len(serialized_context), len(unique_nodes))
        return serialized_context

    def get_graph_as_json(self, user_id: str, doc_ids: List[str] = None) -> Dict[str, Any]:
        """
        Serializes the full graph as JSON for frontend visualization.
        Endpoint: GET /api/graph/
        """
        raw_data = self.neo4j_client.get_all_graph_data(user_id, doc_ids=doc_ids)

        nodes = []
        for node in raw_data["nodes"]:
            nodes.append({
                "id": node["name"],
                "name": node["name"],
                "type": node.get("type", "Unknown"),
                "description": node.get("description", ""),
                "source_doc": node.get("source_doc", ""),
                "page": node.get("page", 0),
                "val": node.get("connections", 1)
            })

        edges = []
        for edge in raw_data["edges"]:
            edges.append({
                "source": edge["source"],
                "target": edge["target"],
                "type": edge["relationship_type"],
                "description": edge.get("description", ""),
                "confidence": edge.get("confidence", 1.0),
                "source_doc": edge.get("source_doc", "")
            })

        return {"nodes": nodes, "edges": edges}

    def extract_entities(self, query: str) -> List[str]:
        return self._extract_entities_from_query(query)

    def _extract_entities_from_query(self, query: str) -> List[str]:
        """
        Uses the LLM structured call to parse entity search terms.
        """
        try:
            result: QueryEntities = self.chain.invoke({"query": query})
            return [name.strip() for name in result.entities if name.strip()]
        except Exception as e:
            logger.error("Failed to extract entities from query. Error: %s", str(e), exc_info=True)
            return []

    def _parse_subgraph_paths(self, paths: List[dict], unique_nodes: Dict[str, dict], unique_rels: Set[str]):
        """
        Helper method to iterate through Neo4j path dictionaries and extract node & edge properties.
        """
        for record in paths:
            path_obj = record.get("path")
            if not path_obj:
                continue

            # In the neo4j python driver, a path contains nodes and relationships
            nodes = path_obj.nodes
            relationships = path_obj.relationships

            # 1. Parse all nodes in this path segment
            for node in nodes:
                properties = dict(node)
                name = properties.get("name")
                if name:
                    # Store unique node info
                    unique_nodes[name] = {
                        "type": properties.get("type", "Unknown"),
                        "description": properties.get("description", "")
                    }

            # 2. Parse all relationship edges in this path segment
            for rel in relationships:
                # Use property-based lookup instead of rel.start_node.id (which is internal Neo4j ID)
                start_props = dict(rel.start_node) if hasattr(rel, 'start_node') else {}
                end_props = dict(rel.end_node) if hasattr(rel, 'end_node') else {}

                start_name = start_props.get("name", "Unknown")
                end_name = end_props.get("name", "Unknown")

                rel_type = rel.type
                rel_props = dict(rel)
                desc = rel_props.get("description", "")
                conf = rel_props.get("confidence", 1.0)

                # Format edge output description
                desc_suffix = f" (Details: {desc})" if desc else ""
                rel_str = (
                    f"[{start_props.get('type', 'Entity')}] **{start_name}** "
                    f"--[{rel_type} (Confidence: {conf})]--> "
                    f"[{end_props.get('type', 'Entity')}] **{end_name}**{desc_suffix}"
                )
                unique_rels.add(rel_str)
