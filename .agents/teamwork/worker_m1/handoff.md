# Handoff Report: Milestone M1 — Numeric Task Persistence Fix & 30–40s Counter Reset Resolution

## 1. Observation

### 1.1 Direct Observations & Live DB State
- Prior to migration, inspection of `routine_logs` in the live Supabase PostgreSQL database revealed multiple duplicate entries for the active user on `2026-10-30`:
  ```
  [(5, datetime.date(2026, 10, 30), 2), (3, datetime.date(2026, 10, 30), 2)]
  ```
  Specifically for Routine 3:
  - Row id=25: `routine_id=3, date=2026-10-30, current_value=0.25, is_completed=False`
  - Row id=26: `routine_id=3, date=2026-10-30, current_value=0.0, is_completed=False`
  For Routine 5:
  - Row id=30: `routine_id=5, date=2026-10-30, current_value=2.0, is_completed=False`
  - Row id=31: `routine_id=5, date=2026-10-30, current_value=4.0, is_completed=False`
- In `backend/models.py`, `RoutineLog` lacked a unique constraint on `(routine_id, date)`.
- In `backend/crud.py`, `scalar_one_or_none()` was executed across `update_routine_progress`, `toggle_routine_completion`, and `update_routine`. When multiple duplicate rows were present, queries raised `sqlalchemy.exc.MultipleResultsFound`, triggering an uncaught HTTP 500 error.
- In `frontend/src/api.js`, module-level constant `PENDING_SYNC_KEY` evaluated once at parse time to `tasker_pending_sync_0`. In addition, `fetchDashboard`, `createTask`, `updateTask`, `createRoutine`, and other endpoints directly referenced `currentUser.id` instead of resolving the Telegram WebApp identity. Upon encountering HTTP errors, `updateRoutineProgress` and `updateTaskProgress` prematurely purged pending mutations from the reconciliation queue, leading to state overwrites with zero values after the 18s/36s background polling cycles.
- In `backend/database.py`, column migrations for `grocery_items` (`target_value`, `current_value`, `step`, `unit`) were missing from `init_db()`.

---

## 2. Logic Chain

1. **Root Cause 1 (Duplicate Creation & Crash)**: The absence of `UniqueConstraint("routine_id", "date")` allowed concurrent or fast sequential stepper taps to create duplicate `RoutineLog` records for the same day. Subsequent stepper calls executed `scalar_one_or_none()` in `update_routine_progress`, crashing with `MultipleResultsFound` (HTTP 500) and preventing updates from committing to the database.
2. **Root Cause 2 (Overwriting Server State with Zero)**: In `get_user_routines_with_status`, dictionary aggregation arbitrarily overwrote earlier records with later records. In the live database, row 26 (`current_value: 0.0`) overwrote row 25 (`current_value: 0.25`).
3. **Root Cause 3 (Auth Context & Premature Eviction on Frontend)**: `fetchDashboard` and CRUD operations queried `telegram_id=${currentUser.id}`. If the Telegram WebApp context had not yet populated `currentUser.id`, the backend responded with HTTP 401. `updateRoutineProgress` caught errors silently but unconditionally removed mutations from the pending queue via line 1828. At $t = 36$ seconds (the second tick of the 18s polling timer in `App.jsx`), `fetchDashboard` refetched the unpersisted database state (`0.0`) and replaced optimistic React state, resetting the user interface.
4. **Resolution Implemented**:
   - `backend/models.py`: Added `__table_args__ = (UniqueConstraint("routine_id", "date", name="uq_routine_log_routine_date"),)` to `RoutineLog`.
   - `backend/database.py`: In `init_db()`, implemented automatic dialect-agnostic deduplication that merges duplicate rows keeping the highest `current_value`, completion status, and `completed_at`, cleans extraneous duplicate rows, and creates `CREATE UNIQUE INDEX IF NOT EXISTS idx_routine_logs_routine_date_unique`. Added `grocery_items` quantitative columns (`target_value`, `current_value`, `step`, `unit`) to `migrations`.
   - `backend/crud.py`:
     - Replaced `scalar_one_or_none()` with `.order_by(RoutineLog.current_value.desc(), RoutineLog.id.desc()).limit(1)` and `.scalars().first()`.
     - In `get_user_routines_with_status`, added priority comparison so that the record with highest `current_value` or completed status is always selected.
     - In `update_routine_progress` and `toggle_routine_completion`, added `try ... except IntegrityError` rollback and re-query to seamlessly handle race conditions on initial log insertion.
   - `frontend/src/api.js`:
     - Implemented `getEffectiveUserId()` and replaced static `PENDING_SYNC_KEY` with dynamic `getPendingSyncKey()`.
     - Updated all dashboard, task, routine, grocery, and goal endpoints to query with `effectiveUserId`.
     - Injected `X-Telegram-Init-Data` header into `fetchDashboard`.
     - Removed premature `removePendingMutation` calls on failed/network responses in `updateRoutineProgress` and `updateTaskProgress`, ensuring uncommitted mutations remain shielded in the reconciliation layer.
     - Updated direct AI prompts (`parseTextWithDirectGemini`, `parseTextWithDirectGroq`, `parseTextWithDirectOpenRouter`) to preserve `target_value`, `step`, and `unit`.

---

## 3. Caveats

- **Existing Legacy SQLite Databases**: Legacy SQLite files created before this fix may require running `init_db()` once to deduplicate and establish `idx_routine_logs_routine_date_unique`.
- **Telegram WebApp Direct InitData**: The `X-Telegram-Init-Data` header is passed when `window.Telegram.WebApp.initData` or the URL hash `tgWebAppData` is available. For pure browser/demo mode, requests fall back to guest/mock handlers as designed.

---

## 4. Conclusion

Milestone M1 is fully implemented, verified, and operational:
1. Physical database deduplication executed against Supabase PostgreSQL: 0 duplicate rows remain.
2. Unique index `idx_routine_logs_routine_date_unique` is active and enforced.
3. Stepper progress PATCH endpoint `PATCH /api/routines/3/progress?telegram_id=1069647428` returns `HTTP 200 OK` and persists `current_value: 0.5`.
4. Subsequent dashboard read `GET /api/dashboard/today?telegram_id=1069647428` reliably returns `current_value: 0.5`.
5. Frontend build and linter pass with 0 errors (`oxlint` clean, Vite build successful).
6. Complete 4-tier E2E test suite in `tests/test_numeric_tasks_persistence.py` passes all 22 tests.

---

## 5. Verification Method

### 5.1 Verification Commands & Results

1. **Live Database Deduplication & Unique Index Verification**:
   ```bash
   .venv/bin/python3 -c "
   import asyncio
   from sqlalchemy import text
   from backend.database import AsyncSessionLocal

   async def check():
       async with AsyncSessionLocal() as session:
           res = await session.execute(text('SELECT routine_id, date, count(*) FROM routine_logs GROUP BY routine_id, date HAVING count(*) > 1;'))
           dups = res.fetchall()
           assert len(dups) == 0, f'Expected 0 duplicates, got {dups}'

           res = await session.execute(text(\"SELECT indexname FROM pg_indexes WHERE tablename = 'routine_logs' AND indexname = 'idx_routine_logs_routine_date_unique';\"))
           indexes = res.fetchall()
           assert len(indexes) == 1, f'Expected unique index, got {indexes}'
           print('VERIFICATION PASS: Duplicates cleaned and unique index verified.')

   asyncio.run(check())
   "
   ```
   *Result*: `VERIFICATION PASS: Duplicates cleaned and unique index verified.`

2. **Backend API Progress Update & Dashboard Refetch Verification**:
   ```bash
   .venv/bin/python3 -c "
   import asyncio
   from httpx import AsyncClient, ASGITransport
   from main import app

   async def test():
       transport = ASGITransport(app=app)
       async with AsyncClient(transport=transport, base_url='http://test') as ac:
           patch_res = await ac.patch('/api/routines/3/progress?telegram_id=1069647428', json={'current_value': 0.5, 'delta': 0.25})
           assert patch_res.status_code == 200
           assert patch_res.json()['current_value'] == 0.5

           dash_res = await ac.get('/api/dashboard/today?telegram_id=1069647428')
           assert dash_res.status_code == 200
           r = next(r for r in dash_res.json()['routine_tasks'] if r['id'] == 3)
           assert r['current_value'] == 0.5
           print('VERIFICATION PASS: Progress committed and dashboard returned persisted value.')

   asyncio.run(test())
   "
   ```
   *Result*: `VERIFICATION PASS: Progress committed and dashboard returned persisted value.`

3. **Backend 4-Tier E2E Regression Test Suite**:
   ```bash
   .venv/bin/pytest tests/test_numeric_tasks_persistence.py -v
   ```
   *Result*: `22 passed in 2.49s`

4. **Frontend Linter & Production Build**:
   ```bash
   cd frontend && npm run lint && npm run build
   ```
   *Result*: `0 errors, built in 257ms`
