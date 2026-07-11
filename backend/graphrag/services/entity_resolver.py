import logging
from typing import List, Dict, Optional
from rapidfuzz import fuzz

logger = logging.getLogger(__name__)

class EntityResolver:
    def __init__(self, similarity_threshold: float = 85.0):
        self.similarity_threshold = similarity_threshold
        self.llm = None
        self._init_llm()
        logger.info("Initializing EntityResolver with similarity threshold: %.1f", self.similarity_threshold)

    def _init_llm(self):
        """Initialize LLM for borderline disambiguation. Caches the instance."""
        try:
            from .llm_client import get_llm
            self.llm = get_llm(temperature=0.0)
        except Exception as e:
            logger.warning("Could not initialize LLM for entity disambiguation: %s", str(e))
            self.llm = None

    def resolve_entities(self, entities: List[dict], relationships: List[dict]) -> tuple[List[dict], List[dict]]:
        """
        Deduplicates a list of entities and rewrites relationship references accordingly.
        Returns a tuple of (resolved_entities, rewritten_relationships).
        """
        if not entities:
            return [], relationships

        logger.info("Resolving duplicates for %d entities and %d relationships...", len(entities), len(relationships))

        # 1. Group entities by their category/type
        grouped_by_type: Dict[str, List[dict]] = {}
        for entity in entities:
            etype = entity['type'].upper()
            grouped_by_type.setdefault(etype, []).append(entity)

        resolved_entities = []
        name_mappings = {} # Maps original_name -> canonical_name

        for etype, group in grouped_by_type.items():
            resolved_group = []
            
            for current in group:
                matched_canonical = None
                
                # Check current entity against already resolved entities in the same type group
                for existing in resolved_group:
                    # Run fuzzy comparison on names
                    ratio = fuzz.token_set_ratio(current['name'].lower(), existing['name'].lower())
                    if ratio >= self.similarity_threshold:
                        matched_canonical = existing
                        break
                    # Borderline cases: ask LLM to disambiguate
                    elif self.similarity_threshold - 15 <= ratio < self.similarity_threshold:
                        if self._llm_confirm_duplicate(
                            current['name'], existing['name'],
                            current.get('type', ''), existing.get('type', '')
                        ):
                            matched_canonical = existing
                            break
                
                if matched_canonical:
                    # Duplicate found! Merge current into matched_canonical
                    old_name = current['name']
                    new_name = matched_canonical['name']
                    
                    # Keep the longer name as the canonical one
                    if len(old_name) > len(new_name):
                        matched_canonical['name'] = old_name
                        name_mappings[new_name] = old_name
                        name_mappings[old_name] = old_name
                    else:
                        name_mappings[old_name] = new_name

                    # Combine descriptions, avoiding exact duplicates
                    if current['description'] and current['description'] not in matched_canonical['description']:
                        matched_canonical['description'] = f"{matched_canonical['description']} {current['description']}".strip()
                    
                    logger.info("Resolved & Merged entity: '%s' ➔ '%s'", old_name, matched_canonical['name'])
                else:
                    # Unique entity in this pass, add it to resolved list
                    resolved_group.append(current)
                    name_mappings[current['name']] = current['name']

            resolved_entities.extend(resolved_group)

        # 2. Rewrite relationships using the canonical name mappings
        rewritten_relationships = []
        for rel in relationships:
            # Look up source and target names in mappings
            src = rel['source_entity']
            tgt = rel['target_entity']
            
            canonical_src = name_mappings.get(src, src)
            canonical_tgt = name_mappings.get(tgt, tgt)

            # Prevent self-referencing relationships created by merges
            if canonical_src == canonical_tgt:
                logger.warning("Discarded self-referencing relationship: [%s] --[%s]--> [%s] after resolution merge.",
                               src, rel['relationship_type'], tgt)
                continue

            rel['source_entity'] = canonical_src
            rel['target_entity'] = canonical_tgt
            rewritten_relationships.append(rel)

        logger.info("Deduplication complete. Resolved entities count: %d (from %d) | Relationships count: %d",
                    len(resolved_entities), len(entities), len(rewritten_relationships))
                    
        return resolved_entities, rewritten_relationships

    def _llm_confirm_duplicate(self, name_a: str, name_b: str, type_a: str, type_b: str) -> bool:
        """
        Uses LLM to determine if two borderline entities refer to the same real-world thing.
        Returns True if they are the same entity.
        """
        if not self.llm:
            return False

        try:
            from langchain_core.prompts import ChatPromptTemplate

            prompt = ChatPromptTemplate.from_messages([
                ("system", (
                    "You are an expert at entity resolution. Given two entity names and their types, "
                    "determine if they refer to the same real-world entity.\n"
                    "Answer ONLY 'yes' or 'no'.\n"
                    "Consider: abbreviations, nicknames, partial names, and variations of the same entity."
                )),
                ("human", (
                    "Entity A: '{name_a}' (Type: {type_a})\n"
                    "Entity B: '{name_b}' (Type: {type_b})\n\n"
                    "Do these refer to the same entity?"
                ))
            ])

            chain = prompt | self.llm
            response = chain.invoke({
                "name_a": name_a,
                "name_b": name_b,
                "type_a": type_a,
                "type_b": type_b
            })

            answer = response.content.strip().lower()
            is_duplicate = answer.startswith("yes")
            logger.info("LLM disambiguation: '%s' vs '%s' -> %s", name_a, name_b, is_duplicate)
            return is_duplicate

        except Exception as e:
            logger.error("LLM disambiguation failed: %s", str(e))
            return False
