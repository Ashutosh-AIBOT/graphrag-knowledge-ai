import os
import logging
from typing import List
from ..models import Document
from .neo4j_client import Neo4jClient
from .entity_extractor import EntityExtractor
from .relationship_extractor import RelationshipExtractor
from .entity_resolver import EntityResolver
from .vector_retriever import VectorRetriever


logger = logging.getLogger(__name__)


class GraphBuilder:
    def __init__(self):
        logger.info("Initializing GraphBuilder orchestrator service.")
        self.neo4j_client = Neo4jClient()
        self.entity_extractor = EntityExtractor()
        self.relationship_extractor = RelationshipExtractor()
        self.entity_resolver = EntityResolver()
        self.vector_retriever = VectorRetriever()

    def process_document(self, document_id, user_id):
        """
        Orchestrates the entire GraphRAG ingestion pipeline.
        Reads file, extracts entities & relationships, resolves duplicates, and writes to Neo4j.
        """
        try:
            doc = Document.objects.get(id=document_id)
        except Document.DoesNotExist:
            logger.error("Document with ID %s does not exist. Ingestion aborted.", document_id)
            return

        logger.info("Beginning background graph building for Document: %s (User ID: %s)", doc.name, user_id)
        
        # 1. Update status to PROCESSING
        doc.status = Document.Status.PROCESSING
        doc.save()

        try:
            filepath = doc.file.path
            if not os.path.exists(filepath):
                raise FileNotFoundError(f"File not found on disk: {filepath}")

            # 2. Parse file into sections/pages
            sections = self._parse_file_to_sections(filepath)
            logger.info("Parsed document into %d sections for analysis.", len(sections))

            # 2b. Index document text in ChromaDB vector store
            full_text = "\n\n".join([sec["text"] for sec in sections])
            logger.info("Indexing document text in ChromaDB (Doc: %s, User: %s)...", doc.name, user_id)
            self.vector_retriever.index_document(
                text_content=full_text,
                doc_name=doc.name,
                user_id=user_id
            )

            all_entities = []
            all_relationships = []

            # 3. Perform Entity and Relationship Extraction per section
            for sec in sections:
                text = sec["text"]
                page = sec["page"]

                # Extract entities from this section
                ents = self.entity_extractor.extract_entities(text)
                for e in ents:
                    e["page"] = page
                    e["source_doc"] = doc.name
                all_entities.extend(ents)

                # Extract relationships from this section
                rels = self.relationship_extractor.extract_relationships(text)
                for r in rels:
                    r["page"] = page
                    r["source_doc"] = doc.name
                all_relationships.extend(rels)

            # 4. Run entity resolution (deduplicate entities and rewrite relationships)
            resolved_ents, rewritten_rels = self.entity_resolver.resolve_entities(
                all_entities, all_relationships
            )

            # 5. Store resolved nodes inside Neo4j
            logger.info("Writing %d resolved entities to Neo4j...", len(resolved_ents))
            for ent in resolved_ents:
                self.neo4j_client.create_entity_node(
                    name=ent["name"],
                    entity_type=ent["type"],
                    description=ent["description"],
                    user_id=user_id,
                    source_doc=ent["source_doc"],
                    page=ent["page"]
                )

            # 6. Store rewritten edges inside Neo4j
            logger.info("Writing %d rewritten relationships to Neo4j...", len(rewritten_rels))
            for rel in rewritten_rels:
                self.neo4j_client.create_relationship_edge(
                    source_name=rel["source_entity"],
                    target_name=rel["target_entity"],
                    rel_type=rel["relationship_type"],
                    description=rel["description"],
                    confidence=rel["confidence"],
                    user_id=user_id,
                    source_doc=rel["source_doc"],
                    page=rel["page"]
                )

            # 7. Update status to COMPLETED and record counts
            doc.entity_count = len(resolved_ents)
            doc.relationship_count = len(rewritten_rels)
            doc.status = Document.Status.COMPLETED
            doc.error_message = None
            doc.save()
            logger.info("Successfully finished building knowledge graph for Document: %s", doc.name)

        except Exception as e:
            logger.error("Failed to process document: %s. Error: %s", doc.name, str(e), exc_info=True)
            doc.status = Document.Status.FAILED
            doc.error_message = str(e)
            doc.save()

    def delete_document_data(self, document_id, user_id):
        """
        Cleans up and deletes associated Neo4j node/edge elements for a deleted document.
        """
        try:
            doc = Document.objects.get(id=document_id)
            logger.info("Triggering graph wipe for Document: %s (User ID: %s)", doc.name, user_id)
            
            # Wipe Neo4j Graph elements
            self.neo4j_client.delete_document_nodes(doc.name, user_id)
            
            # Wipe ChromaDB Vector elements
            self.vector_retriever.delete_document_vectors(doc.name, user_id)
            
            logger.info("Finished Graph cleanup for Document: %s", doc.name)
        except Document.DoesNotExist:
            logger.error("Document with ID %s does not exist. Cleanup aborted.", document_id)
        except Exception as e:
            logger.error("Failed to clean up graph data for Document ID: %s. Error: %s", 
                         document_id, str(e), exc_info=True)

    def _parse_file_to_sections(self, filepath: str) -> List[dict]:
        """
        Loads document file and splits content into page/paragraph sections.
        """
        ext = filepath.split(".")[-1].lower()
        sections = []

        if ext == "pdf":
            import pypdf
            reader = pypdf.PdfReader(filepath)
            for idx, page in enumerate(reader.pages):
                text = page.extract_text()
                if text and text.strip():
                    sections.append({
                        "text": text.strip(),
                        "page": idx + 1
                    })
        elif ext in ["docx", "doc"]:
            import docx
            doc = docx.Document(filepath)
            current_chunk = []
            section_idx = 1
            for p in doc.paragraphs:
                if p.text and p.text.strip():
                    current_chunk.append(p.text.strip())
                # Group every 3 paragraphs to ensure sufficient context is captured
                if len(current_chunk) >= 3:
                    sections.append({
                        "text": "\n".join(current_chunk),
                        "page": section_idx
                    })
                    current_chunk = []
                    section_idx += 1
            if current_chunk:
                sections.append({
                    "text": "\n".join(current_chunk),
                    "page": section_idx
                })
        else:
            # Default fallback for TXT, Markdown, etc.
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            # Split by double newlines
            paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
            for idx, p in enumerate(paragraphs):
                sections.append({
                    "text": p,
                    "page": idx + 1
                })

        return sections
