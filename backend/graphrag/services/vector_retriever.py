import os
import logging
from typing import List
from django.conf import settings
import chromadb
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)

class VectorRetriever:
    def __init__(self):
        logger.info("Initializing VectorRetriever service.")
        
        # 1. Initialize Persistent ChromaDB Client
        self.persist_directory = os.path.join(settings.BASE_DIR, "db", "chromadb")
        os.makedirs(self.persist_directory, exist_ok=True)
        self.chroma_client = chromadb.PersistentClient(path=self.persist_directory)

        # 2. Load the Embedding Model (all-MiniLM-L6-v2)
        # Prioritizes CPU execution but supports CUDA if available
        self.embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            encode_kwargs={'normalize_embeddings': True}
        )

        # 3. Setup text splitter for document chunking
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=100,
            length_function=len
        )

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
            chunks = self.text_splitter.split_text(text_content)
            logger.info("Split document into %d vector chunks.", len(chunks))

            collection = self._get_user_collection(user_id)

            # Prepare inputs for ChromaDB
            ids = [f"{doc_name}_chunk_{i}" for i in range(len(chunks))]
            # Generate vector representations using sentence-transformers
            embeddings = self.embeddings.embed_documents(chunks)
            metadatas = [{"source_doc": doc_name, "page": (i // 2) + 1} for i in range(len(chunks))]

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

    def retrieve_relevant_chunks(self, query: str, user_id: str, limit: int = 5) -> List[dict]:
        """
        Queries ChromaDB to retrieve the most semantically relevant text passages.
        """
        logger.info("Searching ChromaDB for query: '%s' (Limit: %d, User: %s)", query, limit, user_id)
        try:
            collection = self._get_user_collection(user_id)
            query_vector = self.embeddings.embed_query(query)

            results = collection.query(
                query_embeddings=[query_vector],
                n_results=limit
            )

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
