import logging
from typing import List, Dict, Set
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

    def retrieve_graph_context(self, query: str, user_id: str, hops: int = 2) -> str:
        """
        Extracts entities from the query, traverses their Neo4j subgraphs,
        and returns a serialized text block representing the graph context.
        """
        logger.info("Retrieving graph context for query: '%s' (User: %s)", query, user_id)
        
        # 1. Extract entities from query using LLM
        query_entities = self._extract_entities_from_query(query)
        if not query_entities:
            logger.info("No entities extracted from user query. Returning empty graph context.")
            return ""

        logger.info("Extracted query entities: %s", query_entities)

        unique_nodes: Dict[str, dict] = {}
        unique_rels: Set[str] = set()

        # 2. Query Neo4j for each entity's neighborhood
        for entity_name in query_entities:
            try:
                paths = self.neo4j_client.get_entity_subgraph(entity_name, user_id, hops=hops)
                self._parse_subgraph_paths(paths, unique_nodes, unique_rels)
            except Exception as e:
                logger.error("Failed to query subgraph for entity: %s. Error: %s", entity_name, str(e))

        # 3. Serialize extracted graph information into a readable markdown string
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
        logger.info("Generated graph context (%d characters).", len(serialized_context))
        return serialized_context

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
                # Get connected nodes from the path
                start_node = nodes[rel.start_node.id if hasattr(rel.start_node, 'id') else 0]
                end_node = nodes[rel.end_node.id if hasattr(rel.end_node, 'id') else 0]
                
                start_name = dict(start_node).get("name", "Unknown")
                end_name = dict(end_node).get("name", "Unknown")
                
                rel_type = rel.type
                properties = dict(rel)
                desc = properties.get("description", "")
                conf = properties.get("confidence", 1.0)

                # Format edge output description
                desc_suffix = f" (Details: {desc})" if desc else ""
                rel_str = f"[{dict(start_node).get('type', 'Entity')}] **{start_name}** --[{rel_type} (Confidence: {conf})]--> [{dict(end_node).get('type', 'Entity')}] **{end_name}**{desc_suffix}"
                unique_rels.add(rel_str)
