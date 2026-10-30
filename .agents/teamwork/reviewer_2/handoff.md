# Handoff Report: Independent Review of Milestone M1 (Numeric Task Persistence Fix)

## Review Summary

**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Integrity Violation Audit
- Inspected `backend/models.py`, `backend/database.py`, `backend/crud.py`, `frontend/src/api.js`, and `tests/test_numeric_tasks_persistence.py`.
- No hardcoded test stubs, fake returns, facade implementations, or shortcuts were detected.
- Real SQL queries, real SQLAlchemy schemas, dynamic authentication extraction, and true multi-tier ASGI test invocations are present.

### 1.2 Direct Observations & Diffs
1. **Schema Layer (`backend/models.py:94-96`)**:
   - `RoutineLog` now defines:
     ```python
     __table_args__ = (
         UniqueConstraint("routine_id", "date", name="uq_routine_log_routine_date"),
     )
     ```
   - Prevents duplicate database entries on `(routine_id, date)` at the relational schema level.

2. **Database Migration & Startup Layer (`backend/database.py:76-79, 96-159`)**:
   - Added `grocery_items` numeric columns: `target_value` (FLOAT), `current_value` (FLOAT DEFAULT 0.0), `step` (FLOAT DEFAULT 1.0), `unit` (VARCHAR(32)).
   - Implemented dialect-agnostic pre-index deduplication algorithm that aggregates duplicate rows, retains the highest `current_value` and completed status, deletes extraneous duplicates, and enforces `CREATE UNIQUE INDEX IF NOT EXISTS idx_routine_logs_routine_date_unique ON routine_logs (routine_id, date)`.
   - Live Supabase PostgreSQL query verified:
     ```
     Dialect: postgresql
     Total routine_logs: 29
     Duplicates count: 0
     Postgres unique index: [('idx_routine_logs_routine_date_unique',)]
     ```

3. **CRUD & Concurrency Layer (`backend/crud.py:335-343, 368-381, 408-414, 453-470, 493-500, 537-569`)**:
   - Eliminated unsafe `scalar_one_or_none()` calls that triggered HTTP 500 (`MultipleResultsFound`) in `update_routine`, `toggle_routine_completion`, and `update_routine_progress`.
   - Replaced with `.order_by(RoutineLog.current_value.desc(), RoutineLog.id.desc()).limit(1)` and `.scalars().first()`.
   - In `get_user_routines_with_status`, implemented priority comparison ensuring the log with the highest progress or completed status is selected.
   - Wrapped `await session.commit()` in `try ... except IntegrityError` blocks with `await session.rollback()` and re-query in both `update_routine_progress` and `toggle_routine_completion` to handle race conditions during initial log creation.

4. **Frontend Reconciliation & Auth Layer (`frontend/src/api.js:222-228, 805, 874-884, 1326-1335, 1786-1803, 1851-1868, 2901-2905, 3000-3005`)**:
   - Added dynamic `getEffectiveUserId()` resolving non-zero IDs from `currentUser.id`, `currentUser.telegram_id`, or `extractTelegramUser()`.
   - Replaced static `PENDING_SYNC_KEY` with dynamic `getPendingSyncKey() = () => 'tasker_pending_sync_' + getEffectiveUserId()`.
   - Removed premature removal of pending mutations on HTTP failure (`!res.ok`), keeping optimistic counter values shielded from background polling overwrites.
   - Preserved `X-Telegram-Init-Data` header and bearer authorization in `fetchDashboard`.
   - Updated direct AI parser prompts (`parseTextWithDirectGemini`, `parseTextWithDirectGroq`, `parseTextWithDirectOpenRouter`) to parse and emit quantitative task attributes (`target_value`, `step`, `unit`).

5. **Test Execution & Quality Metrics**:
   - Ran `.venv/bin/pytest tests/test_numeric_tasks_persistence.py -v`:
     `22 passed, 6 warnings in 2.80s` (100% pass rate across 4 tiers).
   - Executed frontend lint and build (`npm --prefix frontend run lint && npm --prefix frontend run build`):
     0 lint errors, production build succeeded in 216ms (`dist/index.html` generated).

---

## 2. Logic Chain

1. **Bug Root Cause Analysis**:
   - The reported 30–40s reset bug had two intersecting triggers:
     - **Server-side**: Prior to this fix, rapid stepper clicks generated duplicate `RoutineLog` records because of a missing unique constraint. Subsequent stepper calls executed `scalar_one_or_none()`, which crashed with `MultipleResultsFound` (HTTP 500). Furthermore, `get_user_routines_with_status` iterated over un-ordered duplicates where a 0.0 value overwrote the valid progress.
     - **Client-side**: When the backend failed or returned 401 due to uninitialized `currentUser.id`, `updateRoutineProgress` prematurely dropped the mutation from `localStorage`. At $t = 36$ seconds (tick 2 of the 18-second polling loop in `frontend/src/App.jsx`), `fetchDashboard` refetched uncommitted data from the server (returning 0.0) and overwrote the React state.
2. **Efficacy of the Fix**:
   - With `UniqueConstraint` in `models.py` and unique index in `database.py`, duplicate rows cannot physically be created.
   - The deduplication migration cleaned all existing duplicate rows from the live database.
   - Defensive querying with `.first()` and `IntegrityError` rollback-retry ensures that concurrent requests do not raise 500 errors.
   - In `frontend/src/api.js`, dynamic auth context ensures proper credentials, and failed network calls retain pending mutations in `localStorage`, preventing state wipeout on the 18s/36s background poll.
3. **Regression Safety**:
   - Non-numeric routines, one-time tasks, goal subtask rollups, and grocery items were verified independently via Tier 3 and Tier 4 tests. Streak increments, postpone logic, and grocery completions remain intact.

---

## 3. Caveats

- **Broad Exception Swallowing in DB Migrations**: In `backend/database.py:147, 158`, the deduplication and index creation blocks use `except Exception: pass`. While this ensures startup resilience across diverse SQLite/Postgres dialects, logging exceptions via `logger.warning()` is recommended for observability. (Classification: **Minor**).
- **Client Cache Eviction**: Users with existing dirty browser sessions may need one refresh cycle for `getEffectiveUserId()` to align pending sync queues.

---

## 4. Conclusion

The implementation by `worker_m1` completely satisfies requirements R1 and R2 from `ORIGINAL_REQUEST.md`:
- Root causes of the 30–40s reset defect have been localized and eliminated.
- Database uniqueness and deduplication are verified against live PostgreSQL.
- Concurrency race conditions on initial log creation are handled gracefully.
- Auth synchronization and optimistic state reconciliation are robust.
- Test suite achieves 100% pass rate with zero regressions across other task types.

**Final Verdict**: **APPROVE**

---

## 5. Verification Method

### 5.1 Automated Test Suite Verification
Execute the test command:
```bash
.venv/bin/pytest tests/test_numeric_tasks_persistence.py -v
```
*Expected*: 22 passed.

### 5.2 Concurrency Stress Test
Run concurrent initial creation against ASGI application:
```bash
.venv/bin/python3 -c "
import asyncio, os, tempfile, shutil
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from backend.database import get_db
from backend.models import Base
from main import app

async def run():
    temp_dir = tempfile.mkdtemp()
    db_path = os.path.join(temp_dir, 'test.db')
    engine = create_async_engine(f'sqlite+aiosqlite:///{db_path}', echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async def override_get_db():
        async with SessionLocal() as s:
            yield s
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as client:
        r = await client.post('/api/routines?telegram_id=999', json={'title': 'Race Test', 'target_value': 10.0, 'step': 1.0, 'unit': 'reps'})
        r_id = r.json()['id']
        coros = [client.patch(f'/api/routines/{r_id}/progress?telegram_id=999', json={'delta': 1.0}) for _ in range(5)]
        res = await asyncio.gather(*coros, return_exceptions=True)
        for i, item in enumerate(res):
            assert item.status_code == 200
        print('CONCURRENCY PASS: All 5 concurrent initial updates succeeded.')
    app.dependency_overrides.clear()
    await engine.dispose()
    shutil.rmtree(temp_dir, ignore_errors=True)

asyncio.run(run())
"
```
*Expected*: `CONCURRENCY PASS: All 5 concurrent initial updates succeeded.`

### 5.3 Live PostgreSQL State Verification
```bash
.venv/bin/python3 -c "
import asyncio
from backend.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as session:
        res = await session.execute(text('SELECT routine_id, date, count(*) FROM routine_logs GROUP BY routine_id, date HAVING count(*) > 1;'))
        assert len(res.fetchall()) == 0
        res = await session.execute(text(\"SELECT indexname FROM pg_indexes WHERE tablename = 'routine_logs' AND indexname = 'idx_routine_logs_routine_date_unique';\"))
        assert len(res.fetchall()) == 1
        print('LIVE DB PASS: 0 duplicates and unique index active.')

asyncio.run(check())
"
```
*Expected*: `LIVE DB PASS: 0 duplicates and unique index active.`
