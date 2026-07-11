import logging
from typing import List
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from .llm_client import get_llm

logger = logging.getLogger(__name__)

class Entity(BaseModel):
    """
    Represents a single extracted entity from the document text.
    """
    name: str = Field(
        description="The canonical name of the entity, correctly capitalized (e.g., 'Google', 'John Smith'). Do not use pronouns or generic words."
    )
    type: str = Field(
        description="The category of the entity. Must be exactly one of: PERSON, ORGANIZATION, PRODUCT, TECHNOLOGY, LOCATION, EVENT, DATE, CONCEPT, DOCUMENT"
    )
    description: str = Field(
        description="A brief 1-2 sentence description explaining who or what this entity is, based strictly on the text chunk."
    )

class ExtractedEntities(BaseModel):
    """
    Container list of all extracted entities.
    """
    entities: List[Entity]

class EntityExtractor:
    def __init__(self):
        logger.info("Initializing EntityExtractor service.")
        self.llm = get_llm(temperature=0.0)
        # Binds the LLM to output structured JSON matching our Pydantic schema
        self.structured_llm = self.llm.with_structured_output(ExtractedEntities)

        # Build prompt instructions
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert knowledge extraction agent. Your job is to read the provided text chunk "
                "and extract all key entities.\n\n"
                "Strict rules:\n"
                "1. Entity Type: Each entity must belong to one of these types: PERSON, ORGANIZATION, PRODUCT, "
                "TECHNOLOGY, LOCATION, EVENT, DATE, CONCEPT, DOCUMENT.\n"
                "2. Name Canonicalization: Extract names in their canonical, capitalized form. Avoid pronouns ('he', 'she', 'it') "
                "and generic descriptors ('the company', 'the engineer').\n"
                "3. Grounding: Descriptions must be factual and derived strictly from the text provided."
            )),
            ("human", "Extract all key entities from this text chunk:\n\n{text_content}")
        ])

        # Chain prompt with structured model execution
        self.chain = self.prompt | self.structured_llm

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((ConnectionError, TimeoutError, OSError)),
        reraise=True
    )
    def extract_entities(self, text_content: str) -> List[dict]:
        """
        Processes a string chunk of text and returns a list of serialized entity dicts.
        Retries on transient connection errors with exponential backoff.
        Raises on LLM failures to let graph_builder.py mark document as FAILED.
        """
        if not text_content or not text_content.strip():
            logger.warning("Empty text chunk provided to extract_entities.")
            return []

        word_count = len(text_content.split())
        logger.info("Running entity extraction on text chunk (Words: %d).", word_count)

        result: ExtractedEntities = self.chain.invoke({"text_content": text_content})
        extracted = [entity.model_dump() for entity in result.entities]
        logger.info("Successfully extracted %d entities from text chunk.", len(extracted))
        return extracted
