import logging
from typing import List, Dict
from rapidfuzz import fuzz

logger = logging.getLogger(__name__)

class EntityResolver:
    def __init__(self, similarity_threshold: float = 85.0):
        self.similarity_threshold = similarity_threshold
        logger.info("Initializing EntityResolver with similarity threshold: %.1f", self.similarity_threshold)

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
