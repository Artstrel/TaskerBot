# Review Handoff Report: Milestone M1 — Numeric Task Persistence Fix & 30–40s Counter Reset Elimination

**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Integrity Violation Audit
- Codebase inspection of `backend/models.py`, `backend/database.py`, `backend/crud.py`, `frontend/src/api.js`, and `tests/test_numeric_tasks_persistence.py` revealed:
  - No hardcoded test responses or canned outputs.
  - No dummy or facade implementations (CRUD logic performs real SQLAlchemy operations against database models; frontend reconciler manages genuine optimistic mutations).
  - No bypassed tasks or unauthorized external dependencies.
  - No fabricated attestation logs.
  - Result: **0 Integrity Violations**.

### 1.2 Direct Code Inspections
1. **`backend/models.py` (lines 94–96)**:
   ```python
   __table_args__ = (
       UniqueConstraint("routine_id", "date", name="uq_routine_log_routine_date"),
   )
   ```
   *Observation*: Enforces unique constraint preventing duplicate daily logs per routine at the database schema level.

2. **`backend/database.py` (lines 76–79, 95–160)**:
   - Added column migrations for `grocery_items`: `target_value`, `current_value`, `step`, `unit`.
   - Dialect-agnostic deduplication script in `init_db()` resolves duplicate `(routine_id, date)` records by retaining max `current_value` and completed status, deleting duplicate rows, and creating index `CREATE UNIQUE INDEX IF NOT EXISTS idx_routine_logs_routine_date_unique ON routine_logs (routine_id, date)`.

3. **`backend/crud.py`**:
   - Lines 332–342 (`update_routine`), lines 407–414 (`toggle_routine_completion`), lines 493–500 (`update_routine_progress`): replaced unsafe `scalar_one_or_none()` with `.order_by(RoutineLog.current_value.desc(), RoutineLog.id.desc()).limit(1)` and `.scalars().first()`.
   - Lines 365–380 (`get_user_routines_with_status`): dictionary aggregation prioritizes records with highest `current_value`, then `is_completed`, then `id`.
   - Lines 452–470 (`toggle_routine_completion`) & lines 537–568 (`update_routine_progress`): wrapped commit in `try ... except IntegrityError` to rollback and re-apply updates on concurrent initial log creation.

4. **`frontend/src/api.js`**:
   - Lines 222–228: added `getEffectiveUserId()` resolving `currentUser.id`, `currentUser.telegram_id`, or `extractTelegramUser().id`.
   - Line 798: dynamic `getPendingSyncKey()` replaces static module-level key.
   - Lines 1857–1868 (`updateRoutineProgress`) & lines 1792–1803 (`updateTaskProgress`): removed premature eviction of pending mutations upon network/HTTP failure (`removePendingMutation` only invoked when `res.ok` is true).

### 1.3 Test & Verification Execution
1. **Backend E2E Suite**:
   ```bash
   .venv/bin/pytest tests/test_numeric_tasks_persistence.py -v
   ```
   *Result*: 22/22 passed in 2.74s.
2. **Frontend Linter & Build**:
   ```bash
   cd frontend && npm run lint && npm run build
   ```
   *Result*: `oxlint` clean (0 errors), Vite production build successful (`built in 270ms`).
3. **Live Supabase PostgreSQL DB Direct Query**:
   - `SELECT routine_id, date, count(*) FROM routine_logs GROUP BY routine_id, date HAVING count(*) > 1`: 0 rows returned (0 duplicates).
   - `SELECT indexname FROM pg_indexes WHERE tablename = 'routine_logs' AND indexname = 'idx_routine_logs_routine_date_unique'`: 1 row returned.
4. **Live API End-to-End Persistence Check**:
   - `PATCH /api/routines/3/progress?telegram_id=1069647428` -> HTTP 200, `current_value: 0.5`.
   - `GET /api/dashboard/today?telegram_id=1069647428` -> HTTP 200, `Routine 3 current_value: 0.5`.

---

## 2. Logic Chain

1. **Root Cause Analysis of 30–40s Reset**:
   - The user reported: *"numeric value is processed, but not saved in database, and after 30-40 seconds the result resets back to zero"*.
   - In `frontend/src/App.jsx` (line 436), a background polling interval triggers `fetchDashboard()` every 18,000 ms (18 seconds).
   - In the unpatched codebase, when the user tapped the stepper, fast sequential clicks or missing Telegram auth context produced duplicate rows in `routine_logs` or returned 401/500 errors.
   - When duplicate rows were present, `scalar_one_or_none()` crashed with `sqlalchemy.exc.MultipleResultsFound` (HTTP 500).
   - In `frontend/src/api.js`, `updateRoutineProgress` prematurely dropped the mutation from `pendingMutations` even though the backend failed to save it.
   - Consequently, at $t = 36$ seconds (tick 2 of the 18s polling timer), `fetchDashboard()` fetched the unupdated backend state (`current_value: 0.0`) and overwritten the optimistic React state.
2. **Sufficiency of Fix**:
   - The unique constraint and deduplication guarantee that at most 1 log row exists per `(routine_id, date)`.
   - `scalar_one_or_none()` was replaced with deterministic ordered selection (`.order_by(RoutineLog.current_value.desc()).limit(1)`).
   - Concurrency conflicts on initial row creation are caught via `try ... except IntegrityError`, rolled back, and re-applied to the existing record.
   - `frontend/src/api.js` now uses `getEffectiveUserId()`, injects `X-Telegram-Init-Data`, and preserves uncommitted mutations in `localStorage` across network failures.
   - All tests across Tier 1 (features), Tier 2 (boundary/concurrency), Tier 3 (cross-feature rollup), and Tier 4 (simulated 18s/36s/54s polling) pass with 100% success rate.
3. **Absence of Regressions**:
   - Non-numeric routines maintain streak progression and toggling (`test_non_numeric_routine_regression`).
   - One-time tasks maintain postponement and priority (`test_non_numeric_task_and_postpone_regression`).
   - Goal completion percentage rollups properly update when numeric subtasks are incremented or decremented (`test_quantitative_task_linked_to_goal_rollup`).
   - Grocery items function without error (`test_grocery_items_crud_and_completion_regression`).

---

## 3. Caveats

- In `tests/test_numeric_challenge_stress.py` (lines 455 and 517), a secondary stress test authored by the challenger role accesses `response.json()["is_completed"]` on routine endpoints. The routine response schema (`RoutineWithStatus`) defines this field as `is_completed_today`. The core test suite `tests/test_numeric_tasks_persistence.py` correctly uses `is_completed_today` and passes completely.
- Local SQLite development databases created prior to this migration will have duplicate records deduplicated upon the first invocation of `init_db()`.

---

## 4. Conclusion

The implementation satisfies all requirements specified in `PROJECT.md` and `ORIGINAL_REQUEST.md`:
- R1 (Localization and elimination of the 30–40s reset): **RESOLVED**.
- R2 (Regression prevention for adjacent mechanisms and non-numeric tasks): **VERIFIED**.
- Database deduplication and unique index enforcement: **VERIFIED**.
- Build and test gates: **PASSED**.

**Official Verdict**: **APPROVE**.

---

## 5. Verification Method

To independently reproduce and verify this assessment:

1. **Run Backend E2E Test Suite**:
   ```bash
   .venv/bin/pytest tests/test_numeric_tasks_persistence.py -v
   ```
   *Expected output*: `22 passed in < 3.0s`.

2. **Run Frontend Quality Gates**:
   ```bash
   cd frontend && npm run lint && npm run build
   ```
   *Expected output*: `oxlint` 0 errors, Vite build successful.

3. **Verify Live Database Schema and Zero Duplicates**:
   ```bash
   .venv/bin/python3 -c "
   import asyncio
   from sqlalchemy import text
   from backend.database import AsyncSessionLocal

   async def verify():
       async with AsyncSessionLocal() as session:
           r1 = await session.execute(text('SELECT count(*) FROM routine_logs GROUP BY routine_id, date HAVING count(*) > 1;'))
           assert len(r1.fetchall()) == 0, 'Duplicates found'
           r2 = await session.execute(text(\"SELECT indexname FROM pg_indexes WHERE tablename = 'routine_logs' AND indexname = 'idx_routine_logs_routine_date_unique';\"))
           assert len(r2.fetchall()) == 1, 'Index missing'
           print('DB VERIFICATION SUCCESSFUL')

   asyncio.run(verify())
   "
   ```
   *Expected output*: `DB VERIFICATION SUCCESSFUL`.
