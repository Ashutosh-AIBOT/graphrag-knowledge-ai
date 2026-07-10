import logging
from typing import List, Dict, Any
from .graph_retriever import GraphRetriever
from .vector_retriever import VectorRetriever

logger = logging.getLogger(__name__)

class HybridRetriever:
    def __init__(self):
        logger.info("Initializing HybridRetriever service.")
        self.graph_retriever = GraphRetriever()
        self.vector_retriever = VectorRetriever()

    def retrieve_combined_context(self, query: str, user_id: str, doc_names: List[str] = None) -> Dict[str, Any]:
        """
        Runs both graph and vector search and returns a combined context dictionary.
        Determines the retrieval strategy route (GRAPH_ONLY, VECTOR_ONLY, or HYBRID).
        """
        logger.info("Running hybrid retrieval for query: '%s' (User: %s, Docs: %s)", query, user_id, doc_names)

        # 1. Execute Graph Retrieval
        graph_context = ""
        try:
            graph_context = self.graph_retriever.retrieve_graph_context(query, user_id, hops=2, doc_names=doc_names)
        except Exception as e:
            logger.error("Graph retrieval failed during hybrid step. Error: %s", str(e))

        # 2. Execute Vector Retrieval
        vector_chunks = []
        try:
            vector_chunks = self.vector_retriever.retrieve_relevant_chunks(query, user_id, limit=4, doc_names=doc_names)
        except Exception as e:
            logger.error("Vector retrieval failed during hybrid step. Error: %s", str(e))

        # 3. Format Vector Text Chunks
        vector_context_lines = []
        if vector_chunks:
            vector_context_lines.append("### UNSTRUCTURED TEXT PASSAGES\n")
            for idx, chunk in enumerate(vector_chunks):
                vector_context_lines.append(
                    f"Document: {chunk['source_doc']} (Page: {chunk['page']}, Similarity: {chunk['similarity_score']}):\n"
                    f"\"{chunk['text'].strip()}\"\n"
                )
        vector_context = "\n".join(vector_context_lines)

        # 4. Auto-detect Strategy Route based on context availability
        strategy = "HYBRID"
        if graph_context and not vector_context:
            strategy = "GRAPH_ONLY"
            combined_context = graph_context
        elif vector_context and not graph_context:
            strategy = "VECTOR_ONLY"
            combined_context = vector_context
        elif not graph_context and not vector_context:
            strategy = "VECTOR_ONLY"  # Fallback
            combined_context = "No relevant context found in either the Graph or Vector databases."
        else:
            # Both exist: default hybrid blend
            strategy = "HYBRID"
            combined_context = (
                f"{graph_context}\n\n"
                f"{vector_context}"
            )

        logger.info("Selected retrieval strategy: %s for query: '%s'", strategy, query)
        
        return {
            "combined_context": combined_context,
            "graph_context": graph_context,
            "vector_context": vector_context,
            "vector_chunks": vector_chunks,
            "strategy": strategy
        }
