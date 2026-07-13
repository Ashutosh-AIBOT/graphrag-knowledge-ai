import os
import uuid
import logging
from typing import List
from django.conf import settings
import chromadb
from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2

logger = logging.getLogger(__name__)

class VectorRetriever:
    def __init__(self):
        logger.info("Initializing VectorRetriever service.")
        
        # 1. Initialize Persistent ChromaDB Client
        self.persist_directory = getattr(settings, 'CHROMADB_DIR', os.path.join(settings.BASE_DIR, "chroma_db"))
        os.makedirs(self.persist_directory, exist_ok=True)
        self.chroma_client = chromadb.PersistentClient(path=self.persist_directory)

        # 2. Load the Embedding Model via ChromaDB's built-in ONNX path
        # Uses ONNX runtime only — no torch/CUDA needed, no sentence-transformers package
        self.embedding_fn = ONNXMiniLM_L6_V2(preferred_providers=["CPUExecutionProvider"])

        # 3. Setup text splitter for document chunking
        def chunk_text(text: str, chunk_size: int = 800, chunk_overlap: int = 100) -> List[str]:
            words = text.split()
            chunks = []
            start = 0
            while start < len(words):
                end = min(start + chunk_size, len(words))
                chunks.append(' '.join(words[start:end]))
                if end == len(words):
                    break
                start = end - chunk_overlap
            return chunks

        self.text_splitter = chunk_text

    def _get_user_collection(self, user_id):
        """
        Enforce multi-tenancy by returning a collection isolated for each user.
        """
        collection_name = f"user_collection_{str(user_id).replace('-', '_')}"
        return self.chroma_client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"} # Use cosine similarity
        )

    def index_document(self, text_content: str, doc_name: str, user_id: str):
        """
        Splits document text into chunks, generates embeddings, and saves them to ChromaDB.
        """
        if not text_content or not text_content.strip():
            logger.warning("Empty text content provided for vector indexing.")
            return

        logger.info("Starting vector indexing for document '%s' (User: %s)", doc_name, user_id)
        try:
            # Split text into chunks
            chunks = self.text_splitter(text_content)
            logger.info("Split document into %d vector chunks.", len(chunks))

            collection = self._get_user_collection(user_id)

            # Prepare inputs for ChromaDB
            doc_id = str(uuid.uuid4())[:8]
            ids = [f"{doc_id}_{doc_name}_chunk_{i}" for i in range(len(chunks))]
            # Generate vector representations using ONNX-based embedding
            embeddings = self.embedding_fn(chunks)
            metadatas = [{"source_doc": doc_name, "page": i + 1, "chunk_index": i} for i in range(len(chunks))]

            # Insert or update in ChromaDB
            collection.upsert(
                ids=ids,
                embeddings=embeddings,
                documents=chunks,
                metadatas=metadatas
            )
            logger.info("Successfully indexed %d chunks in ChromaDB for document: %s", len(chunks), doc_name)
        except Exception as e:
            logger.error("Failed to index document in ChromaDB. Error: %s", str(e), exc_info=True)
            raise e

    def retrieve_relevant_chunks(self, query: str, user_id: str, limit: int = 5, doc_names: List[str] = None) -> List[dict]:
        """
        Queries ChromaDB to retrieve the most semantically relevant text passages.
        """
        logger.info("Searching ChromaDB for query: '%s' (Limit: %d, User: %s, Docs: %s)", query, limit, user_id, doc_names)
        try:
            collection = self._get_user_collection(user_id)
            query_vector = self.embedding_fn([query])[0]

            query_params = {
                "query_embeddings": [query_vector],
                "n_results": limit
            }
            if doc_names:
                query_params["where"] = {"source_doc": {"$in": [str(d) for d in doc_names]}}

            results = collection.query(**query_params)

            retrieved = []
            if results and results["documents"]:
                documents = results["documents"][0]
                metadatas = results["metadatas"][0]
                distances = results["distances"][0] if "distances" in results else [0.0] * len(documents)

                for doc, meta, dist in zip(documents, metadatas, distances):
                    # Cosine distance (0.0 is exact match, 1.0 is opposite)
                    # Convert distance to a similarity score (1.0 - distance)
                    similarity = round(1.0 - dist, 4)
                    retrieved.append({
                        "text": doc,
                        "source_doc": meta.get("source_doc", "unknown"),
                        "page": meta.get("page", 1),
                        "similarity_score": similarity
                    })

            logger.info("Retrieved %d relevant text chunks from ChromaDB.", len(retrieved))
            return retrieved
        except Exception as e:
            logger.error("Error retrieving from ChromaDB: %s", str(e), exc_info=True)
            return []

    def get_chunk_by_page(self, doc_name: str, page: int, user_id: str) -> str:
        """
        Retrieves the verbatim text content of a specific page/chunk from ChromaDB.
        """
        try:
            collection = self._get_user_collection(user_id)
            results = collection.get(
                where={
                    "$and": [
                        {"source_doc": str(doc_name)},
                        {"page": int(page)}
                    ]
                },
                limit=1
            )
            if results and results["documents"]:
                return results["documents"][0]
        except Exception as e:
            logger.error("Error fetching chunk from ChromaDB for %s page %d: %s", doc_name, page, str(e))
        return ""

    def delete_document_vectors(self, doc_name: str, user_id: str):
        """
        Removes all vectors belonging to a deleted document.
        """
        logger.info("Deleting vectors for document '%s' from ChromaDB (User: %s)", doc_name, user_id)
        try:
            collection = self._get_user_collection(user_id)
            collection.delete(where={"source_doc": doc_name})
            logger.info("Successfully deleted all vectors for document '%s' from ChromaDB.", doc_name)
        except Exception as e:
            logger.error("Failed to delete document vectors from ChromaDB: %s", str(e), exc_info=True)
