# Project: TaskerBot Numeric Task Persistence Fix

## Architecture
- **Backend**: FastAPI, SQLAlchemy 2.0 (asyncio mode), Supabase PostgreSQL (production) & SQLite (local fallback/dev), Pydantic v2.
- **Frontend**: React 19, Vite, Telegram WebApp SPA (`frontend/src/api.js`, `frontend/src/App.jsx`, `frontend/src/components/TodayTab.jsx`).
- **Core Data Flow**:
  1. User increments numeric task via stepper (+/-) or checkbox in `TodayTab.jsx`.
  2. Frontend applies optimistic state and queues mutation in `localStorage` under dynamic `getPendingSyncKey()`.
  3. `updateRoutineProgress` / `updateTaskProgress` sends `PATCH /api/routines/{id}/progress` or `PATCH /api/tasks/{id}/progress` with `getEffectiveUserId()`.
  4. Backend retrieves/creates `RoutineLog` for `(routine_id, target_date)` protected by `UniqueConstraint("routine_id", "date")` with `try ... except IntegrityError` concurrency retry, commits to DB, and returns updated task.
  5. Background poller runs every 18 seconds via `setInterval` in `App.jsx`, fetching `/api/dashboard/today`.
  6. Reconciler merges active pending mutations with server snapshot and renders UI without resetting counter to zero.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | DB UniqueConstraint & Deduplication | RoutineLog table UniqueConstraint("routine_id", "date") and database migration to clean existing duplicates | M1 | explorer_survey_2 |
| 2 | Robust Backend CRUD queries | Replace unsafe scalar_one_or_none() in update_routine_progress, toggle_routine_completion, update_routine; handle deduplication in get_user_routines_with_status | M1 | explorer_survey_2 |
| 3 | Frontend Auth Context & Sync Key | Consistent effectiveUserId and dynamic getPendingSyncKey across fetchDashboard, createTask, updateTask, createRoutine; retain X-Telegram-Init-Data | M1 | explorer_survey_1 |
| 4 | Frontend Error & Polling Resilience | Do not evict pending mutations on network/HTTP failure in updateRoutineProgress/updateTaskProgress; prevent unpersisted DB overwrite | M1 | explorer_survey_3 |
| 5 | Secondary Fixes | Add grocery_items numeric columns to database.py init_db(); add quantitative fields to frontend direct AI prompts | M1 | explorer_survey_1 |
| 6 | E2E Testing Suite | Comprehensive test suite verifying persistence across >40s polling interval and no regression on other task types | M-TEST | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Numeric Task Persistence Fix | backend/models.py, backend/database.py, backend/crud.py, frontend/src/api.js | none | DONE |
| M-TEST | E2E Testing Suite & Regression Verification | Comprehensive test harness: 40s+ persistence verification, routine/one-off/goal regression tests (52 tests across 3 modules) | M1 | DONE |

## Interface Contracts
### Frontend ↔ Backend (PATCH /api/routines/{id}/progress)
- **Request**: `PATCH /api/routines/{id}/progress?telegram_id={id}`, body: `{"current_value": float, "delta": float}`
- **Response**: `200 OK` with `RoutineStatusRead` schema: `{"id": int, "title": str, "target_value": float, "current_value": float, "step": float, "unit": str, "is_completed": bool}`
- **Error**: `404 Not Found` if routine not found or not owned by user, `401 Unauthorized` if unauthenticated.

### Frontend ↔ Backend (PATCH /api/tasks/{id}/progress)
- **Request**: `PATCH /api/tasks/{id}/progress?telegram_id={id}`, body: `{"current_value": float, "delta": float}`
- **Response**: `200 OK` with `OneTimeTaskRead` schema: `{"id": int, "title": str, "target_value": float, "current_value": float, "step": float, "unit": str, "is_completed": bool}`

## Code Layout
- `backend/models.py`: SQLAlchemy models (`RoutineLog`, `RoutineTask`, `OneTimeTask`, `GroceryItem`)
- `backend/database.py`: `init_db()`, migration runner, `AsyncSessionLocal`
- `backend/crud.py`: `update_routine_progress`, `toggle_routine_completion`, `update_routine`, `get_user_routines_with_status`, `update_task_progress`
- `frontend/src/api.js`: `updateRoutineProgress`, `updateTaskProgress`, `fetchDashboard`, `getEffectiveUserId`, `getPendingSyncKey`
- `frontend/src/App.jsx`: 18s polling loop
- `tests/test_numeric_tasks_persistence.py`: E2E 4-tier test suite (22 tests)
- `tests/test_numeric_challenge_stress.py`: Concurrency and time persistence stress tests (13 tests)
- `tests/test_non_numeric_regressions_stress.py`: Non-numeric regression stress tests (17 tests)
