import logging
import math
from typing import Dict, Any, List
from langchain_core.prompts import ChatPromptTemplate
from .llm_client import get_llm
from .graph_retriever import GraphRetriever
from .vector_retriever import VectorRetriever
from .hybrid_retriever import HybridRetriever
from .multihop_reasoner import MultiHopReasoner

logger = logging.getLogger(__name__)

# Cache retrievers to avoid reinitializing embedding models per request
_graph_retriever = None
_vector_retriever = None
_hybrid_retriever = None


class RAGChain:
    def __init__(self):
        logger.info("Initializing RAGChain answer generation service.")
        self.llm = get_llm(temperature=0.2)
        
        global _graph_retriever, _vector_retriever, _hybrid_retriever
        if _graph_retriever is None:
            _graph_retriever = GraphRetriever()
        if _vector_retriever is None:
            _vector_retriever = VectorRetriever()
        if _hybrid_retriever is None:
            _hybrid_retriever = HybridRetriever()

        self.graph_retriever = _graph_retriever
        self.vector_retriever = _vector_retriever
        self.hybrid_retriever = _hybrid_retriever
        self.multihop_reasoner = MultiHopReasoner()

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

    def generate_answer(self, query: str, user_id: str, mode: str = "hybrid", doc_ids: List[str] = None) -> Dict[str, Any]:
        """
        Retrieves context according to the selected mode, invokes the LLM, and returns the response.
        """
        mode = mode.lower()
        if mode not in ["vector", "graph", "hybrid"]:
            logger.warning("Invalid retrieval mode '%s' requested. Defaulting to 'hybrid'.", mode)
            mode = "hybrid"

        logger.info("Generating RAG answer in '%s' mode for query: '%s' (User: %s, Doc IDs: %s)", mode, query, user_id, doc_ids)

        # Resolve doc_ids to names
        doc_names = None
        if doc_ids:
            try:
                from graphrag.models import Document
                doc_names = list(Document.objects.filter(id__in=doc_ids).values_list('name', flat=True))
                logger.info("Resolved filter doc IDs to names: %s", doc_names)
            except Exception as e:
                logger.error("Failed to resolve doc_ids to names: %s", str(e))

        context = ""
        sources = []
        strategy_used = mode.upper()
        highlighted_entities = []

        # 1. Fetch Context depending on the Retrieval Mode
        try:
            if mode == "vector":
                chunks = self.vector_retriever.retrieve_relevant_chunks(query, user_id, limit=5, doc_names=doc_names)
                context_lines = []
                for c in chunks:
                    context_lines.append(f"Document: {c['source_doc']} (Page: {c['page']}): \"{c['text']}\"")
                    sources.append(f"{c['source_doc']} (Page {c['page']})")
                context = "### TEXT PASSAGES:\n" + "\n\n".join(context_lines)

            elif mode == "graph":
                graph_context = self.graph_retriever.retrieve_graph_context(query, user_id, hops=2, doc_names=doc_names)
                context = graph_context
                # Extract entity names as sources
                for line in graph_context.split("\n"):
                    if line.startswith("* **"):
                        ent_name = line.split("**")[1]
                        sources.append(f"Graph Node: {ent_name}")

            else:  # hybrid
                hybrid_result = self.hybrid_retriever.retrieve_combined_context(query, user_id, doc_names=doc_names)
                context = hybrid_result["combined_context"]
                strategy_used = hybrid_result["strategy"]
                
                # Gather sources from both channels
                for c in hybrid_result["vector_chunks"]:
                    sources.append(f"{c['source_doc']} (Page {c['page']})")
                for line in hybrid_result["graph_context"].split("\n"):
                    if line.startswith("* **"):
                        ent_name = line.split("**")[1]
                        sources.append(f"Graph Node: {ent_name}")

            # Extract entities from query for graph highlighting
            try:
                highlighted_entities = self.graph_retriever.extract_entities(query)
            except Exception:
                highlighted_entities = []

            # Also extract retrieved entities from the graph context to highlight them on the graph!
            if context:
                for line in context.split("\n"):
                    if line.startswith("* **"):
                        try:
                            ent_name = line.split("**")[1]
                            if ent_name not in highlighted_entities:
                                highlighted_entities.append(ent_name)
                        except Exception:
                            pass

        except Exception as e:
            logger.error("Failed to retrieve context in %s mode. Error: %s", mode, str(e), exc_info=True)
            return {
                "answer": f"**Context Retrieval Failed:**\n\nAn error occurred during the context retrieval phase. Details: {str(e)}",
                "context": "",
                "sources": [],
                "strategy": mode.upper(),
                "success": True,  # Return True to render this error details card in the UI
                "confidence": 0.0,
                "highlighted_entities": [],
                "paths": [],
                "hops": []
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

            # Calculate confidence based on answer quality and sources
            confidence = self._calculate_confidence(answer, sources)

            # Detect multi-hop queries and populate hops
            hops = []
            conclusion = ""
            if self.multihop_reasoner.is_multihop_query(query):
                try:
                    entity_pair = self.multihop_reasoner.extract_entities_from_query(query)
                    if entity_pair:
                        path_result = self.multihop_reasoner.explain_connection(
                            entity_pair["entity_a"],
                            entity_pair["entity_b"],
                            user_id
                        )
                        if path_result.get("found"):
                            # Map path steps to hops format
                            for step in path_result["path"]:
                                hops.append({
                                    "from": step["source"],
                                    "rel": step["type"],
                                    "to": step["target"],
                                    "doc": step.get("source_doc", "")
                                })
                            conclusion = path_result.get("explanation", "")
                            # Add path entities to highlighted entities
                            for step in path_result["path"]:
                                if step["source"] not in highlighted_entities:
                                    highlighted_entities.append(step["source"])
                                if step["target"] not in highlighted_entities:
                                    highlighted_entities.append(step["target"])
                except Exception as hop_err:
                    logger.warning("Multi-hop detection failed for query '%s': %s", query, str(hop_err))

            return {
                "answer": answer,
                "context": context,
                "sources": sources,
                "strategy": strategy_used,
                "success": True,
                "confidence": confidence,
                "highlighted_entities": highlighted_entities,
                "paths": [],
                "hops": hops,
                "conclusion": conclusion
            }
        except Exception as e:
            logger.error("Failed to generate LLM response: %s", str(e), exc_info=True)
            error_details = str(e)
            
            # Formulate user-friendly rate limit warning
            if "quota" in error_details.lower() or "429" in error_details:
                user_msg = (
                    "### ⚠️ LLM Rate Limit / Quota Exceeded\n\n"
                    "The primary LLM provider (Google Gemini API) returned a **429 RESOURCE_EXHAUSTED** error. "
                    "This occurs because the free-tier quota is fully exhausted by document ingestion or concurrent requests.\n\n"
                    "#### How to Fix This:\n"
                    "1. Go to your **Hugging Face Space Settings** $\rightarrow$ **Variables and secrets**.\n"
                    "2. Add a fallback API key: `GROQ_API_KEY` (Groq is free and has high limits) or `NVIDIA_API_KEY`.\n"
                    "3. The backend will automatically fall back and handle this query using the backup provider."
                )
            else:
                user_msg = f"### ❌ LLM Generation Failed\n\n{error_details}"

            return {
                "answer": user_msg,
                "context": context,
                "sources": sources,
                "strategy": strategy_used,
                "success": True,  # Return True to render this error details card in the UI
                "confidence": 0.0,
                "highlighted_entities": highlighted_entities,
                "paths": [],
                "hops": []
            }

    @staticmethod
    def _calculate_confidence(answer: str, sources: List[str]) -> float:
        if not answer or len(answer) < 10:
            return 0.0
        answer_score = min(len(answer) / 300, 0.7)
        source_score = min(len(sources) * 0.06, 0.3)
        return round(min(answer_score + source_score, 1.0), 2)
