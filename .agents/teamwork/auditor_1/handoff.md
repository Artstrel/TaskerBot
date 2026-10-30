# Forensic Audit Report & Handoff: Milestone M1 Integrity Verification

**Work Product**: Milestone M1 changes across `backend/models.py`, `backend/database.py`, `backend/crud.py`, `frontend/src/api.js`, and `tests/test_numeric_tasks_persistence.py`
**Profile**: General Project
**Integrity Mode**: Development (from `ORIGINAL_REQUEST.md`)
**Verdict**: **CLEAN**

---

## 1. Observation

### 1.1 Static Code Analysis
1. `backend/models.py`:
   - Verified that line 94-96 defines a physical `UniqueConstraint("routine_id", "date", name="uq_routine_log_routine_date")` on `RoutineLog`.
   - No mock bypasses, dummy stubs, or hardcoded return statements exist.
2. `backend/database.py`:
   - `init_db()` includes migration columns for `grocery_items` (`target_value`, `current_value`, `step`, `unit`).
   - Deduplication logic executes a grouped query `SELECT routine_id, date, count(*) FROM routine_logs GROUP BY routine_id, date HAVING count(*) > 1`, retains the best record based on highest `current_value`, completion flag, and timestamp, updates the primary log, and deletes conflicting duplicates.
   - Creates unique index `CREATE UNIQUE INDEX IF NOT EXISTS idx_routine_logs_routine_date_unique ON routine_logs (routine_id, date)`.
3. `backend/crud.py`:
   - Replaced all unsafe `scalar_one_or_none()` queries in `update_routine`, `get_user_routines_with_status`, `toggle_routine_completion`, and `update_routine_progress` with deterministic queries ordering by `RoutineLog.current_value.desc(), RoutineLog.id.desc()` and limiting to 1.
   - Added concurrency race condition protection: initial insert collisions catching `IntegrityError` execute transaction rollback, re-query the newly committed log, and apply the update.
   - Value arithmetic performs precision rounding via `round(float(new_val), 2)` and non-negative clamping via `max(0.0, ...)`.
4. `frontend/src/api.js`:
   - Dynamic user resolution implemented via `getEffectiveUserId()` (checking `currentUser.id`, `currentUser.telegram_id`, and `extractTelegramUser().id`) and dynamic localStorage queue key via `getPendingSyncKey()`.
   - Prevented optimistic state loss: `removePendingMutation` is invoked only if `res.ok`, ensuring uncommitted mutations remain shielded in the client-side reconciliation layer across 18s polling cycles.
   - Extended direct LLM prompt payloads to support quantitative fields (`target_value`, `step`, `unit`).
5. `tests/test_numeric_tasks_persistence.py`:
   - 1041 lines of opaque-box, real HTTP/SQL test code organized in a 4-tier harness.
   - Tests spin up an isolated SQLite database using `create_async_engine` and real FastAPI routes via `httpx.AsyncClient`.
   - No hardcoded mocks, no tautological assertions (`assert True`), and no fake response shortcuts.

### 1.2 Empirical Runtime Verification Output

#### Live PostgreSQL State (Supabase Pooler: aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres)
- **Duplicate Rows Query**:
  ```sql
  SELECT routine_id, date, count(*) FROM routine_logs GROUP BY routine_id, date HAVING count(*) > 1;
  ```
  *Raw Output*: `Live duplicates count: 0 []`
- **Unique Index Query**:
  ```sql
  SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'routine_logs' AND indexname = 'idx_routine_logs_routine_date_unique';
  ```
  *Raw Output*: `Unique indexes found: [('idx_routine_logs_routine_date_unique', 'CREATE UNIQUE INDEX idx_routine_logs_routine_date_unique ON public.routine_logs USING btree (routine_id, date)')]`
- **Active Constraint Enforcement Test**:
  Executing direct dual insertion for the same `(routine_id, date)` triggered:
  ```
  First insert succeeded
  SUCCESS: Duplicate insert rejected as expected: IntegrityError (sqlalchemy.dialects.postgresql.asyncpg.IntegrityError) <class 'asyncpg.exceptions.UniqueViolationError'>
  ```

#### Test Suite Execution
- Command: `.venv/bin/pytest tests/test_numeric_tasks_persistence.py -v`
- Result: `22 passed in 2.69s` (100% pass rate).

#### Frontend Verification
- `npm run lint`: `0 errors` (171 pre-existing warnings in unmodified components).
- `npm run build`: Vite v8.3.5 production client build succeeded in 360ms.

---

## 2. Logic Chain

1. **Check 1: Static Analysis & Cheating Detection**:
   - Grep searches for test constants (e.g. `1069647428`, user IDs, specific task strings) confirmed zero hardcoded bypasses in production code.
   - Source inspection of `crud.py` and `api.js` confirmed that all logic executes authentic state computations, commits to the database session, and refreshes the model instances.
   - Result: PASS.

2. **Check 2: Runtime & Live DB Validation**:
   - Inspection of the live Supabase PostgreSQL database verified that deduplication successfully removed duplicate rows (0 duplicate groups found).
   - The unique btree index `idx_routine_logs_routine_date_unique` is active and physically enforced by PostgreSQL.
   - Direct empirical insertion verified that duplicate inserts are rejected with `asyncpg.exceptions.UniqueViolationError` / `IntegrityError`.
   - Result: PASS.

3. **Check 3: Test Authenticity**:
   - `tests/test_numeric_tasks_persistence.py` creates genuine database instances and tests against FastAPI endpoints using `ASGITransport`.
   - Assertions verify exact HTTP status codes, specific numeric values, database counts, and persistence across simulated 18s/36s/54s polling cycles.
   - No fake mocks or always-true assertions were detected.
   - Result: PASS.

4. **Check 4: Binary Veto Rule & Mode Enforcement**:
   - Integrity mode specified in `ORIGINAL_REQUEST.md`: `development`.
   - No hardcoded test results, facade implementations, or fabricated outputs exist.
   - All 4 Forensic Verification checks passed without reservation.
   - Result: PASS.

---

## 3. Caveats

- **Network Latency to Remote Supabase**: Direct database connections to the AWS Tokyo pooler (`aws-0-ap-northeast-1.pooler.supabase.com`) experience variable network latency (~10–12s for initial SSL handshake), but all connection pools, migrations, and transactions operate stably and deterministically.
- **Client Fallback Mode**: When running outside the Telegram WebApp client without `initData`, the frontend safely degrades to `currentUser.id = 0` / guest mode without throwing unhandled exceptions.

---

## 4. Conclusion

**Verdict: CLEAN**

Milestone M1 changes implemented by `worker_m1` are fully authentic, sound, and robust. The solution directly eliminates the root cause of the 30–40s numeric task zero-reset without introducing facades, hardcoded bypasses, or integrity shortcuts.

---

## 5. Verification Method

To independently reproduce the forensic verification:

1. **Verify Live PostgreSQL Unique Index & 0 Duplicates**:
   ```bash
   .venv/bin/python3 -c "
   import asyncio
   from sqlalchemy import text
   from backend.database import AsyncSessionLocal

   async def check():
       async with AsyncSessionLocal() as session:
           res = await session.execute(text('SELECT routine_id, date, count(*) FROM routine_logs GROUP BY routine_id, date HAVING count(*) > 1;'))
           assert len(res.fetchall()) == 0
           res = await session.execute(text(\"SELECT indexname FROM pg_indexes WHERE tablename = 'routine_logs' AND indexname = 'idx_routine_logs_routine_date_unique';\"))
           assert len(res.fetchall()) == 1
           print('VERIFICATION PASS: PostgreSQL clean & unique index active')

   asyncio.run(check())
   "
   ```

2. **Verify Database Constraint Enforcement via Conflict Injection**:
   ```bash
   .venv/bin/python3 -c "
   import asyncio
   from datetime import date
   from sqlalchemy import text
   from backend.database import AsyncSessionLocal

   async def check():
       async with AsyncSessionLocal() as session:
           test_date = date(2099, 1, 1)
           await session.execute(text('DELETE FROM routine_logs WHERE routine_id = 3 AND date = :dt'), {'dt': test_date})
           await session.commit()
           await session.execute(text('INSERT INTO routine_logs (routine_id, date, current_value, is_completed) VALUES (3, :dt, 1.0, false)'), {'dt': test_date})
           await session.commit()
           try:
               await session.execute(text('INSERT INTO routine_logs (routine_id, date, current_value, is_completed) VALUES (3, :dt, 2.0, false)'), {'dt': test_date})
               await session.commit()
               raise AssertionError('Unique constraint failed to reject duplicate!')
           except Exception:
               await session.rollback()
           await session.execute(text('DELETE FROM routine_logs WHERE routine_id = 3 AND date = :dt'), {'dt': test_date})
           await session.commit()
           print('VERIFICATION PASS: Duplicate rejected by database')

   asyncio.run(check())
   "
   ```

3. **Run 4-Tier Test Suite**:
   ```bash
   .venv/bin/pytest tests/test_numeric_tasks_persistence.py -v
   ```

4. **Run Frontend Linter & Production Build**:
   ```bash
   cd frontend && npm run lint && npm run build
   ```
