import logging
from typing import Dict, Any, List
from langchain_core.prompts import ChatPromptTemplate
from .llm_client import get_llm
from .graph_retriever import GraphRetriever
from .vector_retriever import VectorRetriever
from .hybrid_retriever import HybridRetriever

logger = logging.getLogger(__name__)

class RAGChain:
    def __init__(self):
        logger.info("Initializing RAGChain answer generation service.")
        self.llm = get_llm(temperature=0.2) # Low temperature for high factual accuracy
        
        self.graph_retriever = GraphRetriever()
        self.vector_retriever = VectorRetriever()
        self.hybrid_retriever = HybridRetriever()

        # Define prompts for each mode
        self.system_prompts = {
            "vector": (
                "You are an AI assistant answering questions based ONLY on the provided text passages.\n"
                "Strict Rules:\n"
                "1. Base your answer ONLY on the provided unstructured text passages.\n"
                "2. If the passages do not contain enough information to answer, state that you do not know.\n"
                "3. Cite the document names and pages where applicable."
            ),
            "graph": (
                "You are an AI assistant answering questions based ONLY on the provided structured knowledge graph.\n"
                "Strict Rules:\n"
                "1. Base your answer ONLY on the provided entities and relationship paths.\n"
                "2. Do not assume or extrapolate connections not shown in the graph context.\n"
                "3. If the graph does not contain the answer, state that you do not know."
            ),
            "hybrid": (
                "You are an AI assistant answering questions using a combination of a structured knowledge graph and unstructured text passages.\n"
                "Strict Rules:\n"
                "1. Synthesize information from both the entities/relationships and the text passages.\n"
                "2. If there is a contradiction, prioritize the structured relationship links from the graph context.\n"
                "3. Cite sources (documents, pages, or entities) to back up your facts."
            )
        }

    def generate_answer(self, query: str, user_id: str, mode: str = "hybrid") -> Dict[str, Any]:
        """
        Retrieves context according to the selected mode, invokes the LLM, and returns the response.
        """
        mode = mode.lower()
        if mode not in ["vector", "graph", "hybrid"]:
            logger.warning("Invalid retrieval mode '%s' requested. Defaulting to 'hybrid'.", mode)
            mode = "hybrid"

        logger.info("Generating RAG answer in '%s' mode for query: '%s' (User: %s)", mode, query, user_id)

        context = ""
        sources = []
        strategy_used = mode.upper()

        # 1. Fetch Context depending on the Retrieval Mode
        try:
            if mode == "vector":
                chunks = self.vector_retriever.retrieve_relevant_chunks(query, user_id, limit=5)
                context_lines = []
                for c in chunks:
                    context_lines.append(f"Document: {c['source_doc']} (Page: {c['page']}): \"{c['text']}\"")
                    sources.append(f"{c['source_doc']} (Page {c['page']})")
                context = "### TEXT PASSAGES:\n" + "\n\n".join(context_lines)

            elif mode == "graph":
                graph_context = self.graph_retriever.retrieve_graph_context(query, user_id, hops=2)
                context = graph_context
                # Extract entity names as sources
                for line in graph_context.split("\n"):
                    if line.startswith("* **"):
                        ent_name = line.split("**")[1]
                        sources.append(f"Graph Node: {ent_name}")

            else:  # hybrid
                hybrid_result = self.hybrid_retriever.retrieve_combined_context(query, user_id)
                context = hybrid_result["combined_context"]
                strategy_used = hybrid_result["strategy"]
                
                # Gather sources from both channels
                for c in hybrid_result["vector_chunks"]:
                    sources.append(f"{c['source_doc']} (Page {c['page']})")
                for line in hybrid_result["graph_context"].split("\n"):
                    if line.startswith("* **"):
                        ent_name = line.split("**")[1]
                        sources.append(f"Graph Node: {ent_name}")

        except Exception as e:
            logger.error("Failed to retrieve context in %s mode. Error: %s", mode, str(e), exc_info=True)
            return {
                "answer": "An error occurred during context retrieval phase.",
                "context": "",
                "sources": [],
                "strategy": mode.upper(),
                "success": False
            }

        # 2. Build Chat Prompt template
        system_instructions = self.system_prompts.get(mode, self.system_prompts["hybrid"])
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_instructions),
            ("human", (
                "CONTEXT:\n"
                "---------------------\n"
                "{context}\n"
                "---------------------\n\n"
                "QUESTION: {query}"
            ))
        ])

        # 3. Call LLM
        try:
            chain = prompt | self.llm
            response = chain.invoke({
                "context": context if context else "No context available.",
                "query": query
            })
            answer = response.content.strip()

            # Deduplicate sources list
            sources = list(sorted(set(sources)))

            return {
                "answer": answer,
                "context": context,
                "sources": sources,
                "strategy": strategy_used,
                "success": True
            }
        except Exception as e:
            logger.error("Failed to generate LLM response: %s", str(e), exc_info=True)
            return {
                "answer": f"Failed to generate answer. Error: {str(e)}",
                "context": context,
                "sources": sources,
                "strategy": strategy_used,
                "success": False
            }
