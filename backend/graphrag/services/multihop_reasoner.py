import logging
from typing import List, Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from .llm_client import get_llm
from .neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)

class MultiHopReasoner:
    def __init__(self):
        logger.info("Initializing MultiHopReasoner service.")
        self.neo4j_client = Neo4jClient()
        self.llm = get_llm(temperature=0.0)

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

    def explain_connection(self, entity_a: str, entity_b: str, user_id: str) -> Dict[str, Any]:
        """
        Finds the shortest path between two entities in Neo4j and uses the LLM to explain the connection.
        """
        logger.info("Finding connection between '%s' and '%s' (User: %s)", entity_a, entity_b, user_id)
        
        # 1. Fetch shortest path from Neo4j
        cypher = (
            "MATCH p = shortestPath("
            "  (a:Entity {name: $entity_a, user_id: $user_id})-[*..4]-(b:Entity {name: $entity_b, user_id: $user_id})"
            ") "
            "RETURN p"
        )
        params = {
            "entity_a": entity_a,
            "entity_b": entity_b,
            "user_id": str(user_id)
        }

        try:
            # New code
            records = self.neo4j_client.execute_query(cypher, params)
            if not records or not records[0].get("p"):
                logger.info("No connection path found between '%s' and '%s'.", entity_a, entity_b)
                return {
                    "found": False,
                    "explanation": f"No indirect connection (up to 4 hops) was found between '{entity_a}' and '{entity_b}' in the knowledge graph.",
                    "path": []
                }

            path_obj = records[0]["p"]
            nodes = path_obj.nodes
            relationships = path_obj.relationships

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
                
                rel_type = rel.type

                step_str = f"({now_name} [{now_type}]) --[{rel_type}]--> ({next_name} [{next_type}])"
                path_steps.append(step_str)
                
                # Keep tracking representation for the response payload
                serialized_path.append({
                    "source": now_name,
                    "source_type": now_type,
                    "target": next_name,
                    "target_type": next_type,
                    "type": rel_type
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

            return {
                "found": True,
                "explanation": explanation,
                "path": serialized_path
            }

        except Exception as e:
            logger.error("Failed to execute path reasoning query: %s", str(e), exc_info=True)
            return {
                "found": False,
                "explanation": f"An error occurred while analyzing the connection: {str(e)}",
                "path": []
            }
