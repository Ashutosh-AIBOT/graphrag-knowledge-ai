import re
import logging
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from .llm_client import get_llm
from .neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)

# ----------------------------------------------------------------
# Cypher Injection Prevention — block write operations
# ----------------------------------------------------------------
FORBIDDEN_KEYWORDS = [
    'MERGE', 'CREATE', 'SET', 'DELETE', 'REMOVE', 'DETACH',
    'DROP', 'ALTER', 'INSERT', 'UPDATE', 'WRITE',
    'CALL', 'LOAD', 'PERIODIC', 'FOREACH', 'UNWIND',
    'SHOW', 'GRANT', 'REVOKE', 'CREATE INDEX', 'CREATE CONSTRAINT'
]

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

    @staticmethod
    def _validate_read_only(cypher: str) -> bool:
        """
        Returns True if the Cypher is read-only (safe), False if it contains write operations.
        Splits into words to avoid false positives (e.g., 'RESET' contains 'SET').
        """
        words = re.findall(r'\b\w+\b', cypher.upper())
        for keyword in FORBIDDEN_KEYWORDS:
            if keyword in words:
                return False
        return True

    @staticmethod
    def _validate_tenant_isolation(cypher: str) -> bool:
        """Ensure user_id filtering is present in the generated Cypher query."""
        normalized = cypher.upper()
        return 'USER_ID' in normalized or '$USER_ID' in normalized

    def execute_nl_query(self, question: str, user_id: str) -> Dict[str, Any]:
        """
        Translates a natural language question to Cypher, runs it, and returns results.
        """
        logger.info("Translating question to Cypher: '%s' (User: %s)", question, user_id)

        try:
            # 1. Generate Cypher query
            result: CypherQuery = self.chain.invoke({"question": question})
            logger.info("Generated Cypher: %s", result.cypher)

            # 2. Validate read-only (prevent Cypher injection)
            if not self._validate_read_only(result.cypher):
                logger.warning("BLOCKED write Cypher query: %s", result.cypher)
                return {
                    "cypher": result.cypher,
                    "explanation": "Query blocked: only read-only Cypher queries are allowed.",
                    "records": [],
                    "success": False,
                    "error": "Generated query contains write operations. Only read queries are permitted."
                }

            # 3. Validate tenant isolation (prevent cross-user data access)
            if not self._validate_tenant_isolation(result.cypher):
                logger.warning("BLOCKED Cypher query without tenant isolation: %s", result.cypher)
                return {
                    "cypher": result.cypher,
                    "explanation": "Query blocked: must filter by user_id for multi-tenancy isolation.",
                    "records": [],
                    "success": False,
                    "error": "Generated query must include user_id filtering."
                }

            # 4. Execute on Neo4j using client
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
                "error": "An internal error occurred while processing your query."
            }
