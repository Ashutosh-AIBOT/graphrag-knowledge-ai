import os
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
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

    def _update_progress(self, doc, step: str, progress: int):
        """Update document processing progress for frontend polling."""
        doc.processing_step = step
        doc.processing_progress = progress
        doc.save(update_fields=['processing_step', 'processing_progress'])

    def _batch_create_entities(self, entities: List[dict], user_id: str, document_id: str):
        """Batch create entities using UNWIND to reduce N+1 queries."""
        if not entities:
            return
        batch_size = 50
        for i in range(0, len(entities), batch_size):
            batch = entities[i:i + batch_size]
            query = (
                "UNWIND $entities AS ent "
                "MERGE (e:Entity {name: ent.name, user_id: $user_id}) "
                "ON CREATE SET e.type = ent.type, e.description = ent.description, "
                "              e.source_doc = ent.source_doc, e.source_doc_id = $document_id, e.page = ent.page, e.created_at = timestamp() "
                "ON MATCH SET e.description = coalesce(e.description, ent.description), e.source_doc_id = $document_id, e.source_doc = ent.source_doc"
            )
            params = {
                "entities": [
                    {
                        "name": e["name"].strip(),
                        "type": e["type"].strip(),
                        "description": e["description"].strip(),
                        "source_doc": e.get("source_doc", ""),
                        "page": e.get("page", 0)
                    }
                    for e in batch
                ],
                "user_id": str(user_id),
                "document_id": str(document_id)
            }
            self.neo4j_client.execute_query(query, params)

    def _batch_create_relationships(self, relationships: List[dict], user_id: str, document_id: str):
        """Batch create relationships grouped by type using UNWIND."""
        if not relationships:
            return
        from .neo4j_client import VALID_RELATIONSHIP_TYPES

        # Group relationships by type
        grouped: dict[str, list] = {}
        for rel in relationships:
            rel_type = rel["relationship_type"].upper().strip()
            if rel_type not in VALID_RELATIONSHIP_TYPES:
                rel_type = "RELATED_TO"
            grouped.setdefault(rel_type, []).append(rel)

        for rel_type, rels in grouped.items():
            batch_size = 50
            for i in range(0, len(rels), batch_size):
                batch = rels[i:i + batch_size]
                query = (
                    "UNWIND $rels AS rel "
                    "MATCH (source:Entity {name: rel.source, user_id: $user_id}) "
                    "MATCH (target:Entity {name: rel.target, user_id: $user_id}) "
                    f"MERGE (source)-[r:{rel_type}]->(target) "
                    "ON CREATE SET r.description = rel.description, r.confidence = rel.confidence, "
                    "              r.source_doc = rel.source_doc, r.source_doc_id = $document_id, r.page = rel.page, r.created_at = timestamp() "
                    "ON MATCH SET r.source_doc_id = $document_id, r.source_doc = rel.source_doc "
                    "RETURN r LIMIT 1"
                )
                params = {
                    "rels": [
                        {
                            "source": rel["source_entity"].strip(),
                            "target": rel["target_entity"].strip(),
                            "description": rel["description"].strip(),
                            "confidence": float(rel["confidence"]),
                            "source_doc": rel.get("source_doc", ""),
                            "page": rel.get("page", 0)
                        }
                        for rel in batch
                    ],
                    "user_id": str(user_id),
                    "document_id": str(document_id)
                }
                self.neo4j_client.execute_query(query, params)

    def process_document(self, document_id, user_id):
        """
        Orchestrates the entire GraphRAG ingestion pipeline.
        Reads file, extracts entities & relationships, resolves duplicates, and writes to Neo4j.
        Updates processing_progress and processing_step at each stage for frontend polling.
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
            self._update_progress(doc, "Parsing document...", 5)
            sections = self._parse_file_to_sections(filepath)
            logger.info("Parsed document into %d sections for analysis.", len(sections))

            # 2b. Index document text in ChromaDB vector store
            self._update_progress(doc, "Indexing vectors in ChromaDB...", 15)
            full_text = "\n\n".join([sec["text"] for sec in sections])
            logger.info("Indexing document text in ChromaDB (Doc: %s, User: %s)...", doc.name, user_id)
            self.vector_retriever.index_document(
                text_content=full_text,
                doc_name=doc.name,
                user_id=user_id
            )

            all_entities = []
            all_relationships = []
            all_entities_lock = threading.Lock()
            all_relationships_lock = threading.Lock()
            total_sections = len(sections)

            def process_section(sec: dict) -> tuple[List[dict], List[dict]]:
                """Process a single section: extract entities and relationships."""
                import time
                text = sec["text"]
                page = sec["page"]
                time.sleep(2)
                ents = self.entity_extractor.extract_entities(text)
                for e in ents:
                    e["page"] = page
                    e["source_doc"] = doc.name
                time.sleep(2)
                rels = self.relationship_extractor.extract_relationships(text)
                for r in rels:
                    r["page"] = page
                    r["source_doc"] = doc.name
                return ents, rels

            # 3. Perform Entity and Relationship Extraction per section (parallel)
            completed = 0
            failed_count = 0
            last_error = None
            with ThreadPoolExecutor(max_workers=1) as executor:
                futures = {executor.submit(process_section, sec): sec for sec in sections}
                for future in as_completed(futures):
                    try:
                        ents, rels = future.result()
                        with all_entities_lock:
                            all_entities.extend(ents)
                        with all_relationships_lock:
                            all_relationships.extend(rels)
                    except Exception as e:
                         logger.error("Section processing failed: %s", str(e))
                         failed_count += 1
                         last_error = e
                    completed += 1
                    extraction_progress = 20 + int(55 * (completed / total_sections)) if total_sections > 0 else 20
                    self._update_progress(doc, f"Extracting entities... ({completed}/{total_sections})", extraction_progress)

            if failed_count == total_sections and total_sections > 0:
                raise RuntimeError(f"All sections failed to process. Last error: {last_error}")

            # 4. Run entity resolution (deduplicate entities and rewrite relationships)
            self._update_progress(doc, "Resolving duplicates...", 80)
            resolved_ents, rewritten_rels = self.entity_resolver.resolve_entities(
                all_entities, all_relationships
            )

            # 5. Batch store resolved nodes inside Neo4j
            self._update_progress(doc, "Building knowledge graph...", 85)
            logger.info("Writing %d resolved entities to Neo4j...", len(resolved_ents))
            self._batch_create_entities(resolved_ents, user_id, document_id)

            # 6. Batch store rewritten edges inside Neo4j
            self._update_progress(doc, "Writing relationships...", 92)
            logger.info("Writing %d rewritten relationships to Neo4j...", len(rewritten_rels))
            self._batch_create_relationships(rewritten_rels, user_id, document_id)

            # 7. Update status to COMPLETED and record counts
            doc.entity_count = len(resolved_ents)
            doc.relationship_count = len(rewritten_rels)
            doc.status = Document.Status.COMPLETED
            doc.error_message = None
            doc.processing_progress = 100
            doc.processing_step = "Complete"
            doc.save()
            logger.info("Successfully finished building knowledge graph for Document: %s", doc.name)

        except Exception as e:
            logger.error("Failed to process document: %s. Error: %s", doc.name, str(e), exc_info=True)
            doc.status = Document.Status.FAILED
            doc.error_message = str(e)
            doc.processing_step = f"Failed: {str(e)[:100]}"
            doc.save()

    def delete_document_data(self, document_id, user_id):
        """
        Cleans up and deletes associated Neo4j node/edge elements for a deleted document.
        Attempts both graph and vector cleanup independently to avoid orphaned data.
        """
        try:
            doc = Document.objects.get(id=document_id)
            logger.info("Triggering graph wipe for Document: %s (User ID: %s)", doc.name, user_id)

            # Attempt both cleanups independently
            neo4j_ok = True
            vector_ok = True

            try:
                self.neo4j_client.delete_document_nodes(doc.id, user_id)
            except Exception as e:
                logger.error("Neo4j cleanup failed for Document: %s. Error: %s", doc.name, str(e))
                neo4j_ok = False

            try:
                self.vector_retriever.delete_document_vectors(doc.name, user_id)
            except Exception as e:
                logger.error("ChromaDB cleanup failed for Document: %s. Error: %s", doc.name, str(e))
                vector_ok = False

            if neo4j_ok and vector_ok:
                logger.info("Finished Graph cleanup for Document: %s", doc.name)
            else:
                logger.warning("Partial cleanup for Document: %s (Neo4j: %s, Vector: %s)",
                               doc.name, "OK" if neo4j_ok else "FAIL", "OK" if vector_ok else "FAIL")

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
            current_len = 0
            section_idx = 1
            for p in doc.paragraphs:
                txt = p.text.strip() if p.text else ""
                if txt:
                    current_chunk.append(txt)
                    current_len += len(txt)
                    if current_len >= 1500:
                        sections.append({
                            "text": "\n".join(current_chunk),
                            "page": section_idx
                        })
                        current_chunk = []
                        current_len = 0
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
            current_chunk = []
            current_len = 0
            section_idx = 1
            for p in paragraphs:
                current_chunk.append(p)
                current_len += len(p)
                if current_len >= 1500:
                    sections.append({
                        "text": "\n\n".join(current_chunk),
                        "page": section_idx
                    })
                    current_chunk = []
                    current_len = 0
                    section_idx += 1
            if current_chunk:
                sections.append({
                    "text": "\n\n".join(current_chunk),
                    "page": section_idx
                })

        return sections
