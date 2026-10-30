# Handoff Report: Investigation of Quantitative Tasks Schema, Persistence & 30–40s Reset Bug

## 1. Observation

### 1.1 Project Structure & Tech Stack
- **Backend**:
  - Python 3.12+, FastAPI 0.110+, SQLAlchemy 2.0+ (asyncio mode), asyncpg 0.29+, aiosqlite 0.20+, Pydantic v2, APScheduler 3.10+.
  - Entry points: `main.py`, `backend/api/routes.py`, `backend/database.py`, `backend/crud.py`, `backend/models.py`, `backend/auth.py`.
- **Database Architecture**:
  - Primary production configuration (`.env`): Remote Supabase PostgreSQL instance via PgBouncer Transaction Pooler (`aws-0-eu-central-1.pooler.supabase.com:6543`, `statement_cache_size=0`).
  - Fallback local database: SQLite via `sqlite+aiosqlite:///data/taskerbot.db`.
- **Frontend**:
  - React 19.3 / Vite 8.3 SPA hosted on GitHub Pages CDN (`https://artstrel.github.io/TaskerBot`).
  - API and State Layer: `frontend/src/api.js`, `frontend/src/App.jsx`, `frontend/src/components/TodayTab.jsx`, `frontend/src/components/QuickAddModal.jsx`.

---

### 1.2 Model & Database Schema Verification
- In `backend/models.py`:
  - `OneTimeTask` (lines 146–149):
    ```python
    target_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_value: Mapped[float] = mapped_column(Float, default=0.0)
    step: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=1.0)
    unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    ```
  - `RoutineTask` (lines 104–106):
    ```python
    target_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    step: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=1.0)
    unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    ```
  - `RoutineLog` (lines 125–126):
    ```python
    current_value: Mapped[float] = mapped_column(Float, default=0.0)
    ```
  - `GroceryItem` (lines 167–170):
    ```python
    target_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_value: Mapped[float] = mapped_column(Float, default=0.0)
    step: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=1.0)
    unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    ```
- In remote Supabase PostgreSQL (`information_schema.columns` query):
  - Verified presence of `target_value`, `current_value`, `step`, and `unit` across all tables: `one_time_tasks`, `routine_tasks`, `routine_logs`, and `grocery_items`.
- In `backend/database.py` (lines 52–76):
  - In `init_db()`, migration list includes:
    `routine_tasks` (`target_value`, `step`, `unit`, `frequency_type`, `interval_days`, `days_of_week`, `start_date`)
    `routine_logs` (`current_value`)
    `one_time_tasks` (`target_value`, `current_value`, `step`, `unit`, `scheduled_time`)
    `users` settings columns.
  - **DEFECT OBSERVED**: Columns for `grocery_items` (`target_value`, `current_value`, `step`, `unit`) are completely omitted from the `migrations` list in `init_db()`. In legacy SQLite databases, these columns will not be created.

---

### 1.3 Persistence & ORM Execution Mechanics
- In `backend/crud.py`:
  - `update_task_progress` (lines 728–745):
    ```python
    new_val = max(0.0, round(float(new_val), 2))
    task.current_value = new_val
    ...
    await session.commit()
    await session.refresh(task)
    return _task_to_read(task)
    ```
  - `update_routine_progress` (lines 480–501):
    ```python
    new_val = max(0.0, round(float(new_val), 2))
    log.current_value = new_val
    ...
    await session.commit()
    await session.refresh(routine)
    await session.refresh(log)
    return _routine_to_status(routine, log)
    ```
  - `get_day_summary` (lines 1047–1078):
    Calls `get_user_routines_with_status` and `get_day_and_upcoming_tasks`, both of which properly serialize `current_value`.
  - **Empirical test**: Running isolated session commit & read tests via `.venv/bin/python3` verified that both `OneTimeTask` and `RoutineTask` successfully commit progress updates to the database and reload with the updated `current_value`.

---

### 1.4 Frontend Polling & State Desynchronization (The Root of the 30–40s Reset)
1. **Background Polling Interval**:
   In `frontend/src/App.jsx` (lines 435–443):
   ```javascript
   const pollInterval = setInterval(() => {
     if (isQuickAddOpenRef.current) return;
     if (Date.now() - getLastUserActionTime() < 4000) return;
     if (hasActivePendingMutations()) return;
     if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
       loadData(false, true);
     }
   }, 18000);
   ```
   Polling interval is set to **18 seconds (18,000 ms)**.
2. **Optimistic Mutation TTL**:
   In `frontend/src/api.js` (lines 799–800):
   ```javascript
   const recentCompletedMutations = new Map();
   const RECENT_MUTATION_TTL = 5000; // 5 seconds grace period
   ```
   Mutations are shielded in memory for exactly **5 seconds**.
3. **Discrepancy in User Context Resolution**:
   - In `frontend/src/api.js`:
     In `updateTaskProgress` (line 1746) and `updateRoutineProgress` (line 1811):
     ```javascript
     const effectiveUserId = currentUser.id > 0 ? currentUser.id : (extractTelegramUser()?.id || 0);
     const res = await fetch(`${API_BASE}/tasks/${taskId}/progress?telegram_id=${effectiveUserId}`, ...);
     ```
   - In `fetchDashboard` (lines 1314–1319):
     ```javascript
     const res = await fetch(
       `${API_BASE}/dashboard/today?telegram_id=${currentUser.id}&first_name=${encodeURIComponent(
         currentUser.first_name || ''
       )}`,
       { signal: controller.signal }
     );
     ```
     `fetchDashboard` uses raw `currentUser.id`! It does NOT fall back to `extractTelegramUser()?.id`.
   - In `createTask` (line 1691), `updateTask` (line 1724), `createRoutine` (line 1901):
     ```javascript
     const res = await fetch(`${API_BASE}/tasks?telegram_id=${currentUser.id}`, ...);
     ```
4. **Authentication Failure & Cache Reset**:
   - In `backend/api/routes.py` (`get_current_user`, lines 141–144):
     ```python
     if effective_id is None:
         if telegram_id is not None and telegram_id > 0:
             effective_id = telegram_id
         else:
             raise HTTPException(status_code=401, detail="Authentication credentials required")
     ```
     When `telegram_id=0` is passed, backend returns `HTTP 401 Unauthorized`.
   - In `frontend/src/api.js` (lines 289–296):
     ```javascript
     const res = await _origFetch(input, reqInit);
     if (res.status === 401 && !urlStr.includes('/auth/')) {
       console.warn('API returned 401 Unauthorized, clearing stale token');
       clearAuthSession();
       if (tgInitData) {
         authenticateWithTelegramWebApp(tgInitData).catch(() => {});
       }
     }
     ```
     Upon 401, `clearAuthSession()` resets `currentUser.id = 0`.
   - In `fetchDashboard` (lines 1341–1348):
     When `res.ok` is false, it falls back to:
     ```javascript
     const cached = getCachedDashboard();
     if (cached) return cached;
     const db = getLocalDb();
     ...
     return fallbackData;
     ```
     In `getLocalDb()`, tasks have `current_value: 0.0`.
5. **Static Module Constant Trap**:
   In `frontend/src/api.js` (line 797):
   ```javascript
   const PENDING_SYNC_KEY = `tasker_pending_sync_${currentUser.id}`;
   ```
   Evaluated once at script parse time when `currentUser.id` is 0. Does not update when user logs in.
6. **Direct Client AI Stripping Fields**:
   In `frontend/src/api.js`:
   `parseTextWithDirectGemini` (line 2628), `parseTextWithDirectGroq` (line 2710), `parseTextWithDirectOpenRouter` (line 2922):
   ```text
   Каждый элемент: {"category": "routine"|"one_time"|"goal"|"grocery", "title": "...", "scheduled_date": "...", "scheduled_time": "..."}
   ```
   System prompts do not include `target_value`, `step`, or `unit` (unlike `backend/ai_service.py`). Tasks created via direct AI have `target_value: null`.

---

## 2. Logic Chain

```
[Observation 1.4.1: Polling timer fires every 18 seconds in App.jsx]
                   │
                   ▼
[Observation 1.4.2: RECENT_MUTATION_TTL protects optimistic updates for 5 seconds]
                   │
                   ▼
Step 1: At t = 0s, user increments task counter. React state updates optimistically.
        Mutation is stored in memory for 5 seconds.
                   │
                   ▼
Step 2: At t = 5s, mutation TTL expires and is pruned from recentCompletedMutations.
        hasActivePendingMutations() becomes FALSE.
                   │
                   ▼
Step 3: At t = 36s (2nd tick of 18s polling timer):
        App.jsx executes loadData(false, true) -> fetchDashboard().
                   │
                   ▼
[Observation 1.4.3 & 1.4.4: Discrepancy between effectiveUserId and currentUser.id]
                   │
                   ▼
Step 4: If currentUser.id is 0 (uninitialized or desynchronized):
        fetchDashboard sends GET /dashboard/today?telegram_id=0.
        Backend rejects with HTTP 401 Unauthorized.
        api.js fetch interceptor calls clearAuthSession().
                   │
                   ▼
Step 5: fetchDashboard falls back to getLocalDb() where tasks have current_value = 0.0.
        App.jsx executes setDashboardData(fallbackData).
                   │
                   ▼
Conclusion: Exactly after 30-40 seconds (at the 2nd poll tick of 36s),
            the UI state is overwritten with 0.0.
```

Furthermore, for tasks created while `currentUser.id == 0`:
```
Step A: createTask sends POST /tasks?telegram_id=0 -> 401 error.
Step B: createTask falls back to local DB with generated timestamp id (Date.now()).
Step C: User clicks stepper -> PATCH /tasks/{timestamp}/progress?telegram_id={id}.
Step D: Backend returns 404 Not Found (task does not exist in DB).
Step E: Task progress was never persisted to the backend database;
        it existed purely in transient client memory for 5 seconds.
```

---

## 3. Caveats
- No caveats regarding backend ORM schema: Supabase PostgreSQL and SQLAlchemy models are fully consistent.
- The Render backend instance experiences cold-start latency (~30-50s when sleeping on free tier). While Render wakes up, calls to `fetchDashboard` return local fallback, which exhibits the same symptom if the local fallback has `current_value: 0.0`.
- Authentication via Telegram WebApp initData is dependent on the `X-Telegram-Init-Data` header which was missing on raw `fetch` calls in `fetchDashboard`.

---

## 4. Conclusion
The issue is NOT a database schema defect or missing ORM column. The ORM models and remote database schema correctly contain all required numeric attributes.

The 30–40 second reset is caused by an architectural desynchronization on the frontend:
1. **User context mismatch**: `updateTaskProgress` resolved `effectiveUserId = currentUser.id > 0 ? currentUser.id : extractTelegramUser()?.id`, but `fetchDashboard`, `createTask`, `updateTask`, and `createRoutine` queried `telegram_id=${currentUser.id}` directly.
2. **18-second Polling + 5-second TTL**: After 5 seconds, optimistic state protection drops. At the next background poll (18s / 36s), `fetchDashboard` executes with `telegram_id=0`, receives 401, triggers `clearAuthSession()`, and replaces React state with local fallback data (`current_value = 0.0`).
3. **Module constant `PENDING_SYNC_KEY`**: Static evaluation prevents proper queue synchronization after user profile resolution.
4. **Client Direct AI prompt truncation**: Drops `target_value`, `step`, and `unit` when parsing text in browser.
5. **Database migration gap**: SQLite `init_db()` is missing migrations for `grocery_items`.

---

## 5. Verification Method

### 5.1 Independent Verification Commands
1. **Verify Backend Models and DB Commits**:
   ```bash
   .venv/bin/python3 -c "
   import asyncio
   from datetime import date
   from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
   from backend.models import Base
   from backend.crud import create_one_time_task, update_task_progress, get_day_summary, get_or_create_user

   async def run():
       engine = create_async_engine('sqlite+aiosqlite:///:memory:')
       async with engine.begin() as conn:
           await conn.run_sync(Base.metadata.create_all)
       Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
       async with Session() as session:
           user = await get_or_create_user(session, 9999, 'test', 'Test')
           task = await create_one_time_task(session, user.telegram_id, 'Run 10km', date.today(), target_value=10.0, step=2.0)
           await update_task_progress(session, task.id, user.telegram_id, current_value=6.0)
       async with Session() as session:
           user = await get_or_create_user(session, 9999, 'test', 'Test')
           summary = await get_day_summary(session, user)
           assert summary.today_tasks[0].current_value == 6.0
           print('VERIFICATION SUCCESS: ORM commits and reloads correctly')
   asyncio.run(run())
   "
   ```
2. **Verify Frontend Build & Oxlint**:
   ```bash
   cd frontend && npm run lint && npm run build
   ```
3. **Files to Inspect for Implementer**:
   - `frontend/src/api.js`: lines 797 (`PENDING_SYNC_KEY`), lines 1310–1325 (`fetchDashboard`), lines 1688–1735 (`createTask`, `updateTask`), lines 1898–1908 (`createRoutine`), lines 2628, 2710, 2922 (Direct AI prompts).
   - `backend/database.py`: lines 52–76 (`migrations` list for `grocery_items`).

### 5.2 Concrete Diff Proposals for Implementer

#### Proposed Change 1: `frontend/src/api.js`
Replace static `PENDING_SYNC_KEY` with dynamic helper:
```javascript
export const getEffectiveUserId = () => {
  if (currentUser && currentUser.id > 0) return currentUser.id;
  const tgUser = extractTelegramUser();
  if (tgUser && tgUser.id > 0) return tgUser.id;
  return 0;
};

export const getPendingSyncKey = () => `tasker_pending_sync_${getEffectiveUserId()}`;
```
Update `fetchDashboard`, `createTask`, `createRoutine`, `updateTask`, `fetchGoals`, `fetchGroceries` to consistently use:
```javascript
const effectiveUserId = getEffectiveUserId();
```
And pass `X-Telegram-Init-Data` header in `fetchDashboard`:
```javascript
const headers = {};
const tgInitData = window.Telegram?.WebApp?.initData;
if (tgInitData) headers['X-Telegram-Init-Data'] = tgInitData;
```

#### Proposed Change 2: `backend/database.py`
Add missing `grocery_items` migrations to `migrations` array:
```python
("grocery_items", "target_value", "FLOAT"),
("grocery_items", "current_value", "FLOAT DEFAULT 0.0"),
("grocery_items", "step", "FLOAT DEFAULT 1.0"),
("grocery_items", "unit", "VARCHAR(32)"),
```

#### Proposed Change 3: `frontend/src/api.js` (Direct AI Prompts)
Update JSON structure prompt in `parseTextWithDirectGemini`, `parseTextWithDirectGroq`, `parseTextWithDirectOpenRouter`:
```text
Каждый элемент: {"category": "routine"|"one_time"|"goal"|"grocery", "title": "краткое название задачи с большой буквы", "scheduled_date": "YYYY-MM-DD"|null, "scheduled_time": "HH:MM"|null, "target_value": float|null, "step": float|null, "unit": string|null}
```
