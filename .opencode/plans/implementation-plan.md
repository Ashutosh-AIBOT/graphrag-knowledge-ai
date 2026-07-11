# GraphRAG Knowledge AI — Implementation Plan

## Project Overview
- **Assignment #10:** Neo4j graph DB, entity/relationship extraction, Cypher traversal, hybrid search, community detection, multi-hop reasoning, evaluation dashboard
- **Stack:** Django 4.2 + Neo4j + ChromaDB + LangChain LLM (Groq/Gemini)
- **118 unit tests** — all PASS
- **68 manual endpoint tests** — 62 pass, 6 failures explained
- **All frontend files exist but are 0 bytes** — frontend will be built separately with Next.js

## Strategy — Phase-Based Approach

### Phase 1: Backend Fixes (Current Phase)
**Goal:** Make backend bulletproof — handle all worst-case scenarios
**Approach:** All 10 fixes at once, then full testing
**Database:** SQLite with WAL mode (good enough for assignment)
**Background:** Simple polling (raw threads + DB progress fields)

### Phase 2: Deploy to HuggingFace
**Goal:** Get backend running on HuggingFace Spaces
**Changes:** Switch to PostgreSQL, add proper CORS, configure for HF deployment

### Phase 3: Frontend Build
**Goal:** Complete professional frontend with real-time processing status
**Framework:** Next.js (as mentioned in assignment)
**Features:** Real-time progress polling, graph visualization, multi-hop reasoning UI

### Phase 4: Full Celery + Redis Migration
**Goal:** Production-grade background task handling
**When:** Only after Phase 1-3 work perfectly end-to-end
**Changes:** Add Redis, Celery worker, Celery beat, proper task queue

---

## Phase 1: Backend Fixes — Implementation Plan

### Fix List (All 10 — Implement Together)

| # | Fix | File(s) | Time | Status |
|---|-----|---------|------|--------|
| 1 | Startup recovery — reset stuck PROCESSING docs | `graphrag/apps.py` (create) | 30 min | PENDING |
| 2 | Gunicorn timeout 120→300s | `Dockerfile:45` | 1 min | PENDING |
| 3 | LLM extractors raise on failure (not return []) | `entity_extractor.py`, `relationship_extractor.py` | 1 hour | PENDING |
| 4 | Check API key before starting ingestion thread | `views.py` (trigger_ingestion_background) | 30 min | PENDING |
| 5 | Add tenacity retry with exponential backoff | `entity_extractor.py`, `relationship_extractor.py`, `neo4j_client.py` | 2 hours | PENDING |
| 6 | UUID-based ChromaDB IDs | `vector_retriever.py:61` | 30 min | PENDING |
| 7 | Entity resolver LLM disambiguation | `entity_resolver.py` | 1 hour | PENDING |
| 8 | Login empty body returns 400 not 401 | `views.py:140-145` | 15 min | PENDING |
| 9 | Empty relationship type fallback to RELATED_TO | `neo4j_client.py:114,119` | 5 min | PENDING |
| 10 | Community endpoints graceful degradation | `community_detector.py:38` | 15 min | PENDING |

### Progress Tracking (Simple Polling)

**Add to Document model:**
- `processing_progress` (IntegerField, 0-100)
- `processing_step` (CharField, max 200 chars)

**Update graph_builder.py** to set progress at each step:
1. Parsing document → 5%
2. Indexing vectors → 20%
3. Extracting entities → 20-80% (per section)
4. Extracting relationships → 20-80% (per section)
5. Resolving duplicates → 85%
6. Building knowledge graph → 95%
7. Complete → 100%

**Frontend polling:** `GET /api/documents/{id}/` every 3 seconds

### Implementation Order

**Batch 1 — Quick Wins (30 min total):**
1. Fix #2 — Gunicorn timeout (1 min)
2. Fix #9 — Empty rel type fallback (5 min)
3. Fix #8 — Login 400 (15 min)
4. Fix #10 — Community graceful degradation (15 min)

**Batch 2 — Medium Complexity (1.5 hours):**
5. Fix #6 — UUID ChromaDB IDs (30 min)
6. Fix #1 — Startup recovery apps.py (30 min)
7. Fix #4 — API key check (30 min)

**Batch 3 — Complex (4 hours):**
8. Fix #3 — Extractors raise instead of swallow (1 hour)
9. Fix #5 — Tenacity retry (2 hours)
10. Fix #7 — Entity resolver LLM disambiguation (1 hour)

**Batch 4 — Progress Tracking (1.5 hours):**
11. Add progress fields to Document model (30 min)
12. Update graph_builder.py with progress steps (1 hour)

**Batch 5 — Testing (2 hours):**
13. Run all 118 existing tests (5 min)
14. Write new tests for all fixes (2 hours)

**Total: ~9.5 hours**

### Testing Strategy

**After each batch:**
1. Run `python manage.py test graphrag.tests graphrag.tests_comprehensive` (all 118 tests)
2. Run manual endpoint tests (verify nothing regressed)
3. Test worst-case scenarios:
   - Kill server mid-ingestion → restart → verify doc reset to FAILED
   - No API keys → upload → verify immediate FAILED
   - Empty login body → verify 400 response

**After all batches:**
1. Full 68-test manual verification
2. New tests for each fix
3. Load test with concurrent uploads (if possible)

---

## Worst-Case Scenarios Handled

| Scenario | Current Behavior | After Fix | Fix # |
|----------|-----------------|-----------|-------|
| Server restarts mid-ingestion | Document stuck PROCESSING forever | Auto-reset to FAILED on startup | #1 |
| Gunicorn kills worker at 120s | Ingestion thread dies | Timeout increased to 300s | #2 |
| LLM API returns 500 | Empty entities, document "completed" | Exception raised, document FAILED | #3 |
| LLM API returns 429 (rate limit) | Section skipped silently | Retry 3 times with backoff | #5 |
| No API keys configured | Document stuck PENDING | Immediate FAILED with error | #4 |
| Same filename uploaded twice | ChromaDB vectors overwritten | UUID-based IDs prevent overwrite | #6 |
| Neo4j goes down mid-ingestion | Partial graph data | Cleanup on failure + FAILED status | #3 |
| Neo4j down during query | 500 error | Graceful empty response | #10 |
| LLM returns garbage relationship type | Invalid Cypher | Fallback to RELATED_TO | #9 |
| "J. Smith" vs "John Smith" | Not merged (borderline score) | LLM disambiguation | #7 |
| Frontend refreshes during processing | Shows stale status | Polling every 3s gets new progress | New |

---

## File Change List

| File | Change | Lines Changed |
|------|--------|---------------|
| `graphrag/apps.py` | **CREATE** — Startup recovery | ~25 lines |
| `graphrag/models.py` | Add `processing_progress`, `processing_step` fields | ~5 lines |
| `graphrag/views.py` | Fix #4 (API key check), Fix #8 (login 400) | ~15 lines |
| `graphrag/services/entity_extractor.py` | Fix #3 (raise), Fix #5 (tenacity retry) | ~15 lines |
| `graphrag/services/relationship_extractor.py` | Fix #3 (raise), Fix #5 (tenacity retry) | ~15 lines |
| `graphrag/services/graph_builder.py` | Add progress tracking at each step | ~30 lines |
| `graphrag/services/neo4j_client.py` | Fix #9 (empty rel type), Fix #5 (tenacity) | ~10 lines |
| `graphrag/services/entity_resolver.py` | Fix #7 (LLM disambiguation) | ~30 lines |
| `graphrag/services/community_detector.py` | Fix #10 (graceful degradation) | ~5 lines |
| `graphrag/services/vector_retriever.py` | Fix #6 (UUID-based IDs) | ~3 lines |
| `graphrag/serializers.py` | Add new fields to DocumentSerializer | ~3 lines |
| `Dockerfile` | Fix #2 (timeout 300s) | ~1 line |

**Total: 12 files, ~160 lines of changes**

---

## Commands to Run

**Run all existing tests:**
```bash
cd /home/creator/Desktop/ExcellenceTechnology/07.graphrag-knowledge-ai/backend
python manage.py test graphrag.tests graphrag.tests_comprehensive
```

**Run manual endpoint tests:**
```bash
cd /home/creator/Desktop/ExcellenceTechnology/07.graphrag-knowledge-ai
python manual_test.py
```

**Check Docker services:**
```bash
docker compose ps
docker compose logs backend --tail=50
```

---

## Notes

- `tenacity` is already in requirements.txt but never imported/used
- No Redis/Celery yet — will add in Phase 4
- Frontend is 0 bytes across all 14 pages — will build with Next.js in Phase 3
- Deploy to HuggingFace in Phase 2 (after Phase 1 fixes work perfectly)
- Always test fixes against real Neo4j and ChromaDB when possible
- Keep all 118 existing tests passing — never break them
- Document every fix with before/after code in commit messages
