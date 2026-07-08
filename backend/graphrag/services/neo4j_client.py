import logging
from django.conf import settings
from neo4j import GraphDatabase

logger = logging.getLogger(__name__)

class Neo4jClient:
    _instance = None

    def __new__(cls, *args, **kwargs):
        # Singleton pattern to reuse the driver connection pool across Django requests
        if not cls._instance:
            cls._instance = super().__new__(cls, *args, **kwargs)
        return cls._instance

    def __init__(self):
        # Prevent re-initializing the driver if it's already connected
        if hasattr(self, 'driver'):
            return

        self.uri = getattr(settings, 'NEO4J_URI', 'bolt://localhost:7687')
        self.user = getattr(settings, 'NEO4J_USER', 'neo4j')
        self.password = getattr(settings, 'NEO4J_PASSWORD', 'password')

        logger.info("Initializing Neo4j database driver connecting to: %s", self.uri)
        try:
            self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            self.verify_constraints()
            logger.info("Successfully established connection to Neo4j and verified schema constraints.")
        except Exception as e:
            logger.error("Failed to connect to Neo4j database. Error: %s", str(e), exc_info=True)
            raise e

    def close(self):
        if hasattr(self, 'driver'):
            logger.info("Closing Neo4j driver connection pool.")
            self.driver.close()

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
        try:
            with self.driver.session() as session:
                session.run(constraint_query)
                session.run(index_query)
        except Exception as e:
            logger.warning("Could not create Neo4j constraints/indexes: %s", str(e))

    def execute_query(self, query, parameters=None):
        """
        Execute raw Cypher query safely. Used for debugging or custom retrievals.
        """
        parameters = parameters or {}
        logger.debug("Executing Cypher query: %s | Params: %s", query, parameters)
        try:
            with self.driver.session() as session:
                result = session.run(query, parameters)
                return [record.data() for record in result]
        except Exception as e:
            logger.error("Error executing Cypher query. Error: %s", str(e), exc_info=True)
            raise e

    def create_entity_node(self, name, entity_type, description, user_id, source_doc=None, page=None):
        """
        Create or update (MERGE) an Entity node, isolating by user_id.
        """
        query = (
            "MERGE (e:Entity {name: $name, user_id: $user_id}) "
            "ON CREATE SET e.type = $type, e.description = $description, "
            "              e.source_doc = $source_doc, e.page = $page, e.created_at = timestamp() "
            "ON MATCH SET e.description = coalesce(e.description, $description) "
            "RETURN e"
        )
        params = {
            "name": name.strip(),
            "type": entity_type.strip(),
            "description": description.strip(),
            "user_id": str(user_id),
            "source_doc": source_doc,
            "page": page
        }
        self.execute_query(query, params)

    def create_relationship_edge(self, source_name, target_name, rel_type, description, confidence, user_id, source_doc=None, page=None):
        """
        Create a directed relationship edge between two existing Entity nodes.
        Note: Cypher does not support parameterizing relationship types directly, 
        so we safely format the relationship type string (which is sanitised).
        """
        clean_rel_type = "".join(c for c in rel_type.upper() if c.isalnum() or c == "_")
        
        query = (
            f"MATCH (source:Entity {{name: $source_name, user_id: $user_id}}) "
            f"MATCH (target:Entity {{name: $target_name, user_id: $user_id}}) "
            f"MERGE (source)-[r:{clean_rel_type}]->(target) "
            f"ON CREATE SET r.description = $description, r.confidence = $confidence, "
            f"              r.source_doc = $source_doc, r.page = $page, r.created_at = timestamp() "
            f"RETURN r"
        )
        params = {
            "source_name": source_name.strip(),
            "target_name": target_name.strip(),
            "description": description.strip(),
            "confidence": float(confidence),
            "user_id": str(user_id),
            "source_doc": source_doc,
            "page": page
        }
        self.execute_query(query, params)

    def get_entity_subgraph(self, name, user_id, hops=2):
        """
        Retrieve all connected entities and relationships up to N hops.
        """
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
        Fetch graph summaries for the dashboard.
        """
        nodes_count_query = "MATCH (e:Entity {user_id: $user_id}) RETURN count(e) as count"
        edges_count_query = "MATCH (:Entity {user_id: $user_id})-[r]->(:Entity {user_id: $user_id}) RETURN count(r) as count"
        type_dist_query = (
            "MATCH (e:Entity {user_id: $user_id}) "
            "RETURN e.type as type, count(e) as count ORDER BY count DESC"
        )
        
        try:
            nodes_count = self.execute_query(nodes_count_query, {"user_id": str(user_id)})[0]['count']
            edges_count = self.execute_query(edges_count_query, {"user_id": str(user_id)})[0]['count']
            type_dist = self.execute_query(type_dist_query, {"user_id": str(user_id)})
            
            return {
                "nodes_count": nodes_count,
                "edges_count": edges_count,
                "type_distribution": type_dist
            }
        except Exception as e:
            logger.error("Failed to query graph statistics. Error: %s", str(e), exc_info=True)
            return {"nodes_count": 0, "edges_count": 0, "type_distribution": []}

    def delete_document_nodes(self, document_name, user_id):
        """
        Wipe all nodes and relationships associated with a deleted document.
        Removes orphan nodes that have no other remaining connections.
        """
        logger.info("Executing Cypher delete query for document: %s, User: %s", document_name, user_id)
        
        # 1. Delete relationships pointing from or to nodes created by this document
        delete_rels_query = (
            "MATCH (a:Entity {user_id: $user_id})-[r]->(b:Entity {user_id: $user_id}) "
            "WHERE r.source_doc = $document_name "
            "DELETE r"
        )
        # 2. Delete nodes created solely by this document
        delete_nodes_query = (
            "MATCH (e:Entity {user_id: $user_id}) "
            "WHERE e.source_doc = $document_name "
            "DETACH DELETE e"
        )
        
        params = {"document_name": document_name, "user_id": str(user_id)}
        self.execute_query(delete_rels_query, params)
        self.execute_query(delete_nodes_query, params)
