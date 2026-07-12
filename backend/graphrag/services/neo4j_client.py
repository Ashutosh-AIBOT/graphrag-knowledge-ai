import atexit
import logging
import threading
import time
from django.conf import settings
from neo4j import GraphDatabase
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

# Stats cache: {cache_key: (timestamp, data)}
_stats_cache = {}
_stats_cache_lock = threading.Lock()
STATS_CACHE_TTL = 60

logger = logging.getLogger(__name__)

# Strict allowlist for relationship types — prevents Cypher injection
VALID_RELATIONSHIP_TYPES = frozenset({
    'WORKS_AT', 'MANAGES', 'PART_OF', 'DEPENDS_ON', 'CREATED_BY',
    'LOCATED_IN', 'RELATED_TO', 'COMPETES_WITH', 'PARTNER_OF', 'SUCCEEDED_BY',
    'BUILT_BY', 'LEADS'
})


class Neo4jClient:
    _instance = None
    _lock = threading.Lock()
    _driver = None
    _initialized = False

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if Neo4jClient._initialized and Neo4jClient._driver:
            return

        with Neo4jClient._lock:
            if Neo4jClient._initialized and Neo4jClient._driver:
                return

            self.uri = getattr(settings, 'NEO4J_URI', 'bolt://localhost:7687')
            self.user = getattr(settings, 'NEO4J_USERNAME', 'neo4j')
            self.password = getattr(settings, 'NEO4J_PASSWORD', 'password')

            logger.info("Initializing Neo4j database driver connecting to: %s", self.uri)
            try:
                Neo4jClient._driver = GraphDatabase.driver(
                    self.uri,
                    auth=(self.user, self.password),
                    max_connection_pool_size=50,
                    connection_timeout=30,
                )
                Neo4jClient._initialized = True
                self.driver = Neo4jClient._driver
                self.verify_constraints()
                atexit.register(self.close)
                logger.info("Successfully established connection to Neo4j and verified schema constraints.")
            except Exception as e:
                logger.error("Failed to connect to Neo4j database. Error: %s", str(e), exc_info=True)
                Neo4jClient._driver = None
                Neo4jClient._initialized = False
                self.driver = None
                raise e

    def close(self):
        if Neo4jClient._driver:
            logger.info("Closing Neo4j driver connection pool.")
            try:
                Neo4jClient._driver.close()
            except Exception:
                pass
            Neo4jClient._driver = None
            Neo4jClient._initialized = False

    def verify_constraints(self):
        """
        Set up unique constraints and indexes to prevent duplicates and speed up lookup.
        """
        # Unique name constraint for entities
        constraint_query = (
            "CREATE CONSTRAINT unique_entity_name IF NOT EXISTS "
            "FOR (e:Entity) REQUIRE (e.name, e.user_id) IS UNIQUE"
        )
        # Fast indexing on entity type
        index_query = (
            "CREATE INDEX entity_type_idx IF NOT EXISTS "
            "FOR (e:Entity) ON (e.type)"
        )
        # Full-text search index on entity descriptions
        fulltext_query = (
            "CREATE FULLTEXT INDEX entity_description_fulltext IF NOT EXISTS "
            "FOR (e:Entity) ON EACH [e.description, e.name]"
        )
        try:
            with self.driver.session() as session:
                session.run(constraint_query)
                session.run(index_query)
                session.run(fulltext_query)
        except Exception as e:
            logger.warning("Could not create Neo4j constraints/indexes: %s", str(e))

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type(Exception),
        reraise=True
    )
    def execute_query(self, query, parameters=None):
        """
        Execute raw Cypher query safely. Retries on transient failures.
        Used for debugging or custom retrievals.
        """
        parameters = parameters or {}
        logger.debug("Executing Cypher query: %s | Params: %s", query, parameters)
        with self.driver.session() as session:
            result = session.run(query, parameters)
            return [record.data() for record in result]

    def create_entity_node(self, name, entity_type, description, user_id, source_doc=None, source_doc_id=None, page=None):
        """
        Create or update (MERGE) an Entity node, isolating by user_id.
        """
        query = (
            "MERGE (e:Entity {name: $name, user_id: $user_id}) "
            "ON CREATE SET e.type = $type, e.description = $description, "
            "              e.source_doc = $source_doc, e.source_doc_id = $source_doc_id, e.page = $page, e.created_at = timestamp() "
            "ON MATCH SET e.description = coalesce(e.description, $description) "
            "RETURN e"
        )
        params = {
            "name": name.strip(),
            "type": entity_type.strip(),
            "description": description.strip(),
            "user_id": str(user_id),
            "source_doc": source_doc,
            "source_doc_id": str(source_doc_id) if source_doc_id else None,
            "page": page
        }
        self.execute_query(query, params)

    def create_relationship_edge(self, source_name, target_name, rel_type, description, confidence, user_id, source_doc=None, source_doc_id=None, page=None):
        """
        Create a directed relationship edge between two existing Entity nodes.
        Uses strict allowlist to prevent Cypher injection.
        """
        clean_rel_type = rel_type.upper().strip()
        if clean_rel_type not in VALID_RELATIONSHIP_TYPES:
            logger.warning("Invalid relationship type '%s' — falling back to RELATED_TO", rel_type)
            clean_rel_type = "RELATED_TO"
        
        query = (
            f"MATCH (source:Entity {{name: $source_name, user_id: $user_id}}) "
            f"MATCH (target:Entity {{name: $target_name, user_id: $user_id}}) "
            f"MERGE (source)-[r:{clean_rel_type}]->(target) "
            f"ON CREATE SET r.description = $description, r.confidence = $confidence, "
            f"              r.source_doc = $source_doc, r.source_doc_id = $source_doc_id, r.page = $page, r.created_at = timestamp() "
            f"RETURN r"
        )
        params = {
            "source_name": source_name.strip(),
            "target_name": target_name.strip(),
            "description": description.strip(),
            "confidence": float(confidence),
            "user_id": str(user_id),
            "source_doc": source_doc,
            "source_doc_id": str(source_doc_id) if source_doc_id else None,
            "page": page
        }
        self.execute_query(query, params)

    def get_entity_subgraph(self, name, user_id, hops=2, doc_names=None):
        """
        Retrieve all connected entities and relationships up to N hops.
        """
        hops = max(1, min(int(hops), 10))
        if doc_names:
            query = (
                f"MATCH path = (e:Entity {{name: $name, user_id: $user_id}})-[*1..{hops}]-(neighbor:Entity {{user_id: $user_id}}) "
                f"WHERE all(r in relationships(path) WHERE r.source_doc IN $doc_names) "
                f"RETURN path LIMIT 50"
            )
            params = {"name": name, "user_id": str(user_id), "doc_names": [str(d) for d in doc_names]}
        else:
            query = (
                f"MATCH path = (e:Entity {{name: $name, user_id: $user_id}})-[*1..{hops}]-(neighbor:Entity {{user_id: $user_id}}) "
                f"RETURN path LIMIT 50"
            )
            params = {"name": name, "user_id": str(user_id)}
        return self.execute_query(query, params)

    def find_shortest_path(self, start_name, end_name, user_id, max_hops=5):
        """
        Runs BFS pathfinding to find connection sequences between concepts.
        """
        max_hops = max(1, min(int(max_hops), 10))
        query = (
            f"MATCH (start:Entity {{name: $start_name, user_id: $user_id}}), "
            f"      (end:Entity {{name: $end_name, user_id: $user_id}}) "
            f"MATCH path = shortestPath((start)-[*..{max_hops}]-(end)) "
            f"RETURN path"
        )
        params = {
            "start_name": start_name,
            "end_name": end_name,
            "user_id": str(user_id)
        }
        return self.execute_query(query, params)

    def get_graph_statistics(self, user_id):
        """
        Fetch graph summaries for the dashboard with 60s TTL cache.
        """
        cache_key = f"stats_{user_id}"
        now = time.time()

        with _stats_cache_lock:
            if cache_key in _stats_cache:
                cached_time, cached_data = _stats_cache[cache_key]
                if now - cached_time < STATS_CACHE_TTL:
                    return cached_data

        nodes_count_query = "MATCH (e:Entity {user_id: $user_id}) RETURN count(e) as count"
        edges_count_query = "MATCH (:Entity {user_id: $user_id})-[r]->(:Entity {user_id: $user_id}) RETURN count(r) as count"
        type_dist_query = (
            "MATCH (e:Entity {user_id: $user_id}) "
            "RETURN e.type as type, count(e) as count ORDER BY count DESC"
        )

        try:
            params = {"user_id": str(user_id)}
            nodes_result = self.execute_query(nodes_count_query, params)
            nodes_count = nodes_result[0]['count'] if nodes_result else 0

            edges_result = self.execute_query(edges_count_query, params)
            edges_count = edges_result[0]['count'] if edges_result else 0

            type_dist = self.execute_query(type_dist_query, params)

            result = {
                "nodes_count": nodes_count,
                "edges_count": edges_count,
                "type_distribution": type_dist
            }

            with _stats_cache_lock:
                _stats_cache[cache_key] = (now, result)

            return result
        except Exception as e:
            logger.error("Failed to query graph statistics. Error: %s", str(e), exc_info=True)
            return {"nodes_count": 0, "edges_count": 0, "type_distribution": []}

    # ----------------------------------------------------------------
    # Additional Methods — used by new endpoints (graph, search, etc.)
    # ----------------------------------------------------------------

    def get_all_graph_data(self, user_id, doc_ids=None):
        """
        Returns all nodes and relationships for frontend visualization.
        Allows filtering by a list of document IDs (doc_ids).
        """
        if doc_ids:
            nodes_query = (
                "MATCH (e:Entity {user_id: $user_id}) "
                "WHERE e.source_doc_id IN $doc_ids "
                "OPTIONAL MATCH (e)-[r]-() "
                "RETURN e.name AS name, e.type AS type, e.description AS description, "
                "       e.source_doc AS source_doc, e.source_doc_id AS source_doc_id, e.page AS page, "
                "       count(r) AS connections "
                "LIMIT 500"
            )
            # Filter edges by checking that BOTH endpoint nodes belong to the filtered docs
            edges_query = (
                "MATCH (s:Entity {user_id: $user_id})-[r]->(t:Entity {user_id: $user_id}) "
                "WHERE s.source_doc_id IN $doc_ids AND t.source_doc_id IN $doc_ids "
                "RETURN s.name AS source, t.name AS target, "
                "       type(r) AS relationship_type, r.description AS description, "
                "       r.confidence AS confidence, r.source_doc AS source_doc "
                "LIMIT 1000"
            )
            params = {"user_id": str(user_id), "doc_ids": [str(d) for d in doc_ids]}
        else:
            nodes_query = (
                "MATCH (e:Entity {user_id: $user_id}) "
                "OPTIONAL MATCH (e)-[r]-() "
                "RETURN e.name AS name, e.type AS type, e.description AS description, "
                "       e.source_doc AS source_doc, e.source_doc_id AS source_doc_id, e.page AS page, "
                "       count(r) AS connections "
                "LIMIT 500"
            )
            # No doc filter — return ALL edges between user's nodes
            edges_query = (
                "MATCH (s:Entity {user_id: $user_id})-[r]->(t:Entity {user_id: $user_id}) "
                "RETURN s.name AS source, t.name AS target, "
                "       type(r) AS relationship_type, r.description AS description, "
                "       r.confidence AS confidence, r.source_doc AS source_doc "
                "LIMIT 1000"
            )
            params = {"user_id": str(user_id)}

        try:
            nodes = self.execute_query(nodes_query, params)
            edges = self.execute_query(edges_query, params)
            logger.info("Graph data fetched: %d nodes, %d edges for user %s", len(nodes), len(edges), user_id)
            return {"nodes": nodes, "edges": edges}
        except Exception as e:
            logger.error("Failed to get all graph data: %s", str(e))
            return {"nodes": [], "edges": []}

    def get_entity_details(self, name, user_id):
        """
        Returns entity details plus its direct subgraph.
        Endpoint: GET /api/graph/entity/{name}/
        """
        entity_query = (
            "MATCH (e:Entity {name: $name, user_id: $user_id}) "
            "RETURN e.name AS name, e.type AS type, e.description AS description, "
            "       e.source_doc AS source_doc, e.page AS page"
        )
        rels_query = (
            "MATCH (e:Entity {name: $name, user_id: $user_id})-[r]-(neighbor:Entity {user_id: $user_id}) "
            "RETURN neighbor.name AS neighbor_name, neighbor.type AS neighbor_type, "
            "       type(r) AS relationship_type, r.description AS description, "
            "       r.confidence AS confidence, "
            "       CASE WHEN startNode(r) = e THEN 'outgoing' ELSE 'incoming' END AS direction "
            "LIMIT 50"
        )
        try:
            entities = self.execute_query(entity_query, {"name": name, "user_id": str(user_id)})
            if not entities:
                return None
            relationships = self.execute_query(rels_query, {"name": name, "user_id": str(user_id)})
            return {
                "entity": entities[0],
                "relationships": relationships
            }
        except Exception as e:
            logger.error("Failed to get entity details for '%s': %s", name, str(e))
            return None

    def search_entities(self, search_term, user_id, limit=20):
        """
        Searches entities by name or description using fulltext index + fuzzy matching.
        Primary: fulltext index (fast, relevance-ranked)
        Fallback: substring match
        Final fallback: APOC edit-distance similarity
        Endpoint: POST /api/graph/search/
        """
        # 1. Primary: fulltext index search (uses pre-built entity_description_fulltext index)
        fulltext_query = (
            "CALL db.index.fulltext.queryNodes('entity_description_fulltext', $search_term) "
            "YIELD node, score "
            "WHERE node.user_id = $user_id "
            "RETURN node.name AS name, node.type AS type, node.description AS description, "
            "       node.source_doc AS source_doc, score AS similarity "
            "LIMIT $limit"
        )
        try:
            ft_results = self.execute_query(fulltext_query, {
                "search_term": search_term,
                "user_id": str(user_id),
                "limit": limit
            })
            if len(ft_results) >= 3:
                return ft_results
        except Exception:
            ft_results = []

        # 2. Fallback: substring match (if fulltext unavailable or sparse)
        substring_query = (
            "MATCH (e:Entity {user_id: $user_id}) "
            "WHERE toLower(e.name) CONTAINS toLower($search_term) "
            "   OR toLower(e.description) CONTAINS toLower($search_term) "
            "RETURN e.name AS name, e.type AS type, e.description AS description, "
            "       e.source_doc AS source_doc, 1.0 AS similarity "
            "LIMIT $limit"
        )
        try:
            results = self.execute_query(substring_query, {
                "search_term": search_term,
                "user_id": str(user_id),
                "limit": limit
            })
        except Exception:
            results = []

        # Merge fulltext results (which may have scores) with substring results
        existing_names = {r["name"] for r in ft_results}
        for r in results:
            if r["name"] not in existing_names:
                ft_results.append(r)
                existing_names.add(r["name"])
        if len(ft_results) >= 3:
            return ft_results[:limit]

        # 3. Final fallback: Fuzzy edit-distance similarity via APOC
        fuzzy_query = (
            "MATCH (e:Entity {user_id: $user_id}) "
            "WITH e, apoc.text.levenshteinSimilarity(toLower(e.name), toLower($search_term)) AS sim "
            "WHERE sim > 0.4 "
            "RETURN e.name AS name, e.type AS type, e.description AS description, "
            "       e.source_doc AS source_doc, sim AS similarity "
            "ORDER BY sim DESC "
            "LIMIT $limit"
        )
        try:
            fuzzy_results = self.execute_query(fuzzy_query, {
                "search_term": search_term,
                "user_id": str(user_id),
                "limit": limit
            })
            for fr in fuzzy_results:
                if fr["name"] not in existing_names:
                    ft_results.append(fr)
                    existing_names.add(fr["name"])
        except Exception as e:
            logger.debug("Fuzzy search fallback failed (APOC may not be available): %s", str(e))

        return ft_results[:limit]

    def delete_document_nodes(self, document_id, user_id):
        """
        Wipe all nodes and relationships associated with a deleted document ID.
        """
        logger.info("Executing Cypher delete query for document ID: %s, User: %s", document_id, user_id)
        
        # 1. Delete relationships pointing from or to nodes created by this document ID
        delete_rels_query = (
            "MATCH (a:Entity {user_id: $user_id})-[r]->(b:Entity {user_id: $user_id}) "
            "WHERE r.source_doc_id = $document_id "
            "DELETE r"
        )
        # 2. Delete nodes created by this document ID that are now orphans
        delete_nodes_query = (
            "MATCH (e:Entity {user_id: $user_id}) "
            "WHERE e.source_doc_id = $document_id AND NOT (e)-[]-() "
            "DELETE e"
        )
        
        params = {"document_id": str(document_id), "user_id": str(user_id)}
        self.execute_query(delete_rels_query, params)
        self.execute_query(delete_nodes_query, params)
