# BUG REPORT — GraphRAG Knowledge Graph AI

**Severity legend:** 🔴 Blocker (broken / unusable path) · 🟡 High (broken contract / wrong data) · 💭 Medium (robustness / mismatch) · 🔵 Low (cosmetic)
**Owner agents:** FE = Frontend agent · BE = Backend agent · BOTH = contract mismatch

---

## 🔴 B1 — Frontend registration omits `confirm_password` → UI signup always 400s
- **Severity:** Blocker (every new user trying to register via the UI is blocked)
- **Evidence:** `frontend/src/app/(auth)/register/page.tsx:29-33` POSTs only `{username, email, password}`. The form captures `form.confirm` (line 16) and even checks `form.password !== form.confirm` (line 23) but never sends it. Backend `RegisterSerializer` (`backend/graphrag/serializers.py:24`) declares `confirm_password` as `required=True`, so DRF returns **400**.
- **Location:** FE submit handler + BE serializer contract
- **Impact:** Full self-service onboarding is impossible through the UI. (Works only via API clients that send `confirm_password`, e.g. the test suite — which is why it passed automated E2E but fails for real users.)
- **Recommended fix:** Send the field the serializer requires:
  ```ts
  await api.post('/auth/register/', {
    username: form.username,
    email: form.email,
    password: form.password,
    confirm_password: form.confirm,   // <-- add this
  });
  ```
- **Owner:** FE (contract defined by BE)

---

## 🟡 B2 — `GET /graph/communities/{id}/` always 404 (route expects int, list sends string label)
- **Severity:** High (documented API endpoint is unusable)
- **Evidence:** Route `backend/graphrag/urls.py:59` is `graph/communities/<int:community_id>/`. The list endpoint returns each community's `id` as the **label-propagation label** — a string such as an entity name (`community_detector.py:73` sets `"id": comm_id` where `comm_id` comes from `_label_propagation`, keyed by node names). Django's `<int:>` converter rejects a non-numeric segment and returns **404** before the view runs. Even if it reached the view, `int(community_id)` (line 657) would raise `ValueError`.
- **Location:** `backend/graphrag/urls.py:59`, `views.py:651`, `services/community_detector.py:73`
- **Impact:** The community-detail API contract is broken. Any client (or future UI) calling it with the list `id` fails. Note: the current UI only calls the list endpoint, so it is not user-visible *yet*, but it is a real defect against the spec.
- **Recommended fix (two options):**
  1. Change route to `<str:community_id>/` and match by label; **or**
  2. Give communities a stable numeric/UUID id and return that as `id` from the list, keeping the int route.
  Also update `CommunityDetailView` to look up by label/id consistently instead of `int(...)`.
- **Owner:** BE

---

## 💭 B3 — Document id type & count-field mismatch between backend and frontend
- **Severity:** Medium (data-binding bug; broken TS contract)
- **Evidence:**
  - Backend `Document.id` is a **UUID string** (`models.py:27`, `UUIDField(primary_key=True)`). Frontend `src/store/documents.ts:6` types `id: number`.
  - Backend `DocumentSerializer` returns `entity_count` / `relationship_count` (`serializers.py:83`). Frontend `DocumentItem` declares `entities?` / `relationships?` (`documents.ts:9-10`), and `DocumentRow.tsx:49-50` renders `doc.entities` / `doc.relationships` — which are **never populated**, so the document list never shows entity/relation counts.
- **Location:** `frontend/src/store/documents.ts`, `DocumentRow.tsx:49-50`, `backend/graphrag/serializers.py:83`
- **Impact:** Type mismatch (`number` vs UUID string) is fragile; entity/relation counts silently never display. (The community view partially defends with `x.entity_count ?? x.entityCount`, but the document store does not.)
- **Recommended fix:**
  ```ts
  export interface DocumentItem {
    id: string;                 // UUID, not number
    name: string;
    status: DocStatus;
    entity_count?: number;      // match backend key
    relationship_count?: number;
    uploadedAt: string;
    error?: string;
  }
  ```
  and render `doc.entity_count` / `doc.relationship_count`.
- **Owner:** BOTH (FE should align to BE contract)

---

## 💭 B4 — Edges matched/written by entity `name` string → silent edge loss on name drift
- **Severity:** Medium (data-integrity / robustness; latent)
- **Evidence:**
  - **Write path:** `neo4j_client.create_relationship_edge` (`neo4j_client.py:142-144`) does `MATCH (source:Entity {name:, user_id:}) MATCH (target:Entity {name:, user_id:}) MERGE ...`. If entity resolution ever produces a slightly different `name` (e.g. "Albert Einstein" vs "Albert E."), the `MATCH` finds no node and the edge is **silently dropped** (no edge created, at best a warning).
  - **Read path:** `graph_retriever.get_graph_as_json` (`graph_retriever.py:106-109`) drops any edge whose `source`/`target` name is not in `node_id_map` — with no log/warning. So name drift on read also silently deletes edges from the returned graph.
- **Location:** `backend/graphrag/services/neo4j_client.py:142-144`, `backend/graphrag/services/graph_retriever.py:106-109`
- **Impact:** Graph completeness depends entirely on exact name stability across extraction and resolution. Any drift (very common with LLM extraction) silently corrupts the graph — the root cause of B5.
- **Recommended fix:**
  - Resolve entities to a canonical internal node id (or use the unique `(name, user_id)` constraint consistently AND run entity resolution that merges variants) before writing edges.
  - In the read path, log dropped edges and prefer joining via node identity rather than re-matching by name string.
- **Owner:** BE

---

## 💭 B5 — Graph-only retrieval answers "I do not know" for one query (name-mismatch fragility)
- **Severity:** Medium (retrieval correctness; symptom of B4)
- **Evidence:** During E2E, the graph-only (`retrieve_graph_context`) path returned an abstention ("I do not know") for one query. Root cause: the query-entity name did not exactly match a stored entity name, so `get_entity_subgraph` (name-based lookup) returned nothing and the chain abstained. Hybrid mode succeeded because vector retrieval compensated.
- **Location:** `backend/graphrag/services/graph_retriever.py:57-62`, `rag_chain.py` (abstention path)
- **Impact:** Graph-only answers are fragile; real users asking naturally-phrased questions may get false "I don't know" responses.
- **Recommended fix:** Same root-cause fix as B4 (canonical entity ids + fuzzy/alias matching), plus a fallback to hybrid when graph context is empty instead of immediate abstention.
- **Owner:** BE

---

## 🔵 B6 (Low / inferred) — Documentation is effectively absent
- **Severity:** Low
- **Evidence:** `README.md` is a single line (`# graphrag-knowledge-ai`). No API docs, no setup/run instructions, no architecture notes. (See VERDICT.md Documentation criterion.)
- **Recommended fix:** Add setup, endpoints summary, and architecture overview.
- **Owner:** BOTH

---

## Reality-Check Note (excluded from bug list)
- **"0 edges" observation = NOT A BUG.** It was a test-script key mismatch (`links` vs backend `edges`). Live GRAPH returned 12 edges. Do not report it. (See EVIDENCE.md §3.)

## Summary Table
| ID | Severity | Area | One-line |
|----|----------|------|----------|
| B1 | 🔴 Blocker | FE/BE contract | UI register never sends `confirm_password` → 400 for all users |
| B2 | 🟡 High | BE API | Community detail route `<int>` vs string label id → 404 |
| B3 | 💭 Medium | FE/BE contract | Doc id typed `number` (UUID), counts `entity_count` vs `entities` |
| B4 | 💭 Medium | BE robustness | Edges written/read by name string → silent edge loss on drift |
| B5 | 💭 Medium | BE retrieval | Graph-only "I do not know" due to B4 name mismatch |
| B6 | 🔵 Low | Docs | README is one line; no API/setup docs |
