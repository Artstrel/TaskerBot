# Orchestrator Final Handoff Report: Numeric Tasks Persistence & 30–40s Reset Elimination

**Mission**: Investigate root cause and eliminate the 30–40s counter reset in numeric tasks ("числительные задачи" / задачи с числовым целевым показателем), ensure durable database persistence and absence of regressions across all other task types.
**Status**: **COMPLETED (ALL ACCEPTANCE CRITERIA MET)**
**Gate Result**: **PASS** (Consensus: Auditor CLEAN, Reviewers 1 & 2 APPROVE, Challengers 1 & 2 APPROVE).

---

## 1. Observation

### 1.1 Root Causes Identified (Survey Phase)
1. **Model & Database Schema Defect**:
   - `RoutineLog` in `backend/models.py` lacked a unique constraint on `(routine_id, date)`.
   - Rapid sequential or concurrent clicks from the UI resulted in duplicate rows being inserted into `routine_logs` for the same routine on the same date (confirmed in live Supabase PostgreSQL: e.g., routine 3 had two rows for 2026-10-30: id=25 with `current_value=0.25` and id=26 with `current_value=0.0`).
2. **Crash in Persistence Layer (HTTP 500)**:
   - In `backend/crud.py` (`update_routine_progress`, `toggle_routine_completion`, `update_routine`), queries used `scalar_one_or_none()`. When duplicate rows existed, this crashed with `sqlalchemy.exc.MultipleResultsFound` (HTTP 500), preventing any subsequent progress from being committed to the database.
3. **Flawed Status Aggregation**:
   - In `backend/crud.py` (`get_user_routines_with_status`), iterating over duplicate logs arbitrarily overwrote earlier records with later records. Row 26 (`0.0`) overwrote row 25 (`0.25`), causing the backend to return `0.0`.
4. **Client-Side Premature Mutation Eviction & Auth Desync**:
   - In `frontend/src/api.js`, `updateRoutineProgress` unconditionally removed pending mutations on failure (`catch (e) {}`), dropping optimistic shielding.
   - Module constant `PENDING_SYNC_KEY` statically evaluated to user 0 at script parse time.
   - `fetchDashboard` passed raw `currentUser.id` instead of resolving the Telegram identity.
5. **The 30–40s Reset Loop Mechanism**:
   - In `frontend/src/App.jsx` (line 436), a background polling interval runs every 18 seconds (`setInterval(..., 18000)`).
   - Optimistic mutations had a grace TTL of 5 seconds (`RECENT_MUTATION_TTL = 5000`).
   - At $t \approx 36$ seconds (tick 2 of the 18s polling timer), `loadData(false, true)` invoked `GET /api/dashboard/today`.
   - Because the mutation shield had expired and the backend returned `current_value: 0.0` from the unpersisted/duplicate state, the UI was overwritten with zero.

### 1.2 Implemented Changes (Milestone M1)
1. **`backend/models.py`**:
   - Added `__table_args__ = (UniqueConstraint("routine_id", "date", name="uq_routine_log_routine_date"),)` to `RoutineLog`.
2. **`backend/database.py`**:
   - In `init_db()`, implemented dialect-agnostic deduplication that merges duplicate rows keeping the highest progress, deletes extraneous duplicate rows, and enforces `CREATE UNIQUE INDEX IF NOT EXISTS idx_routine_logs_routine_date_unique ON routine_logs (routine_id, date)`.
   - Added missing column migrations for `grocery_items` (`target_value`, `current_value`, `step`, `unit`).
3. **`backend/crud.py`**:
   - Replaced `scalar_one_or_none()` with `.order_by(RoutineLog.current_value.desc(), RoutineLog.id.desc()).limit(1).scalars().first()`.
   - In `get_user_routines_with_status`, prioritized logs with highest `current_value` and completed status.
   - In `update_routine_progress` and `toggle_routine_completion`, wrapped commit in `try ... except IntegrityError` to rollback and re-apply updates on concurrent initial log creation races.
4. **`frontend/src/api.js`**:
   - Implemented dynamic `getEffectiveUserId()` and `getPendingSyncKey()`.
   - Updated endpoints (`fetchDashboard`, `createTask`, `updateTask`, `createRoutine`) to query with `effectiveUserId`.
   - Injected `X-Telegram-Init-Data` header into `fetchDashboard`.
   - Removed premature eviction of pending mutations on HTTP failure (`removePendingMutation` only called when `res.ok`).
   - Updated direct AI prompts (`parseTextWithDirectGemini`, `parseTextWithDirectGroq`, `parseTextWithDirectOpenRouter`) to preserve `target_value`, `step`, and `unit`.

---

## 2. Logic Chain & Verification Results

1. **Gate Verification Summary**:
   - `auditor_1` (Forensic Integrity Auditor): **CLEAN** (0 violations, genuine logic, live Supabase btree index physically enforced, 0 duplicate rows).
   - `reviewer_1` (Reviewer 1): **APPROVE** (22/22 E2E tests passed in 2.74s, frontend lint 0 errors, build clean).
   - `reviewer_2` (Reviewer 2): **APPROVE** (concurrency race resilience confirmed, auth synchronization verified).
   - `challenger_1` (Persistence Challenger): **APPROVE** (13 adversarial tests in `test_numeric_challenge_stress.py` passed; verified time persistence at 18s, 36s, 60s without zero reset; concurrency up to 20 parallel requests passed).
   - `challenger_2` (Regression Challenger): **APPROVE** (17 adversarial tests in `test_non_numeric_regressions_stress.py` passed; non-numeric routines, streaks, rollovers, tasks, goals, groceries verified with zero regression).
2. **Total Test Metrics**:
   - 52 / 52 automated tests passed across all suites in ~4.4s.
   - Frontend `oxlint` 0 errors; Vite production client build clean (`dist/index.html` generated in <300ms).
   - Live Supabase PostgreSQL database verified with 0 duplicates and active unique index.

---

## 3. Caveats

- **Existing Legacy SQLite Databases**: Local development SQLite databases created prior to this patch will automatically run deduplication upon the first invocation of `init_db()`.
- **Telegram WebApp Auth**: In standalone browser mode without Telegram `initData`, the frontend gracefully degrades to guest mode without throwing unhandled exceptions.

---

## 4. Conclusion

All acceptance criteria are satisfied:
- [x] Cause of numeric indicator reset after 30–40 seconds identified and eliminated across backend, database, and frontend layers.
- [x] Target numeric values of tasks and routines reliably persist in the database.
- [x] After 40 seconds and subsequent polling intervals (18s, 36s, 54s, 60s), numeric values are preserved and never reset to zero.
- [x] All adjacent task categories (non-numeric routines, streaks, one-time tasks, date postponement, goal progress rollups, grocery checklists) operate without regression.

---

## 5. Verification Commands

1. **Execute All Test Suites (52 tests)**:
   ```bash
   .venv/bin/pytest tests/ -v
   ```
2. **Execute E2E Numeric Persistence Suite (22 tests)**:
   ```bash
   .venv/bin/pytest tests/test_numeric_tasks_persistence.py -v
   ```
3. **Execute Concurrency & Time Persistence Challenge Suite (13 tests)**:
   ```bash
   .venv/bin/pytest tests/test_numeric_challenge_stress.py -v
   ```
4. **Execute Non-Numeric Regression Challenge Suite (17 tests)**:
   ```bash
   .venv/bin/pytest tests/test_non_numeric_regressions_stress.py -v
   ```
5. **Verify Frontend Quality Gates**:
   ```bash
   cd frontend && npm run lint && npm run build
   ```
6. **Verify Live PostgreSQL Database State**:
   ```bash
   .venv/bin/python3 -c "
   import asyncio
   from sqlalchemy import text
   from backend.database import AsyncSessionLocal

   async def check():
       async with AsyncSessionLocal() as session:
           r1 = await session.execute(text('SELECT count(*) FROM routine_logs GROUP BY routine_id, date HAVING count(*) > 1;'))
           assert len(r1.fetchall()) == 0
           r2 = await session.execute(text(\"SELECT indexname FROM pg_indexes WHERE tablename = 'routine_logs' AND indexname = 'idx_routine_logs_routine_date_unique';\"))
           assert len(r2.fetchall()) == 1
           print('VERIFICATION PASS: 0 duplicates and unique index active.')

   asyncio.run(check())
   "
   ```
