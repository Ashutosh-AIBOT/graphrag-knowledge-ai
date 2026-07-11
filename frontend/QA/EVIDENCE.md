# EVIDENCE LOG — GraphRAG Knowledge Graph AI QA

**Reviewer role:** Evidence Collector + Reality Checker + Test Results Analyzer
**Date:** 2026-07-09
**Scope:** Backend (Django 4.2 + Neo4j + Chroma) and Frontend (Next.js) E2E + static verification
**Verdict status:** Evidence consolidated from prior testing agents, then independently re-verified against source code.

---

## 1. Environment & Method

| Item | Value |
|------|-------|
| Backend base URL | `http://127.0.0.1:8000/api` |
| Frontend | Next.js (TypeScript), `next build` ✓, `next lint` ✓ (0 warnings) |
| Backend stack | Django 4.2, Neo4j (driver), Chroma vector store, DRF |
| Live re-test at write time | **NOT POSSIBLE** — backend returned `HTTP 000` (not running at QA-write time). Live E2E results below are from the consolidated, previously-verified run by the testing agents. All findings (B1–B5) were additionally **confirmed by static source review** (see §4). |

### Method
1. **Live E2E** (curl-driven, from consolidated evidence): register → login → upload → poll status → query/hybrid → graph → compare → communities.
2. **Static review**: traced each claimed bug to the exact file/line in `backend/graphrag` and `frontend/src`.
3. **Reality-check**: separ\ated genuine backend defects from a script-parsing artifact (the "0 edges" false alarm).

---

## 2. Live E2E Results (verified, prior run)

```
REGISTER   -> 201 Created
LOGIN      -> 200 OK (JWT issued)
UPLOAD     -> 202 Accepted (async processing)
POLL       -> COMPLETED (processing succeeded end-to-end)
QUERY      -> 200 OK (correct multi-hop answer)
HYBRID     -> 200 OK (correct multi-hop answer)
GRAPH      -> 200 OK (21 nodes, 12 edges)
COMPARE    -> 200 OK
COMMUNITIES-> 200 OK (labels + summaries returned)
HEALTH     -> django+neo4j healthy
```

Frontend route check: all 8 routes return HTTP 200; `next build` and `next lint` both clean.

---

## 3. Reality-Check — "0 edges" is NOT a backend bug

**Claim under review:** A previous observation reported "graph returns 0 edges."

**Finding:** FALSE POSITIVE (script error, not a product defect).
- The test script looked for a `links` key in the graph response.
- The backend actually returns the key `edges` (confirmed in `graphrag/services/graph_retriever.py:106` → `"edges": edges` and `neo4j_client.get_all_graph_data` returns `edges`).
- Live GRAPH call returned **12 edges** under the correct `edges` key.

**Conclusion:** Do **not** record "0 edges" as a bug. It was a client-side key-name mismatch in the test harness. The graph endpoint is correct.

---

## 4. Static Source Verification of Bugs B1–B5

| Bug | Claim | Verified at | Result |
|-----|-------|-------------|--------|
| B1 | Frontend register omits `confirm_password` | `frontend/src/app/(auth)/register/page.tsx:29-33` sends `{username,email,password}` only; `backend/graphrag/serializers.py:24` requires `confirm_password` (`required=True`) | **CONFIRMED** |
| B2 | Community detail route `<int:community_id>` vs string label id | `backend/graphrag/urls.py:59` = `<int:community_id>/`; list `id` is a label-propagation string (`community_detector.py:73` `"id": comm_id`); `CommunityDetailView.get` does `int(community_id)` | **CONFIRMED** |
| B3 | Document id UUID vs FE `number`; count field mismatch | `backend/graphrag/models.py:27` `id = UUIDField(primary_key=True)`; `DocumentSerializer` returns `entity_count`/`relationship_count` (`serializers.py:83`); FE `src/store/documents.ts:6,9,10` types `id: number`, `entities?`, `relationships?`; `DocumentRow.tsx:49-50` reads `doc.entities`/`doc.relationships` | **CONFIRMED** |
| B4 | Edges matched/written by name string (drift fragility) | Write: `neo4j_client.create_relationship_edge` `MATCH (source:Entity {name:,user_id:}) MATCH (target:Entity {name:,user_id:}) MERGE` (`neo4j_client.py:142-144`); Read: `graph_retriever.get_graph_as_json` drops edge if `source_id/target_id is None` (`graph_retriever.py:106-109`) | **CONFIRMED** |
| B5 | Graph-only retrieval "I do not know" for one query | Consequence of B4 name-mismatch: subgraph lookup by query-entity name fails on drift → empty context → abstain | **CONFIRMED (consistent with B4)** |

---

## 5. Raw Evidence Snippets (exact lines)

- `register/page.tsx:29-33`
  ```ts
  await api.post('/auth/register/', {
    username: form.username,
    email: form.email,
    password: form.password,
  }); // confirm_password NOT sent (form.confirm exists but is unused on submit)
  ```
- `serializers.py:24`
  ```python
  confirm_password = serializers.CharField(write_only=True, required=True, ...)
  ```
- `urls.py:59`
  ```python
  path('graph/communities/<int:community_id>/', CommunityDetailView.as_view(), ...)
  ```
- `graph_retriever.py:106-109`
  ```python
  for edge in raw_data["edges"]:
      source_id = node_id_map.get(edge["source"])
      target_id = node_id_map.get(edge["target"])
      if source_id is not None and target_id is not None:  # silently drops on name drift
  ```

---

## 6. What Was NOT Tested / Caveats
- Live re-run could not be performed (backend down at write time). Findings rely on prior verified E2E + source review.
- No load/performance testing, no authz cross-user isolation test executed in this pass.
- Backend unit tests exist (`tests_comprehensive.py`, `tests.py`) but were not executed in this pass (backend offline).
