import logging
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from .llm_client import get_llm
from .neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)

class CypherQuery(BaseModel):
    """
    Structured container for the generated Cypher query.
    """
    cypher: str = Field(
        description="The executable Neo4j Cypher query. Must match the schema and strictly filter nodes and edges by user_id."
    )
    explanation: str = Field(
        description="A short explanation of what the query fetches from the graph."
    )

class NLToCypher:
    def __init__(self):
        logger.info("Initializing NLToCypher translator service.")
        self.neo4j_client = Neo4jClient()
        self.llm = get_llm(temperature=0.0)
        self.structured_llm = self.llm.with_structured_output(CypherQuery)

        self.prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert Neo4j Cypher query generator for a GraphRAG knowledge system.\n"
                "Your task is to convert a user's natural language question into a syntactically correct, read-only Cypher query.\n\n"
                "=== DATABASE SCHEMA ===\n"
                "Nodes:\n"
                "Label: :Entity\n"
                "Properties: name (String), type (String), description (String), source_doc (String), page (Integer), user_id (String)\n\n"
                "Relationships:\n"
                "Allowed Types: WORKS_AT, MANAGES, PART_OF, DEPENDS_ON, CREATED_BY, LOCATED_IN, RELATED_TO, COMPETES_WITH, PARTNER_OF, SUCCEEDED_BY\n"
                "Properties: description (String), confidence (Float), source_doc (String), page (Integer), user_id (String)\n\n"
                "=== CRITICAL RULES ===\n"
                "1. Multi-Tenancy Isolation: Every node and relationship in the query MUST filter by user_id. Use the parameter $user_id.\n"
                "   Example: MATCH (a:Entity {{user_id: $user_id}})-[r:DEPENDS_ON {{user_id: $user_id}}]->(b:Entity {{user_id: $user_id}})\n"
                "2. Read-Only: Never generate write, delete, or update operations (MERGE, CREATE, SET, DELETE, REMOVE, DETACH).\n"
                "3. Safe Return: Limit results to a maximum of 50 records to prevent performance degradation."
            )),
            ("human", "Translate this question into Cypher: '{question}'")
        ])

        self.chain = self.prompt | self.structured_llm

    def execute_nl_query(self, question: str, user_id: str) -> Dict[str, Any]:
        """
        Translates a natural language question to Cypher, runs it, and returns results.
        """
        logger.info("Translating question to Cypher: '%s' (User: %s)", question, user_id)
        
        try:
            # 1. Generate Cypher query
            result: CypherQuery = self.chain.invoke({"question": question})
            logger.info("Generated Cypher: %s", result.cypher)

            # 2. Execute on Neo4j using client
            # New code
            records = self.neo4j_client.execute_query(result.cypher, {"user_id": str(user_id)})
            logger.info("Executed Cypher successfully. Retrieved %d rows.", len(records))

            return {
                "cypher": result.cypher,
                "explanation": result.explanation,
                "records": records,
                "success": True
            }
        except Exception as e:
            logger.error("Failed to generate or execute Cypher query: %s", str(e), exc_info=True)
            return {
                "cypher": "",
                "explanation": "",
                "records": [],
                "success": False,
                "error": str(e)
            }
