import logging
from typing import List
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from .llm_client import get_llm

logger = logging.getLogger(__name__)

class Relationship(BaseModel):
    """
    Represents a directed link between a source entity and a target entity.
    """
    source_entity: str = Field(
        description="The exact name of the starting entity (e.g., 'John Smith'). Must refer to an actual entity."
    )
    relationship_type: str = Field(
        description="The category of link. Must be exactly one of: WORKS_AT, MANAGES, PART_OF, DEPENDS_ON, CREATED_BY, LOCATED_IN, RELATED_TO, COMPETES_WITH, PARTNER_OF, SUCCEEDED_BY"
    )
    target_entity: str = Field(
        description="The exact name of the destination entity (e.g., 'Acme Corp'). Must refer to an actual entity."
    )
    description: str = Field(
        description="A 1-2 sentence description explaining the nature or evidence of this relationship in the text."
    )
    confidence: float = Field(
        description="A decimal confidence score between 0.0 (unlikely/speculative) and 1.0 (explicitly stated)."
    )

class ExtractedRelationships(BaseModel):
    """
    Container list of all extracted relationships.
    """
    relationships: List[Relationship]

class RelationshipExtractor:
    def __init__(self):
        logger.info("Initializing RelationshipExtractor service.")
        self.llm = get_llm(temperature=0.0)
        self.structured_llm = self.llm.with_structured_output(ExtractedRelationships)

        self.prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert NLP systems agent specialized in relationship extraction for knowledge graphs.\n"
                "Your task is to identify key directed relationships between the entities present in the text.\n\n"
                "Strict rules:\n"
                "1. Relationship Type: Choose exactly one of: WORKS_AT, MANAGES, PART_OF, DEPENDS_ON, CREATED_BY, LOCATED_IN, RELATED_TO, COMPETES_WITH, PARTNER_OF, SUCCEEDED_BY.\n"
                "2. Grounding: Both the source_entity and target_entity must represent real entities. Avoid generic words.\n"
                "3. Confidence: Grade the strength of statement between 0.0 and 1.0."
            )),
            ("human", (
                "Identify all key relationships in the following text chunk:\n\n"
                "--- TEXT START ---\n"
                "{text_content}\n"
                "--- TEXT END ---"
            ))
        ])

        self.chain = self.prompt | self.structured_llm

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((ConnectionError, TimeoutError, OSError)),
        reraise=True
    )
    def extract_relationships(self, text_content: str) -> List[dict]:
        """
        Processes a string chunk of text and returns a list of serialized relationship dicts.
        Retries on transient connection errors with exponential backoff.
        Raises on LLM failures to let graph_builder.py mark document as FAILED.
        """
        if not text_content or not text_content.strip():
            logger.warning("Empty text chunk provided to extract_relationships.")
            return []

        word_count = len(text_content.split())
        logger.info("Running relationship extraction on text chunk (Words: %d).", word_count)

        result: ExtractedRelationships = self.chain.invoke({"text_content": text_content})
        extracted = [rel.model_dump() for rel in result.relationships]
        logger.info("Successfully extracted %d relationships from text chunk.", len(extracted))
        return extracted
