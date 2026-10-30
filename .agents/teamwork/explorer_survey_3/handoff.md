# Handoff Report: Survey of Background Tasks, Sync Jobs, Timers, and Numeric Task Persistence Lifecycle

## 1. Observation

### 1.1 Timers, Schedulers, and Polling Loops in Codebase
- **Frontend Background Polling Interval (`frontend/src/App.jsx:435–443`)**:
  ```javascript
  // Background polling every 18 seconds while document is visible
  const pollInterval = setInterval(() => {
    if (isQuickAddOpenRef.current) return;
    if (Date.now() - getLastUserActionTime() < 4000) return;
    if (hasActivePendingMutations()) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      loadData(false, true);
    }
  }, 18000);
  ```
  [Documented] Background polling is scheduled via `setInterval` every 18,000 ms (18 seconds).

- **Pending Mutation Hard Expiration TTL (`frontend/src/api.js:829–832`)**:
  ```javascript
  const now = Date.now();
  // Prune pending entries older than 30s to avoid indefinite sync locks
  const valid = parsed.filter((m) => m && m.created_at && (now - m.created_at < 30000));
  ```
  [Documented] Pending synchronization queue entries older than 30,000 ms (30 seconds) are pruned automatically on `getPendingSyncQueue()` calls.

- **Recent Completed Mutation TTL (`frontend/src/api.js:800, 812–817`)**:
  ```javascript
  const RECENT_MUTATION_TTL = 5000; // 5 seconds grace period to prevent stale backend reads
  ...
  for (const [key, item] of recentCompletedMutations.entries()) {
    if (now - item.completedAt < RECENT_MUTATION_TTL) {
      return true;
    } else {
      recentCompletedMutations.delete(key);
    }
  }
  ```
  [Documented] Completed mutations are preserved in an in-memory Map for exactly 5,000 ms (5 seconds).

- **Backend APScheduler Configuration (`backend/scheduler.py:650–669`)**:
  ```python
  def start_scheduler():
      scheduler.add_job(
          check_user_reminders_and_rollover,
          "interval",
          minutes=1,
          id="check_reminders",
          replace_existing=True,
          next_run_time=datetime.now(),
      )
      scheduler.add_job(
          keep_alive_self_ping,
          "interval",
          minutes=10,
          id="keep_alive_self_ping",
          replace_existing=True,
      )
  ```
  [Documented] The backend scheduler has 1-minute (`check_user_reminders_and_rollover`) and 10-minute (`keep_alive_self_ping`) intervals. No 30–40s interval exists on the backend.

### 1.2 Task Update and Progress Endpoints
- **Frontend `updateTaskProgress` (`frontend/src/api.js:1742–1764`)**:
  ```javascript
  export const updateTaskProgress = async (taskId, { current_value, delta }) => {
    hapticFeedback('light');
    recordUserAction();
    if (!currentUser.id || currentUser.id <= 0) syncTelegramUser();
    const effectiveUserId = currentUser.id > 0 ? currentUser.id : (extractTelegramUser()?.id || 0);
    const mutationId = `progress_task_${taskId}_${Date.now()}`;
    if (current_value !== undefined) {
      addPendingMutation({ id: mutationId, type: 'progress_task', taskId, current_value, timestamp: Date.now() });
    }
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/progress?telegram_id=${effectiveUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_value, delta }),
      });
      if (res.ok) {
        if (current_value !== undefined) removePendingMutation(mutationId);
        return await res.json();
      }
    } catch (e) {}

    if (current_value !== undefined) removePendingMutation(mutationId);
    ...
  ```
  [Documented] When `res.ok` is false (e.g. 401, 404, or network rejection), `removePendingMutation(mutationId)` is executed unconditionally at line 1763, transferring the mutation to `recentCompletedMutations` with a 5-second TTL.

- **Backend `PATCH /api/tasks/{task_id}/progress` (`backend/api/routes.py:636–652`)**:
  ```python
  @router.patch("/tasks/{task_id}/progress", response_model=OneTimeTaskRead)
  async def update_task_progress_endpoint(
      task_id: int,
      progress: ProgressUpdate,
      user: User = Depends(get_current_user),
      session: AsyncSession = Depends(get_db),
  ):
      task = await update_task_progress(
          session,
          task_id,
          user.telegram_id,
          current_value=progress.current_value,
          delta=progress.delta,
      )
      if not task:
          raise HTTPException(status_code=404, detail="Task not found")
      return task
  ```
  [Documented] If `update_task_progress` returns `None`, HTTP 404 is returned.

- **Backend `update_task_progress` Query (`backend/crud.py:703–746`)**:
  ```python
  async def update_task_progress(
      session: AsyncSession,
      task_id: int,
      user_id: int,
      current_value: Optional[float] = None,
      delta: Optional[float] = None,
  ) -> Optional[OneTimeTaskRead]:
      stmt = (
          select(OneTimeTask)
          .options(selectinload(OneTimeTask.goal))
          .where(and_(OneTimeTask.id == task_id, OneTimeTask.user_id == user_id))
      )
      res = await session.execute(stmt)
      task = res.scalar_one_or_none()
      if not task:
          return None
  ```
  [Documented] The query strictly enforces `OneTimeTask.user_id == user_id`. If `task_id` belongs to another `user_id` or is a temporary client-generated timestamp ID (`Date.now()`), the task is not found.

- **Database Column Definitions (`backend/database.py:71–74` & SQLite schema)**:
  ```python
  ("one_time_tasks", "target_value", "FLOAT"),
  ("one_time_tasks", "current_value", "FLOAT DEFAULT 0.0"),
  ("one_time_tasks", "step", "FLOAT DEFAULT 1.0"),
  ("one_time_tasks", "unit", "VARCHAR(32)"),
  ```
  [Documented] In `one_time_tasks`, `current_value` defaults to `0.0`.

- **Reconciliation Routine (`frontend/src/api.js:897–973`)**:
  ```javascript
  export const reconcileDashboardWithPending = (dash) => {
    if (!dash) return dash;
    const mutations = getAllActiveMutations();
    if (mutations.length === 0) return dash;
    ...
    } else if (m.type === 'progress_task') {
      const applyProgress = (t) => {
        if (t.id === m.taskId) {
          const target = t.target_value;
          const val = m.current_value;
          const isDone = target ? val >= target : t.is_completed;
          return {
            ...t,
            current_value: val,
            is_completed: isDone,
          };
        }
        return t;
      };
      todayTasks = todayTasks.map(applyProgress);
  ```
  [Documented] If `mutations.length === 0`, `reconcileDashboardWithPending` immediately returns the un-reconciled server payload `dash`. Strict equality `t.id === m.taskId` is used without string type conversion.

---

## 2. Logic Chain

1. **Step 1 (Optimistic Local Update)**: When a user increments or inputs a numeric value for a quantitative task in `TodayTab.jsx` (lines 681–864), the UI immediately applies an optimistic update to React state (`setDashboardData`) and local storage (`setCachedDashboard`). The user observes the new numeric value immediately.
2. **Step 2 (Mutation Registration & Dispatch)**: `updateTaskProgress` registers the mutation in `localStorage` under `tasker_pending_sync_*` and initiates `PATCH /api/tasks/${taskId}/progress?telegram_id=...`.
3. **Step 3 (Silent Persistence Failure)**:
   - If the backend request fails (e.g. `401 Unauthorized` due to guest context, `404 Not Found` because `task.user_id != user.telegram_id` or `taskId` is a local client-generated timestamp ID from an unpersisted task creation), the error is caught in `catch (e) {}`.
   - Crucially, line 1763 executes `removePendingMutation(mutationId)` regardless of whether the HTTP response was successful.
   - The mutation is removed from the active pending queue and placed into `recentCompletedMutations` with `completedAt = Date.now()`.
4. **Step 4 (Shield Expiration)**:
   - For 5 seconds (`RECENT_MUTATION_TTL = 5000`), `hasActivePendingMutations()` evaluates to `true`, suppressing background fetch operations.
   - After 5 seconds, the entry is evicted from `recentCompletedMutations`.
   - If the mutation was queued without removal, `getPendingSyncQueue` (line 831) has an explicit 30-second hard TTL (`now - m.created_at < 30000`), after which it is pruned.
5. **Step 5 (Periodic Polling Activation at 36 Seconds)**:
   - `App.jsx` line 436 executes a polling loop every 18 seconds (`pollInterval = setInterval(..., 18000)`).
   - On the first tick (18s), user action guard (`Date.now() - getLastUserActionTime() < 4000`) or recent activity may suppress loading, or 18s is the first poll.
   - On the second tick ($18 \times 2 = \mathbf{36\text{ seconds}}$), all guards pass:
     - `Date.now() - getLastUserActionTime() >= 4000` is `true`.
     - `hasActivePendingMutations()` is `false` (pending queue is empty, recent mutations Map is cleared).
     - `document.visibilityState === 'visible'` is `true`.
   - `loadData(false, true)` is invoked.
6. **Step 6 (State Overwrite by Unpersisted DB State)**:
   - `fetchDashboard()` sends `GET /api/dashboard/today`.
   - The backend reads `OneTimeTask` records from PostgreSQL / SQLite (`backend/crud.py:1056`).
   - Because the numeric progress was never committed to the database, the column `current_value` remains at its default value `0.0`.
   - The server returns `{ today_tasks: [{ id: taskId, current_value: 0.0, ... }] }`.
   - `reconcileDashboardWithPending` receives `mutations.length === 0` and returns the raw server data.
   - `setDashboardData(reconciledDash)` overwrites the React component state.
   - The UI resets the numeric value back to `0.0`.

---

## 3. Caveats

1. **Active Database Dialect**: In production, `.env` defines a PostgreSQL connection string to Supabase PgBouncer (`DATABASE_URL=postgresql://...:6543/postgres`), whereas local development and tests can run against `sqlite:///data/taskerbot.db`. Both dialects have identical column definitions (`current_value FLOAT DEFAULT 0.0`), but user IDs and row availability differ between local SQLite and remote Supabase.
2. **Commit `60f2c2a` Scope**: Commit `60f2c2a` attempted to fix Telegram guest authentication and numeric routine progress, but did not resolve the decoupling where failed progress PATCH calls still delete pending mutations, nor did it align `createTask` line 1691 which continues to use `currentUser.id` instead of `effectiveUserId`.

---

## 4. Conclusion

The reset of numeric task values to zero after ~30–40 seconds is caused by the convergence of two specific architectural mechanisms:
1. **Database Persistence Failure**: When a numeric task progress update is submitted, the backend persistence operation fails or is rejected (due to guest/unauthenticated user ID mismatches, 404 errors on local temporary IDs, or unsynchronized task ownership), leaving `one_time_tasks.current_value` at its database default of `0.0`.
2. **Periodic Sync Overwrite Interval (18s × 2 = 36s / 30s TTL)**:
   - The frontend pending mutation shield expires after a 5-second grace window (or 30-second hard TTL via `getPendingSyncQueue`).
   - The background polling loop (`setInterval` at `frontend/src/App.jsx:436`) runs every 18 seconds.
   - At the second polling tick ($t \approx 36\text{ seconds}$), or when window focus/visibility triggers after 30 seconds, `loadData()` fetches the unpersisted `0.0` value from the database and overwrites the optimistic in-memory React state and localStorage cache.

---

## 5. Verification Method

To independently verify these findings:
1. **Verify Polling Interval and Hard TTL**:
   - Inspect `frontend/src/App.jsx:436`: verify `18000` ms interval.
   - Inspect `frontend/src/api.js:831`: verify `30000` ms queue pruning filter.
   - Inspect `frontend/src/api.js:800`: verify `5000` ms `RECENT_MUTATION_TTL`.
2. **Verify Premature Mutation Eviction on Error**:
   - Inspect `frontend/src/api.js:1758` and `1763`: observe that `removePendingMutation(mutationId)` is called in both the `res.ok` block and the post-`catch` block.
3. **Simulate Background Refetch Overwrite**:
   - In browser DevTools on the WebApp, set an optimistic task progress: `updateTaskProgress(taskId, { current_value: 5.0 })` with network throttled or mocked to return 500/404.
   - Observe that after 5 seconds `hasActivePendingMutations()` returns `false`.
   - Wait 36 seconds: observe the `GET /api/dashboard/today` network request and the subsequent UI counter reset back to `0.0`.
