# Backend Completion Plan — GraphRAG Knowledge AI

**Created:** 2026-07-08
**Scope:** Backend only (`/backend/` directory)
**Duration:** 2 days (Phase 01 + Phase 02)
**Goal:** 20/20 endpoints PASS, all bugs fixed, security hardened

---

## Current State Summary

| Category | Count | Status |
|----------|-------|--------|
| Endpoints PASS | 7/20 | 35% — auth, upload, list, delete, query, cypher, path |
| Endpoints MISSING | 9/20 | 45% — compare, graph, entity, stats, communities, search, evaluation, health, dedicated graph/vector URLs |
| Endpoints WRONG URL | 2/20 | path + cypher at `/query/` instead of `/graph/` |
| Endpoints FUNCTIONAL EQUIVALENT | 2/20 | graph-only + vector-only achievable via mode param |
| Bugs | 9 | Critical: Neo4j auth, Cypher injection, error leaks, singleton |
| Empty Files | 2 | community_detector.py, admin.py |
| Unused Models | 2 | QueryLog, EvaluationPair |

---

# PHASE 01 — Day 1: Critical Bugs + Missing Endpoints + Community Detection

**Estimated Total Time: 8–10 hours**
**Deliverable:** All 9 bugs fixed, community detection working, 15+ endpoints functional

---

## Task 1.1 — Fix Neo4j Auth Bug (CRITICAL)

**File:** `graphrag/services/neo4j_client.py`
**Time:** 15 minutes
**Priority:** P0 — Blocks ALL Neo4j operations

### What's Wrong
```python
# Line 22 — WRONG: settings has NEO4J_USERNAME, client reads NEO4J_USER
self.user = getattr(settings, 'NEO4J_USER', 'neo4j')  # ← BUG
```
```python
# Line 13 — WRONG: super().__new__ receives *args, **kwargs it shouldn't
cls._instance = super().__new__(cls, *args, **kwargs)  # ← BUG
```

### Fix
```python
# Line 10-14: Fix singleton __new__
def __new__(cls, *args, **kwargs):
    if not cls._instance:
        cls._instance = super().__new__(cls)  # No *args, **kwargs
    return cls._instance

# Line 22: Fix setting name
self.user = getattr(settings, 'NEO4J_USERNAME', 'neo4j')  # ← FIXED
```

### Verification
- Run: `python manage.py shell -c "from graphrag.services.neo4j_client import Neo4jClient; c = Neo4jClient(); print(c.user)"`
- Expected: prints `neo4j` (from settings.NEO4J_USERNAME)

---

## Task 1.2 — Add Missing Neo4j Methods

**File:** `graphrag/services/neo4j_client.py`
**Time:** 45 minutes
**Priority:** P0 — Required by endpoints #11, #12, #15, #18

### Methods to Add

```python
def get_all_graph_data(self, user_id):
    """
    Returns all nodes and relationships for frontend visualization.
    Endpoint #11: GET /api/graph/
    """
    nodes_query = (
        "MATCH (e:Entity {user_id: $user_id}) "
        "RETURN e.name AS name, e.type AS type, e.description AS description, "
        "       e.source_doc AS source_doc, e.page AS page "
        "LIMIT 500"
    )
    edges_query = (
        "MATCH (s:Entity {user_id: $user_id})-[r]->(t:Entity {user_id: $user_id}) "
        "RETURN s.name AS source, t.name AS target, "
        "       type(r) AS relationship_type, r.description AS description, "
        "       r.confidence AS confidence, r.source_doc AS source_doc "
        "LIMIT 1000"
    )
    try:
        nodes = self.execute_query(nodes_query, {"user_id": str(user_id)})
        edges = self.execute_query(edges_query, {"user_id": str(user_id)})
        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        logger.error("Failed to get all graph data: %s", str(e))
        return {"nodes": [], "edges": []}


def get_entity_details(self, name, user_id):
    """
    Returns entity details + direct subgraph for a specific entity.
    Endpoint #12: GET /api/graph/entity/{name}/
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
    Searches entities by name (case-insensitive contains) or description.
    Endpoint #18: POST /api/graph/search/
    """
    query = (
        "MATCH (e:Entity {user_id: $user_id}) "
        "WHERE toLower(e.name) CONTAINS toLower($search_term) "
        "   OR toLower(e.description) CONTAINS toLower($search_term) "
        "RETURN e.name AS name, e.type AS type, e.description AS description, "
        "       e.source_doc AS source_doc "
        "LIMIT $limit"
    )
    try:
        return self.execute_query(query, {
            "search_term": search_term,
            "user_id": str(user_id),
            "limit": limit
        })
    except Exception as e:
        logger.error("Failed to search entities: %s", str(e))
        return []
```

### Verification
- Each method should execute against Neo4j without errors
- `get_all_graph_data()` returns `{"nodes": [...], "edges": [...]}` format
- `search_entities("Google", user_id)` returns matching entities

---

## Task 1.3 — Fix Cypher Injection Vulnerability

**File:** `graphrag/services/nl_to_cypher.py`
**Time:** 30 minutes
**Priority:** P0 — Security: injection risk

### What's Wrong
No validation on the LLM-generated Cypher. An LLM could generate `DETACH DELETE` or `CREATE` operations.

### Fix — Add Post-Generation Validation
```python
import re

class NLToCypher:
    FORBIDDEN_KEYWORDS = [
        'MERGE', 'CREATE', 'SET', 'DELETE', 'REMOVE', 'DETACH',
        'DROP', 'ALTER', 'INSERT', 'UPDATE', 'WRITE'
    ]

    def _validate_read_only(self, cypher: str) -> bool:
        """
        Returns True if the Cypher is read-only, False if it contains write operations.
        """
        cypher_upper = cypher.upper()
        # Split into words to avoid false positives (e.g., 'RESET' contains 'SET')
        words = re.findall(r'\b\w+\b', cypher_upper)
        for keyword in self.FORBIDDEN_KEYWORDS:
            if keyword in words:
                return False
        return True

    def execute_nl_query(self, question: str, user_id: str) -> Dict[str, Any]:
        # ... existing code ...
        result: CypherQuery = self.chain.invoke({"question": question})

        # VALIDATION: Ensure read-only
        if not self._validate_read_only(result.cypher):
            logger.warning("BLOCKED write Cypher query: %s", result.cypher)
            return {
                "cypher": result.cypher,
                "explanation": "Query blocked: only read-only Cypher queries are allowed.",
                "records": [],
                "success": False,
                "error": "Generated query contains write operations. Only read queries are permitted."
            }
        # ... rest of existing code ...
```

### Verification
- Attempt to generate Cypher with injection payload
- Confirm write operations are blocked and logged
- Confirm legitimate read queries still pass

---

## Task 1.4 — Fix Error Message Information Leaks

**File:** `graphrag/views.py`
**Time:** 20 minutes
**Priority:** P0 — Security: internal error details exposed

### What's Wrong
```python
# Lines 202, 237, 268 — All leak str(e) to the client
return Response(
    {"error": f"Internal Server Error: {str(e)}"},
    status=status.HTTP_500_INTERNAL_SERVER_ERROR
)
```

### Fix
```python
# Replace ALL instances of str(e) leak with safe messages:

# In QueryView (line ~202):
except Exception as e:
    logger.error("Error in QueryView: %s", str(e), exc_info=True)
    return Response(
        {"error": "An internal error occurred while processing your query."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )

# In CypherQueryView (line ~237):
except Exception as e:
    logger.error("Error in CypherQueryView: %s", str(e), exc_info=True)
    return Response(
        {"error": "An internal error occurred while translating your query."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )

# In ShortestPathView (line ~268):
except Exception as e:
    logger.error("Error in ShortestPathView: %s", str(e), exc_info=True)
    return Response(
        {"error": "An internal error occurred while finding the path."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )

# In DocumentViewSet.destroy (line ~163):
except Exception as e:
    logger.error("Failed to delete document: %s. Error: %s", doc.id, str(e), exc_info=True)
    return Response(
        {"error": "Failed to delete document."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )
```

### Verification
- Trigger a 500 error in tests
- Confirm response contains NO internal details (no stack traces, no DB errors)
- Confirm the error IS logged server-side with full details

---

## Task 1.5 — Fix Settings Security Issues

**File:** `config/settings.py`
**Time:** 15 minutes
**Priority:** P0 — Security: production-readiness

### Fixes
```python
# Line 16: DEBUG should default to False in production
DEBUG = os.getenv('DEBUG', 'False') == 'True'  # Changed from 'True'

# Line 109: CORS should be restricted
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:3000').split(',')
    if origin.strip()
]

# Lines 122-136: JWT access token lifetime too long
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),  # Changed from days=1
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    # ... rest unchanged
}
```

### Verification
- Confirm DEBUG=False by default
- Confirm CORS blocks unrecognized origins
- Confirm JWT access tokens expire in 30 minutes

---

## Task 1.6 — Fix vector_retriever.py Page Metadata Bug

**File:** `graphrag/services/vector_retriever.py`
**Time:** 10 minutes
**Priority:** P2 — Data correctness

### What's Wrong
```python
# Line 64: Page metadata is arbitrary — divides index by 2
metadatas = [{"source_doc": doc_name, "page": (i // 2) + 1} for i in range(len(chunks))]
```

### Fix
```python
# Use actual chunk numbering (page tracking comes from graph_builder.py context)
metadatas = [
    {"source_doc": doc_name, "page": i + 1, "chunk_index": i}
    for i in range(len(chunks))
]
```

### Verification
- Upload a document, query ChromaDB metadata
- Confirm chunk_index increments correctly

---

## Task 1.7 — Fix graph_retriever.py Node ID Bug

**File:** `graphrag/services/graph_retriever.py`
**Time:** 15 minutes
**Priority:** P1 — Correctness: relationship parsing

### What's Wrong
```python
# Lines 122-123: rel.start_node.id returns an internal Neo4j ID, NOT an index into nodes[]
start_node = nodes[rel.start_node.id if hasattr(rel.start_node, 'id') else 0]
end_node = nodes[rel.end_node.id if hasattr(rel.end_node, 'id') else 0]
```
This indexes into `nodes[]` using Neo4j's internal ID, which is wrong.

### Fix
```python
# Use the path's node list and find nodes by matching properties
# The path object already has the correct node ordering
def _parse_subgraph_paths(self, paths, unique_nodes, unique_rels):
    for record in paths:
        path_obj = record.get("path")
        if not path_obj:
            continue

        nodes = path_obj.nodes
        relationships = path_obj.relationships

        # Parse nodes
        for node in nodes:
            properties = dict(node)
            name = properties.get("name")
            if name:
                unique_nodes[name] = {
                    "type": properties.get("type", "Unknown"),
                    "description": properties.get("description", "")
                }

        # Parse relationships — use relationship properties to get source/target names
        for rel in relationships:
            # The relationship object contains start_node and end_node references
            # Use their properties directly, not array indexing
            start_props = dict(rel.start_node) if hasattr(rel, 'start_node') else {}
            end_props = dict(rel.end_node) if hasattr(rel, 'end_node') else {}

            start_name = start_props.get("name", "Unknown")
            end_name = end_props.get("name", "Unknown")

            rel_type = rel.type
            rel_props = dict(rel)
            desc = rel_props.get("description", "")
            conf = rel_props.get("confidence", 1.0)

            desc_suffix = f" (Details: {desc})" if desc else ""
            rel_str = (
                f"[{start_props.get('type', 'Entity')}] **{start_name}** "
                f"--[{rel_type} (Confidence: {conf})]--> "
                f"[{end_props.get('type', 'Entity')}] **{end_name}**{desc_suffix}"
            )
            unique_rels.add(rel_str)
```

### Verification
- Upload a document with multiple relationships
- Query graph context for an entity
- Confirm relationships parse correctly without IndexError

---

## Task 1.8 — Implement community_detector.py

**File:** `graphrag/services/community_detector.py`
**Time:** 90 minutes
**Priority:** P1 — Assignment requirement (endpoints #16, #17)

### Full Implementation

```python
import logging
from typing import List, Dict, Any, Optional
from collections import defaultdict
from .neo4j_client import Neo4jClient
from .llm_client import get_llm
from langchain_core.prompts import ChatPromptTemplate

logger = logging.getLogger(__name__)


class CommunityDetector:
    """
    Detects communities/clusters in the knowledge graph using
    Label Propagation algorithm (simpler than Louvain, works well for Neo4j),
    then uses LLM to generate descriptive labels and summaries.
    """

    def __init__(self):
        logger.info("Initializing CommunityDetector service.")
        self.neo4j_client = Neo4jClient()
        self.llm = get_llm(temperature=0.3)
        self._community_cache = {}  # user_id -> communities

    def detect_communities(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Runs Label Propagation community detection on the user's subgraph.
        Returns list of community dicts with id, members, and labels.
        """
        logger.info("Running community detection for user: %s", user_id)

        # 1. Fetch the graph structure (adjacency list)
        edges_query = (
            "MATCH (a:Entity {user_id: $user_id})-[r]-(b:Entity {user_id: $user_id}) "
            "RETURN a.name AS source, b.name AS target"
        )
        edges = self.neo4j_client.execute_query(edges_query, {"user_id": str(user_id)})

        if not edges:
            logger.info("No edges found. Cannot detect communities.")
            return []

        # 2. Build adjacency list
        adjacency = defaultdict(set)
        all_nodes = set()
        for edge in edges:
            adjacency[edge["source"]].add(edge["target"])
            adjacency[edge["target"]].add(edge["source"])
            all_nodes.add(edge["source"])
            all_nodes.add(edge["target"])

        # 3. Label Propagation Algorithm (synchronous)
        communities = self._label_propagation(all_nodes, adjacency)

        # 4. Fetch entity details for each community
        entity_details = self._fetch_entity_details(list(all_nodes), user_id)

        # 5. Build community objects
        community_list = []
        for comm_id, members in communities.items():
            if len(members) < 2:
                continue  # Skip singleton communities
            member_details = [
                entity_details.get(m, {"name": m, "type": "Unknown", "description": ""})
                for m in members
            ]
            community_list.append({
                "id": comm_id,
                "members": members,
                "member_count": len(members),
                "member_details": member_details
            })

        # 6. Generate LLM labels and summaries for each community
        for comm in community_list:
            label_summary = self._generate_community_label_summary(comm)
            comm["label"] = label_summary.get("label", f"Community {comm['id']}")
            comm["summary"] = label_summary.get("summary", "")

        logger.info("Detected %d communities for user: %s", len(community_list), user_id)
        self._community_cache[str(user_id)] = community_list
        return community_list

    def _label_propagation(self, nodes: set, adjacency: dict, max_iterations: int = 20) -> Dict[int, set]:
        """
        Synchronous Label Propagation algorithm.
        Each node starts with its own label. Labels propagate through edges.
        Converges when no label changes.
        """
        # Initialize: each node gets its own label
        labels = {node: node for node in nodes}

        for iteration in range(max_iterations):
            new_labels = {}
            changed = False

            for node in nodes:
                if not adjacency[node]:
                    new_labels[node] = labels[node]
                    continue

                # Count labels among neighbors
                label_counts = defaultdict(int)
                for neighbor in adjacency[node]:
                    label_counts[labels[neighbor]] += 1

                # Pick the most common label (ties broken by random/deterministic)
                max_count = max(label_counts.values())
                candidates = [l for l, c in label_counts.items() if c == max_count]
                new_label = min(candidates)  # Deterministic: pick smallest

                if new_labels.get(node, None) != new_label:
                    changed = True
                new_labels[node] = new_label

            labels = new_labels
            if not changed:
                logger.info("Label Propagation converged after %d iterations.", iteration + 1)
                break

        # Group nodes by their final label
        communities = defaultdict(set)
        for node, label in labels.items():
            communities[label].add(node)

        return dict(communities)

    def _fetch_entity_details(self, names: List[str], user_id: str) -> Dict[str, dict]:
        """Fetch entity type and description for a list of entity names."""
        if not names:
            return {}

        query = (
            "MATCH (e:Entity {user_id: $user_id}) "
            "WHERE e.name IN $names "
            "RETURN e.name AS name, e.type AS type, e.description AS description"
        )
        try:
            records = self.neo4j_client.execute_query(query, {
                "user_id": str(user_id),
                "names": names
            })
            return {r["name"]: r for r in records}
        except Exception as e:
            logger.error("Failed to fetch entity details: %s", str(e))
            return {}

    def _generate_community_label_summary(self, community: Dict) -> Dict[str, str]:
        """Uses LLM to generate a descriptive label and summary for a community."""
        members_text = "\n".join([
            f"- {m['name']} ({m.get('type', 'Unknown')}): {m.get('description', 'No description')}"
            for m in community["member_details"]
        ])

        prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert at analyzing knowledge graph communities.\n"
                "Given a list of entities in a community cluster, generate:\n"
                "1. A short descriptive label (2-5 words) summarizing the community theme\n"
                "2. A 2-3 paragraph summary describing what this community represents, "
                "how the entities relate, and what themes they represent.\n\n"
                "Be factual and grounded in the entity descriptions."
            )),
            ("human", (
                "Community with {count} members:\n\n{members}\n\n"
                "Generate a label and summary."
            ))
        ])

        try:
            chain = prompt | self.llm
            response = chain.invoke({
                "count": community["member_count"],
                "members": members_text
            })

            # Parse response — expect "Label: ...\n\nSummary: ..."
            text = response.content.strip()
            lines = text.split("\n", 1)
            label = lines[0].strip().lstrip("#").strip()
            summary = lines[1].strip() if len(lines) > 1 else ""

            return {"label": label, "summary": summary}
        except Exception as e:
            logger.error("Failed to generate community label: %s", str(e))
            return {"label": f"Community {community['id']}", "summary": ""}

    def get_community_by_id(self, community_id: int, user_id: str) -> Optional[Dict]:
        """Returns a single community by ID, re-detecting if cache is empty."""
        cached = self._community_cache.get(str(user_id), [])
        if not cached:
            cached = self.detect_communities(user_id)

        for comm in cached:
            if comm["id"] == community_id:
                return comm
        return None

    def get_all_communities(self, user_id: str) -> List[Dict]:
        """Returns all communities, using cache if available."""
        cached = self._community_cache.get(str(user_id), [])
        if not cached:
            cached = self.detect_communities(user_id)
        return cached
```

### Verification
- Upload a document with rich relationships
- Call `detect_communities(user_id)`
- Confirm returns list of communities with labels and summaries
- Confirm community member counts are reasonable

---

## Task 1.9 — Implement admin.py

**File:** `graphrag/admin.py`
**Time:** 10 minutes
**Priority:** P1 — Assignment requirement

### Implementation

```python
from django.contrib import admin
from .models import User, Document, QueryLog, EvaluationPair


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'is_staff', 'date_joined')
    search_fields = ('username', 'email')


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'status', 'entity_count', 'relationship_count', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('name',)
    readonly_fields = ('entity_count', 'relationship_count', 'error_message')


@admin.register(QueryLog)
class QueryLogAdmin(admin.ModelAdmin):
    list_display = ('query_text', 'user', 'retrieval_mode', 'response_time', 'created_at')
    list_filter = ('retrieval_mode', 'created_at')
    search_fields = ('query_text',)


@admin.register(EvaluationPair)
class EvaluationPairAdmin(admin.ModelAdmin):
    list_display = ('question', 'user', 'is_active', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('question',)
```

### Verification
- Run: `python manage.py migrate` (if needed)
- Access `/admin/` — confirm all 4 models appear
- Confirm list views display correct columns

---

## Task 1.10 — Fix graph_retriever.py + add get_entity_subgraph serialization

**File:** `graphrag/services/graph_retriever.py`
**Time:** 20 minutes (already partially covered in Task 1.7)
**Priority:** P1

This is the complete fix including the serialization for the frontend (nodes + edges JSON format):

```python
def get_graph_as_json(self, user_id: str) -> Dict[str, Any]:
    """
    Serializes the full graph as JSON for frontend visualization.
    Endpoint #11: GET /api/graph/
    """
    raw_data = self.neo4j_client.get_all_graph_data(user_id)

    # Assign numeric IDs for vis.js / react-force-graph
    node_id_map = {}
    nodes = []
    for i, node in enumerate(raw_data["nodes"]):
        node_id_map[node["name"]] = i
        nodes.append({
            "id": i,
            "label": node["name"],
            "type": node.get("type", "Unknown"),
            "description": node.get("description", ""),
            "source_doc": node.get("source_doc", ""),
            "page": node.get("page", 0)
        })

    edges = []
    for edge in raw_data["edges"]:
        source_id = node_id_map.get(edge["source"])
        target_id = node_id_map.get(edge["target"])
        if source_id is not None and target_id is not None:
            edges.append({
                "source": source_id,
                "target": target_id,
                "label": edge["relationship_type"],
                "description": edge.get("description", ""),
                "confidence": edge.get("confidence", 1.0),
                "source_doc": edge.get("source_doc", "")
            })

    return {"nodes": nodes, "edges": edges}
```

---

# PHASE 02 — Day 2: Remaining Endpoints + Security Hardening + Testing

**Estimated Total Time: 8–10 hours**
**Deliverable:** All 20 endpoints PASS, security hardened, comprehensive tests

---

## Task 2.1 — Add Query Logging to All Query Endpoints

**File:** `graphrag/views.py`
**Time:** 30 minutes
**Priority:** P1 — Assignment requirement (QueryLog model is defined but never used)

### Implementation
```python
import time
from .models import QueryLog

# Add to imports at top of views.py

# Modify QueryView.post:
class QueryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        query = request.data.get("query")
        mode = request.data.get("mode", "hybrid")

        if not query or not query.strip():
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        logger.info("Executing RAG Query for user: %s | Mode: %s", request.user.username, mode)
        start_time = time.time()
        try:
            rag_chain = RAGChain()
            result = rag_chain.generate_answer(query, request.user.id, mode)
            elapsed = time.time() - start_time

            # Log query
            QueryLog.objects.create(
                user=request.user,
                query_text=query,
                retrieval_mode=mode.upper(),
                answer_text=result.get("answer", ""),
                response_time=round(elapsed, 3)
            )

            if result.get("success", False):
                return Response(result, status=status.HTTP_200_OK)
            else:
                return Response(
                    {"error": "Failed to generate RAG response."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error("Error in QueryView: %s", str(e), exc_info=True)
            # Log failed query too
            QueryLog.objects.create(
                user=request.user,
                query_text=query,
                retrieval_mode=mode.upper(),
                answer_text="ERROR",
                response_time=round(elapsed, 3)
            )
            return Response(
                {"error": "An internal error occurred while processing your query."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
```

### Verification
- Run a query, check `QueryLog` table has a new row
- Confirm `response_time` is reasonable (not 0, not 1000)

---

## Task 2.2 — Add File Upload Validation

**File:** `graphrag/views.py` (DocumentUploadView)
**Time:** 20 minutes
**Priority:** P1 — Security: reject dangerous files

### Implementation
```python
ALLOWED_EXTENSIONS = {'.pdf', '.txt', '.md', '.docx', '.doc', '.csv', '.json', '.html', '.xml'}
MAX_FILE_SIZE_MB = 10

class DocumentUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if 'file' not in request.FILES:
            return Response(
                {"error": "No file was uploaded."},
                status=status.HTTP_400_BAD_REQUEST
            )

        file_obj = request.FILES['file']

        # 1. Validate file extension
        import os
        ext = os.path.splitext(file_obj.name)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return Response(
                {"error": f"File type '{ext}' is not allowed. Supported: {', '.join(sorted(ALLOWED_EXTENSIONS))}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 2. Validate file size
        if file_obj.size > MAX_FILE_SIZE_MB * 1024 * 1024:
            return Response(
                {"error": f"File size exceeds {MAX_FILE_SIZE_MB}MB limit."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            )

        # 3. Validate file is not empty
        if file_obj.size == 0:
            return Response(
                {"error": "Empty files are not allowed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ... rest of existing code ...
```

### Verification
- Upload `.exe` file → 400
- Upload 15MB file → 413
- Upload empty file → 400
- Upload `.pdf` → 202

---

## Task 2.3 — Create Missing Endpoints (views.py additions)

**File:** `graphrag/views.py`
**Time:** 90 minutes
**Priority:** P0 — 9 missing/wrong-URL endpoints

### New Views to Add

```python
import time
import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.db.models import Avg, Count

from .models import QueryLog, EvaluationPair
from .serializers import (
    QueryLogSerializer, EvaluationPairSerializer
)
from .services.rag_chain import RAGChain
from .services.graph_retriever import GraphRetriever
from .services.vector_retriever import VectorRetriever
from .services.hybrid_retriever import HybridRetriever
from .services.nl_to_cypher import NLToCypher
from .services.multihop_reasoner import MultiHopReasoner
from .services.community_detector import CommunityDetector
from .services.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)


# ============================================================
# Endpoint #8: POST /api/query/graph-only/
# ============================================================
class GraphOnlyQueryView(APIView):
    """Dedicated endpoint for graph-only retrieval."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        query = request.data.get("query")
        if not query or not query.strip():
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        start_time = time.time()
        try:
            rag_chain = RAGChain()
            result = rag_chain.generate_answer(query, request.user.id, mode="graph")
            elapsed = time.time() - start_time

            # Log
            QueryLog.objects.create(
                user=request.user, query_text=query,
                retrieval_mode='GRAPH',
                answer_text=result.get("answer", ""),
                response_time=round(elapsed, 3)
            )

            if result.get("success", False):
                return Response(result, status=status.HTTP_200_OK)
            return Response(
                {"error": "Failed to generate graph retrieval response."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error("Error in GraphOnlyQueryView: %s", str(e), exc_info=True)
            return Response(
                {"error": "An internal error occurred during graph retrieval."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #9: POST /api/query/vector-only/
# ============================================================
class VectorOnlyQueryView(APIView):
    """Dedicated endpoint for vector-only retrieval."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        query = request.data.get("query")
        if not query or not query.strip():
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        start_time = time.time()
        try:
            rag_chain = RAGChain()
            result = rag_chain.generate_answer(query, request.user.id, mode="vector")
            elapsed = time.time() - start_time

            QueryLog.objects.create(
                user=request.user, query_text=query,
                retrieval_mode='VECTOR',
                answer_text=result.get("answer", ""),
                response_time=round(elapsed, 3)
            )

            if result.get("success", False):
                return Response(result, status=status.HTTP_200_OK)
            return Response(
                {"error": "Failed to generate vector retrieval response."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error("Error in VectorOnlyQueryView: %s", str(e), exc_info=True)
            return Response(
                {"error": "An internal error occurred during vector retrieval."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #10: POST /api/query/compare/
# ============================================================
class QueryCompareView(APIView):
    """Runs all 3 retrieval modes and returns side-by-side comparison."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        query = request.data.get("query")
        if not query or not query.strip():
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            rag_chain = RAGChain()
            results = {}

            for mode in ["graph", "vector", "hybrid"]:
                start = time.time()
                result = rag_chain.generate_answer(query, request.user.id, mode)
                elapsed = time.time() - start
                results[mode] = {
                    "answer": result.get("answer", ""),
                    "sources": result.get("sources", []),
                    "strategy": result.get("strategy", mode.upper()),
                    "response_time": round(elapsed, 3),
                    "success": result.get("success", False)
                }

            return Response({
                "query": query,
                "comparisons": results,
                "success": True
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error("Error in QueryCompareView: %s", str(e), exc_info=True)
            return Response(
                {"error": "An internal error occurred during comparison."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #11: GET /api/graph/
# ============================================================
class GraphDataView(APIView):
    """Returns full graph data (nodes + edges) for frontend visualization."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            graph_retriever = GraphRetriever()
            graph_json = graph_retriever.get_graph_as_json(request.user.id)
            return Response(graph_json, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in GraphDataView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to retrieve graph data."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #12: GET /api/graph/entity/{name}/
# ============================================================
class GraphEntityDetailView(APIView):
    """Returns entity details and its direct subgraph."""
    permission_classes = [IsAuthenticated]

    def get(self, request, name):
        if not name:
            return Response(
                {"error": "Entity name is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            neo4j_client = Neo4jClient()
            entity_data = neo4j_client.get_entity_details(name, request.user.id)

            if not entity_data:
                return Response(
                    {"error": f"Entity '{name}' not found."},
                    status=status.HTTP_404_NOT_FOUND
                )

            return Response(entity_data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in GraphEntityDetailView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to retrieve entity details."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #13: GET /api/graph/path/
# ============================================================
class GraphPathView(APIView):
    """Finds paths between two entities. Moved from /query/shortest-path/."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        entity_a = request.query_params.get("entity_a")
        entity_b = request.query_params.get("entity_b")

        if not entity_a or not entity_b:
            return Response(
                {"error": "Both 'entity_a' and 'entity_b' query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            reasoner = MultiHopReasoner()
            result = reasoner.explain_connection(entity_a, entity_b, request.user.id)
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in GraphPathView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to find path between entities."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #14: POST /api/graph/cypher/
# ============================================================
class GraphCypherView(APIView):
    """Executes raw Cypher query. Moved from /query/cypher/."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        query = request.data.get("query")
        if not query or not query.strip():
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            nl_to_cypher = NLToCypher()
            result = nl_to_cypher.execute_nl_query(query, request.user.id)

            if result.get("success", False):
                return Response(result, status=status.HTTP_200_OK)
            return Response(
                {"error": result.get("error", "Failed to translate and execute Cypher query.")},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error("Error in GraphCypherView: %s", str(e), exc_info=True)
            return Response(
                {"error": "An internal error occurred while executing Cypher."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #15: GET /api/graph/stats/
# ============================================================
class GraphStatsView(APIView):
    """Returns graph statistics: total nodes, edges, type distribution."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            neo4j_client = Neo4jClient()
            stats = neo4j_client.get_graph_statistics(request.user.id)
            return Response(stats, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in GraphStatsView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to retrieve graph statistics."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #16: GET /api/graph/communities/
# ============================================================
class CommunityListView(APIView):
    """Lists all detected communities with summaries."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            detector = CommunityDetector()
            communities = detector.get_all_communities(request.user.id)

            # Simplify response — don't send full member_details in list
            summary_list = []
            for comm in communities:
                summary_list.append({
                    "id": comm["id"],
                    "label": comm.get("label", ""),
                    "summary": comm.get("summary", ""),
                    "member_count": comm["member_count"],
                    "members": comm["members"]
                })

            return Response({
                "communities": summary_list,
                "count": len(summary_list)
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in CommunityListView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to retrieve communities."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #17: GET /api/graph/communities/{id}/
# ============================================================
class CommunityDetailView(APIView):
    """Returns a single community's full details and members."""
    permission_classes = [IsAuthenticated]

    def get(self, request, community_id):
        try:
            detector = CommunityDetector()
            community = detector.get_community_by_id(int(community_id), request.user.id)

            if not community:
                return Response(
                    {"error": f"Community with ID {community_id} not found."},
                    status=status.HTTP_404_NOT_FOUND
                )

            return Response(community, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in CommunityDetailView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to retrieve community details."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #18: POST /api/graph/search/
# ============================================================
class GraphSearchView(APIView):
    """Search entities by name or description."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        search_term = request.data.get("query", "").strip()
        if not search_term:
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            neo4j_client = Neo4jClient()
            results = neo4j_client.search_entities(search_term, request.user.id)

            return Response({
                "query": search_term,
                "results": results,
                "count": len(results)
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in GraphSearchView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to search entities."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #19: GET /api/evaluation/
# ============================================================
class EvaluationView(APIView):
    """Returns evaluation results comparing retrieval modes."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            # Get evaluation pairs for this user
            pairs = EvaluationPair.objects.filter(
                user=request.user, is_active=True
            )

            if not pairs.exists():
                return Response({
                    "evaluations": [],
                    "message": "No evaluation pairs found. Create evaluation pairs first.",
                    "summary": None
                }, status=status.HTTP_200_OK)

            rag_chain = RAGChain()
            eval_results = []

            for pair in pairs:
                modes_results = {}
                for mode in ["graph", "vector", "hybrid"]:
                    start = time.time()
                    result = rag_chain.generate_answer(
                        pair.question, request.user.id, mode
                    )
                    elapsed = time.time() - start
                    modes_results[mode] = {
                        "answer": result.get("answer", ""),
                        "response_time": round(elapsed, 3),
                        "success": result.get("success", False)
                    }

                eval_results.append({
                    "question": pair.question,
                    "expected_answer": pair.expected_answer,
                    "results": modes_results
                })

            # Summary stats
            summary = {
                "total_pairs": len(eval_results),
                "avg_response_times": {}
            }
            for mode in ["graph", "vector", "hybrid"]:
                times = [e["results"][mode]["response_time"] for e in eval_results]
                summary["avg_response_times"][mode] = round(sum(times) / len(times), 3) if times else 0

            return Response({
                "evaluations": eval_results,
                "summary": summary
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error("Error in EvaluationView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to run evaluation."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #20: GET /api/health/
# ============================================================
class HealthCheckView(APIView):
    """Health check endpoint — verifies Django + Neo4j connectivity."""
    permission_classes = [AllowAny]

    def get(self, request):
        health = {
            "django": "healthy",
            "neo4j": "unknown",
            "timestamp": time.time()
        }

        # Check Neo4j connectivity
        try:
            neo4j_client = Neo4jClient()
            neo4j_client.execute_query("RETURN 1 AS test")
            health["neo4j"] = "healthy"
        except Exception as e:
            logger.error("Neo4j health check failed: %s", str(e))
            health["neo4j"] = "unhealthy"

        overall = "healthy" if health["neo4j"] == "healthy" else "degraded"

        return Response({
            "status": overall,
            "services": health
        }, status=status.HTTP_200_OK)
```

---

## Task 2.4 — Update URLs

**File:** `graphrag/urls.py`
**Time:** 20 minutes
**Priority:** P0 — Wire up all new endpoints

### Full Replacement

```python
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView,
    CustomTokenObtainPairView,
    DocumentViewSet,
    DocumentUploadView,
    QueryView,
    CypherQueryView,
    ShortestPathView,
    # New endpoints
    GraphOnlyQueryView,
    VectorOnlyQueryView,
    QueryCompareView,
    GraphDataView,
    GraphEntityDetailView,
    GraphPathView,
    GraphCypherView,
    GraphStatsView,
    CommunityListView,
    CommunityDetailView,
    GraphSearchView,
    EvaluationView,
    HealthCheckView,
)

router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')

urlpatterns = [
    # === Authentication ===
    path('auth/register/', RegisterView.as_view(), name='auth_register'),
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='auth_login'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='auth_token_refresh'),

    # === Documents ===
    path('documents/upload/', DocumentUploadView.as_view(), name='document_upload'),

    # === Query Endpoints ===
    path('query/', QueryView.as_view(), name='query'),
    path('query/graph-only/', GraphOnlyQueryView.as_view(), name='query_graph_only'),
    path('query/vector-only/', VectorOnlyQueryView.as_view(), name='query_vector_only'),
    path('query/compare/', QueryCompareView.as_view(), name='query_compare'),

    # === Legacy endpoints (kept for backwards compat) ===
    path('query/cypher/', CypherQueryView.as_view(), name='query_cypher'),
    path('query/shortest-path/', ShortestPathView.as_view(), name='query_shortest_path'),

    # === Graph Endpoints (NEW) ===
    path('graph/', GraphDataView.as_view(), name='graph_data'),
    path('graph/entity/<str:name>/', GraphEntityDetailView.as_view(), name='graph_entity_detail'),
    path('graph/path/', GraphPathView.as_view(), name='graph_path'),
    path('graph/cypher/', GraphCypherView.as_view(), name='graph_cypher'),
    path('graph/stats/', GraphStatsView.as_view(), name='graph_stats'),
    path('graph/communities/', CommunityListView.as_view(), name='graph_communities'),
    path('graph/communities/<int:community_id>/', CommunityDetailView.as_view(), name='graph_community_detail'),
    path('graph/search/', GraphSearchView.as_view(), name='graph_search'),

    # === Evaluation ===
    path('evaluation/', EvaluationView.as_view(), name='evaluation'),

    # === Health ===
    path('health/', HealthCheckView.as_view(), name='health'),

    # === Document Management (router) ===
    path('', include(router.urls)),
]
```

### Endpoint Map Verification

| # | Method | URL | View | Status |
|---|--------|-----|------|--------|
| 1 | POST | /api/auth/register/ | RegisterView | DONE |
| 2 | POST | /api/auth/login/ | CustomTokenObtainPairView | DONE |
| 3 | POST | /api/auth/token/refresh/ | TokenRefreshView | DONE |
| 4 | POST | /api/documents/upload/ | DocumentUploadView | DONE |
| 5 | GET | /api/documents/ | DocumentViewSet.list | DONE |
| 6 | DELETE | /api/documents/{id}/ | DocumentViewSet.destroy | DONE |
| 7 | POST | /api/query/ | QueryView | DONE |
| 8 | POST | /api/query/graph-only/ | GraphOnlyQueryView | NEW |
| 9 | POST | /api/query/vector-only/ | VectorOnlyQueryView | NEW |
| 10 | POST | /api/query/compare/ | QueryCompareView | NEW |
| 11 | GET | /api/graph/ | GraphDataView | NEW |
| 12 | GET | /api/graph/entity/{name}/ | GraphEntityDetailView | NEW |
| 13 | GET | /api/graph/path/ | GraphPathView | NEW |
| 14 | POST | /api/graph/cypher/ | GraphCypherView | NEW |
| 15 | GET | /api/graph/stats/ | GraphStatsView | NEW |
| 16 | GET | /api/graph/communities/ | CommunityListView | NEW |
| 17 | GET | /api/graph/communities/{id}/ | CommunityDetailView | NEW |
| 18 | POST | /api/graph/search/ | GraphSearchView | NEW |
| 19 | GET | /api/evaluation/ | EvaluationView | NEW |
| 20 | GET | /api/health/ | HealthCheckView | NEW |

---

## Task 2.5 — Add Serializers for New Models

**File:** `graphrag/serializers.py`
**Time:** 15 minutes
**Priority:** P1

### Add (already exist in file but verify they're imported in views)
```python
# Already in serializers.py — just ensure they're imported in views.py:
from .serializers import (
    RegisterSerializer, 
    UserSerializer, 
    DocumentSerializer,
    QueryLogSerializer,        # Add import
    EvaluationPairSerializer   # Add import
)
```

### Verify existing serializers work:
- `QueryLogSerializer` — fields: id, user, query_text, retrieval_mode, answer_text, response_time, created_at
- `EvaluationPairSerializer` — fields: id, user, question, expected_answer, is_active, created_at

---

## Task 2.6 — Update Comprehensive Tests

**File:** `graphrag/tests_comprehensive.py`
**Time:** 90 minutes
**Priority:** P1 — Verify all endpoints work

### Tests to Add

```python
# ============================================================
# NEW TEST CLASS: Graph Endpoints Tests
# ============================================================

class GraphEndpointTests(APITestCase):
    """Tests for all /api/graph/* endpoints."""

    def setUp(self):
        self.user = _create_user(username="graphep", email="graphep@gmail.com")
        self.client.force_authenticate(user=self.user)

    @patch("graphrag.views.GraphRetriever")
    def test_graph_data_view(self, mock_retriever):
        """GET /api/graph/ returns nodes and edges."""
        mock_retriever.return_value.get_graph_as_json.return_value = {
            "nodes": [{"id": 0, "label": "Google", "type": "ORGANIZATION"}],
            "edges": []
        }
        response = self.client.get(reverse("graph_data"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("nodes", response.data)
        self.assertIn("edges", response.data)

    @patch("graphrag.views.Neo4jClient")
    def test_graph_entity_detail(self, mock_neo4j):
        """GET /api/graph/entity/{name}/ returns entity details."""
        mock_neo4j.return_value.get_entity_details.return_value = {
            "entity": {"name": "Google", "type": "ORGANIZATION", "description": "Tech company"},
            "relationships": []
        }
        response = self.client.get(reverse("graph_entity_detail", args=["Google"]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @patch("graphrag.views.Neo4jClient")
    def test_graph_entity_not_found(self, mock_neo4j):
        """GET /api/graph/entity/{name}/ returns 404 for missing entity."""
        mock_neo4j.return_value.get_entity_details.return_value = None
        response = self.client.get(reverse("graph_entity_detail", args=["Nonexistent"]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("graphrag.views.Neo4jClient")
    def test_graph_stats(self, mock_neo4j):
        """GET /api/graph/stats/ returns graph statistics."""
        mock_neo4j.return_value.get_graph_statistics.return_value = {
            "nodes_count": 10,
            "edges_count": 15,
            "type_distribution": [{"type": "PERSON", "count": 5}]
        }
        response = self.client.get(reverse("graph_stats"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["nodes_count"], 10)

    @patch("graphrag.views.Neo4jClient")
    def test_graph_search(self, mock_neo4j):
        """POST /api/graph/search/ returns matching entities."""
        mock_neo4j.return_value.search_entities.return_value = [
            {"name": "Google", "type": "ORGANIZATION", "description": "Tech company"}
        ]
        response = self.client.post(
            reverse("graph_search"), {"query": "Google"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    @patch("graphrag.views.Neo4jClient")
    def test_graph_search_empty_query(self, mock_neo4j):
        """POST /api/graph/search/ rejects empty query."""
        response = self.client.post(
            reverse("graph_search"), {"query": ""}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("graphrag.views.CommunityDetector")
    def test_community_list(self, mock_detector):
        """GET /api/graph/communities/ returns community list."""
        mock_detector.return_value.get_all_communities.return_value = [
            {
                "id": 1,
                "label": "Tech Companies",
                "summary": "A community of technology organizations.",
                "member_count": 3,
                "members": ["Google", "Microsoft", "Apple"],
                "member_details": []
            }
        ]
        response = self.client.get(reverse("graph_communities"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    @patch("graphrag.views.CommunityDetector")
    def test_community_detail(self, mock_detector):
        """GET /api/graph/communities/{id}/ returns community detail."""
        mock_detector.return_value.get_community_by_id.return_value = {
            "id": 1,
            "label": "Tech Companies",
            "summary": "Summary here.",
            "member_count": 3,
            "members": ["Google", "Microsoft", "Apple"],
            "member_details": [
                {"name": "Google", "type": "ORGANIZATION", "description": "..."}
            ]
        }
        response = self.client.get(reverse("graph_community_detail", args=[1]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @patch("graphrag.views.CommunityDetector")
    def test_community_not_found(self, mock_detector):
        """GET /api/graph/communities/{id}/ returns 404 for missing."""
        mock_detector.return_value.get_community_by_id.return_value = None
        response = self.client.get(reverse("graph_community_detail", args=[999]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ============================================================
# NEW TEST CLASS: Query Comparison Tests
# ============================================================

class QueryCompareTests(APITestCase):
    """Tests for POST /api/query/compare/."""

    def setUp(self):
        self.user = _create_user(username="cmpuser", email="cmpuser@gmail.com")
        self.client.force_authenticate(user=self.user)

    @patch("graphrag.views.RAGChain")
    def test_compare_returns_all_modes(self, mock_rag):
        """Compare endpoint returns graph, vector, and hybrid results."""
        mock_rag.return_value.generate_answer.return_value = {
            "success": True, "answer": "Test answer", "sources": ["doc.pdf"]
        }
        response = self.client.post(
            reverse("query_compare"), {"query": "What is AI?"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("graph", response.data["comparisons"])
        self.assertIn("vector", response.data["comparisons"])
        self.assertIn("hybrid", response.data["comparisons"])
        self.assertEqual(mock_rag.return_value.generate_answer.call_count, 3)


# ============================================================
# NEW TEST CLASS: Graph-only / Vector-only Query Tests
# ============================================================

class DedicatedQueryModeTests(APITestCase):
    """Tests for dedicated /api/query/graph-only/ and /api/query/vector-only/."""

    def setUp(self):
        self.user = _create_user(username="modeuser", email="modeuser@gmail.com")
        self.client.force_authenticate(user=self.user)

    @patch("graphrag.views.RAGChain")
    def test_graph_only_query(self, mock_rag):
        """POST /api/query/graph-only/ uses graph mode."""
        mock_rag.return_value.generate_answer.return_value = {
            "success": True, "answer": "Graph answer"
        }
        response = self.client.post(
            reverse("query_graph_only"), {"query": "Show relationships"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        call_args = mock_rag.return_value.generate_answer.call_args
        self.assertEqual(call_args[0][2], "graph")

    @patch("graphrag.views.RAGChain")
    def test_vector_only_query(self, mock_rag):
        """POST /api/query/vector-only/ uses vector mode."""
        mock_rag.return_value.generate_answer.return_value = {
            "success": True, "answer": "Vector answer"
        }
        response = self.client.post(
            reverse("query_vector_only"), {"query": "Semantic search"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        call_args = mock_rag.return_value.generate_answer.call_args
        self.assertEqual(call_args[0][2], "vector")


# ============================================================
# NEW TEST CLASS: Health Check Tests
# ============================================================

class HealthCheckTests(APITestCase):
    """Tests for GET /api/health/."""

    def test_health_check_no_auth_required(self):
        """Health check does not require authentication."""
        response = self.client.get(reverse("health"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("status", response.data)
        self.assertIn("services", response.data)

    @patch("graphrag.views.Neo4jClient")
    def test_health_check_neo4j_healthy(self, mock_neo4j):
        """Health check returns healthy when Neo4j is reachable."""
        mock_neo4j.return_value.execute_query.return_value = [{"test": 1}]
        response = self.client.get(reverse("health"))
        self.assertEqual(response.data["services"]["neo4j"], "healthy")
        self.assertEqual(response.data["status"], "healthy")

    @patch("graphrag.views.Neo4jClient")
    def test_health_check_neo4j_unhealthy(self, mock_neo4j):
        """Health check returns degraded when Neo4j is unreachable."""
        mock_neo4j.return_value.execute_query.side_effect = Exception("Connection refused")
        response = self.client.get(reverse("health"))
        self.assertEqual(response.data["services"]["neo4j"], "unhealthy")
        self.assertEqual(response.data["status"], "degraded")


# ============================================================
# NEW TEST CLASS: Query Logging Tests
# ============================================================

class QueryLoggingTests(APITestCase):
    """Tests that queries are logged to QueryLog model."""

    def setUp(self):
        self.user = _create_user(username="logtester", email="logtester@gmail.com")
        self.client.force_authenticate(user=self.user)

    @patch("graphrag.views.RAGChain")
    def test_query_creates_log_entry(self, mock_rag):
        """Successful query creates a QueryLog record."""
        mock_rag.return_value.generate_answer.return_value = {
            "success": True, "answer": "Test answer"
        }
        initial_count = QueryLog.objects.count()
        self.client.post(
            reverse("query"), {"query": "Test query"}, format="json"
        )
        self.assertEqual(QueryLog.objects.count(), initial_count + 1)

        log = QueryLog.objects.latest("created_at")
        self.assertEqual(log.query_text, "Test query")
        self.assertEqual(log.user, self.user)

    @patch("graphrag.views.RAGChain")
    def test_failed_query_creates_log_entry(self, mock_rag):
        """Failed query also creates a QueryLog record."""
        mock_rag.return_value.generate_answer.side_effect = Exception("Boom")
        initial_count = QueryLog.objects.count()
        self.client.post(
            reverse("query"), {"query": "Failing query"}, format="json"
        )
        self.assertEqual(QueryLog.objects.count(), initial_count + 1)


# ============================================================
# NEW TEST CLASS: File Validation Tests
# ============================================================

class FileValidationTests(APITestCase):
    """Tests for file upload validation."""

    def setUp(self):
        self.user = _create_user(username="fileval", email="fileval@gmail.com")
        self.client.force_authenticate(user=self.user)

    @patch("graphrag.views.trigger_ingestion_background")
    def test_reject_exe_file(self, mock_bg):
        """Executable files are rejected."""
        exe_file = SimpleUploadedFile(
            "malware.exe", b"MZ\x90\x00", content_type="application/octet-stream"
        )
        response = self.client.post(
            reverse("document_upload"), {"file": exe_file}, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("graphrag.views.trigger_ingestion_background")
    def test_reject_empty_file(self, mock_bg):
        """Empty files are rejected."""
        empty_file = SimpleUploadedFile("empty.txt", b"", content_type="text/plain")
        response = self.client.post(
            reverse("document_upload"), {"file": empty_file}, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("graphrag.views.trigger_ingestion_background")
    def test_accept_valid_pdf(self, mock_bg):
        """Valid PDF files are accepted."""
        pdf_file = SimpleUploadedFile(
            "test.pdf", b"%PDF-1.4 fake", content_type="application/pdf"
        )
        response = self.client.post(
            reverse("document_upload"), {"file": pdf_file}, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)


# ============================================================
# NEW TEST CLASS: Security Hardening Tests
# ============================================================

class SecurityHardeningTests(APITestCase):
    """Tests verifying security fixes are in place."""

    def setUp(self):
        self.user = _create_user(username="secfix", email="secfix@gmail.com")
        self.client.force_authenticate(user=self.user)

    @patch("graphrag.views.RAGChain")
    def test_500_error_no_internal_leak(self, mock_rag):
        """500 errors should NOT leak internal details."""
        mock_rag.return_value.generate_answer.side_effect = Exception("secret_db_password")
        response = self.client.post(
            reverse("query"), {"query": "leak test"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        body = json.dumps(response.data)
        self.assertNotIn("secret_db_password", body)
        self.assertNotIn("internal", body.lower().replace("internal error", ""))

    def test_health_check_accessible_without_auth(self):
        """Health endpoint should be accessible without auth."""
        client = APIClient()
        response = client.get(reverse("health"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
```

---

## Task 2.7 — Verify Settings Changes

**File:** `config/settings.py`
**Time:** 10 minutes
**Priority:** P1

### Confirm these are set:
```python
DEBUG = os.getenv('DEBUG', 'False') == 'True'                    # Was 'True'
CORS_ALLOW_ALL_ORIGINS = False                                    # Was True
CORS_ALLOWED_ORIGINS = [...]                                      # Added
ACCESS_TOKEN_LIFETIME = timedelta(minutes=30)                     # Was days=1
NEO4J_USERNAME = os.getenv('NEO4J_USERNAME', 'neo4j')            # Confirmed correct
```

---

## Task 2.8 — Run Full Test Suite

**File:** All files (no changes)
**Time:** 30 minutes
**Priority:** P0 — Final verification

### Commands
```bash
# Run the comprehensive test suite
cd /home/creator/Desktop/ExcellenceTechnology/07.graphrag-knowledge-ai/backend
python manage.py test graphrag.tests_comprehensive --verbosity=2

# Expected: 50+ tests, ALL PASS

# Run Django system check
python manage.py check --deploy 2>&1 | head -30

# Verify migrations
python manage.py makemigrations --check

# Test URL resolution
python manage.py show_urls 2>/dev/null || python -c "
from django.urls import reverse
endpoints = [
    'auth_register', 'auth_login', 'auth_token_refresh',
    'document_upload', 'document-list',
    'query', 'query_graph_only', 'query_vector_only', 'query_compare',
    'query_cypher', 'query_shortest_path',
    'graph_data', 'graph_path', 'graph_cypher', 'graph_stats',
    'graph_communities', 'graph_search',
    'evaluation', 'health'
]
for ep in endpoints:
    try:
        url = reverse(ep)
        print(f'  OK: {ep} -> {url}')
    except Exception as e:
        print(f'  MISSING: {ep} -> {e}')
"
```

---

# Dependency Graph

```
Task 1.1 (Neo4j Auth Fix) ─────────────────────────┐
Task 1.2 (Neo4j Methods) ──────────────────────────┤
Task 1.3 (Cypher Validation) ──────────────────────┤
Task 1.4 (Error Leak Fix) ─────────────────────────┤
Task 1.5 (Settings Security) ──────────────────────┤
Task 1.6 (Vector Page Bug) ────────────────────────┤
Task 1.7 (Graph Retriever Bug) ────────────────────┤
                                                     ▼
Task 1.8 (Community Detector) ────────────────► Task 2.3 (New Endpoints)
Task 1.9 (Admin Registrations) ───────────────► Task 2.4 (URL Updates)
                                                     │
Task 2.1 (Query Logging) ──────────────────────┐    │
Task 2.2 (File Validation) ───────────────────┤    │
Task 2.5 (Serializer Imports) ────────────────┤    │
                                                ▼    ▼
                                          Task 2.6 (Tests)
                                                │
                                                ▼
                                          Task 2.8 (Full Run)
```

---

# Verification Checklist (End of Day 2)

| # | Endpoint | Method | URL | Expected | ✓ |
|---|----------|--------|-----|----------|---|
| 1 | Register | POST | /api/auth/register/ | 201 | ☐ |
| 2 | Login | POST | /api/auth/login/ | 200 + JWT | ☐ |
| 3 | Token Refresh | POST | /api/auth/token/refresh/ | 200 | ☐ |
| 4 | Upload | POST | /api/documents/upload/ | 202 | ☐ |
| 5 | List Docs | GET | /api/documents/ | 200 | ☐ |
| 6 | Delete Doc | DELETE | /api/documents/{id}/ | 200 | ☐ |
| 7 | Query | POST | /api/query/ | 200 | ☐ |
| 8 | Graph Only | POST | /api/query/graph-only/ | 200 | ☐ |
| 9 | Vector Only | POST | /api/query/vector-only/ | 200 | ☐ |
| 10 | Compare | POST | /api/query/compare/ | 200 | ☐ |
| 11 | Graph Data | GET | /api/graph/ | 200 | ☐ |
| 12 | Entity Detail | GET | /api/graph/entity/{name}/ | 200 | ☐ |
| 13 | Path | GET | /api/graph/path/ | 200 | ☐ |
| 14 | Cypher | POST | /api/graph/cypher/ | 200 | ☐ |
| 15 | Stats | GET | /api/graph/stats/ | 200 | ☐ |
| 16 | Communities | GET | /api/graph/communities/ | 200 | ☐ |
| 17 | Community Detail | GET | /api/graph/communities/{id}/ | 200 | ☐ |
| 18 | Search | POST | /api/graph/search/ | 200 | ☐ |
| 19 | Evaluation | GET | /api/evaluation/ | 200 | ☐ |
| 20 | Health | GET | /api/health/ | 200 | ☐ |

| Bug | Fix Applied | Verified |
|-----|-------------|----------|
| NEO4J_USER → NEO4J_USERNAME | ☐ | ☐ |
| Singleton __new__ args | ☐ | ☐ |
| Cypher injection (no validation) | ☐ | ☐ |
| Error messages leak internals | ☐ | ☐ |
| CORS_ALLOW_ALL_ORIGINS = True | ☐ | ☐ |
| JWT 24h access tokens | ☐ | ☐ |
| DEBUG=True default | ☐ | ☐ |
| vector_retriever page metadata | ☐ | ☐ |
| graph_retriever node.id indexing | ☐ | ☐ |

| File | Empty → Implemented | Verified |
|------|---------------------|----------|
| community_detector.py | ☐ | ☐ |
| admin.py | ☐ | ☐ |

| Model | Used in Endpoint | Verified |
|-------|------------------|----------|
| QueryLog | QueryView + all query endpoints | ☐ |
| EvaluationPair | EvaluationView | ☐ |
