# Test Infrastructure Documentation (TEST_INFRA.md)

## 1. Overview & Architecture

This document describes the test harness and infrastructure for validating numeric tasks ("числительные задачи") persistence and regression safety across all task categories in TaskerBot.

The test suite is designed following an **opaque-box, contract-driven, 4-tier methodology**, exercising the backend REST API endpoints via asynchronous HTTP calls (`httpx.AsyncClient` with `ASGITransport`) directly against the FastAPI `app` instance.

### Key Goals
1. **Zero External Dependency**: Tests execute against an isolated temporary database instance via FastAPI's `app.dependency_overrides[get_db]`. No remote Supabase or network connection is required.
2. **Deterministic State Isolation**: Each test run or test suite execution starts with a fresh database schema (`Base.metadata.create_all`), guaranteeing complete test independence.
3. **High Fidelity**: Matches exact production schemas, ORM models, Pydantic request/response validators, and authentication dependencies.
4. **4-Tier Coverage**:
   - **Tier 1**: Feature Coverage (Routine/Task creation with quantitative fields, progress update via stepper delta & absolute values, dashboard queries, auto-completion on target reach).
   - **Tier 2**: Boundary & Corner Cases (Float precision e.g. 0.25/0.33, clamping at 0.0, exceeding target, concurrent updates deduplication).
   - **Tier 3**: Cross-Feature Combinations (Progress update vs. completion checkbox toggle, quantitative tasks linked to goals, multiple routines per date).
   - **Tier 4**: Real-World Workload & 30–40s Persistence Verification (Simulated 18s/36s/>40s polling loops, auth isolation, non-numeric regression tests).

---

## 2. Environment & Prerequisites

The test suite runs on Python 3.9+ (specifically Python 3.9/3.12 within `.venv`).

### Required Packages
- `pytest` (>= 8.0)
- `pytest-asyncio` (>= 1.2.0)
- `httpx` (>= 0.27.0)
- `aiosqlite` (>= 0.20.0)
- `SQLAlchemy` (>= 2.0.0)
- `fastapi` (>= 0.110.0)
- `pydantic` (>= 2.6.0)

Installed in the project virtualenv:
```bash
.venv/bin/pip install pytest pytest-asyncio
```

---

## 3. Database Isolation Strategy

### Isolation Mechanism
Instead of connecting to the production Supabase PostgreSQL pooler configured in `.env`, the test harness:
1. Provisions a dedicated SQLite database in a temporary directory (`tempfile.mkdtemp()`).
2. Creates an `AsyncEngine` using `sqlite+aiosqlite:///...`.
3. Runs table creation: `Base.metadata.create_all(conn)`.
4. Overrides the FastAPI database dependency:
   ```python
   app.dependency_overrides[get_db] = override_get_db
   ```
5. Executes tests with isolated user Telegram IDs (e.g. `10000001`, `10000002`).
6. Tears down tables and disposes of the engine on test completion.

### Concurrent Request Handling
SQLite with `aiosqlite` enables testing of concurrent requests (`asyncio.gather`) to verify that simultaneous progress updates on the same routine on the same date do not trigger `sqlalchemy.exc.MultipleResultsFound` or duplicate records in `routine_logs`.

---

## 4. Test Suite Structure

The test file `tests/test_numeric_tasks_persistence.py` contains 4 structured test classes:

| Class | Tier | Description |
|---|---|---|
| `TestTier1FeatureCoverage` | Tier 1 | CRUD creation, stepper delta & absolute progress, dashboard verification, auto-completion |
| `TestTier2BoundaryAndCornerCases` | Tier 2 | Float steps, negative clamping, exceeding target, concurrent updates race handling |
| `TestTier3CrossFeatureCombinations` | Tier 3 | Checkbox toggle vs stepper, goal rollup sync, multi-routine isolation |
| `TestTier4PersistenceAndRegression` | Tier 4 | 18s/36s/>40s polling persistence, auth resilience, non-numeric regression tests |

---

## 5. Execution Commands

### Run Full Test Suite
```bash
.venv/bin/pytest tests/test_numeric_tasks_persistence.py -v
```

### Run Specific Tier
```bash
.venv/bin/pytest tests/test_numeric_tasks_persistence.py -k "TestTier1" -v
.venv/bin/pytest tests/test_numeric_tasks_persistence.py -k "TestTier2" -v
.venv/bin/pytest tests/test_numeric_tasks_persistence.py -k "TestTier3" -v
.venv/bin/pytest tests/test_numeric_tasks_persistence.py -k "TestTier4" -v
```

### Run with Short Tracebacks
```bash
.venv/bin/pytest tests/test_numeric_tasks_persistence.py --tb=short
```
