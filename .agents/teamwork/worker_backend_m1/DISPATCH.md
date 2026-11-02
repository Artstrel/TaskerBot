# Worker Dispatch — Milestone 1: Backend Data Models, API Endpoints & Tests

## Objective
Implement and verify backend support for the "Before Leaving" («Перед выходом») feature (Requirements R1 and R2):
1. Database models in `backend/models.py`.
2. Pydantic request/response schemas in `backend/schemas.py`.
3. CRUD functions with transactional integrity and race condition safety in `backend/crud.py`.
4. REST API route registrations under `/api/before-leaving` in `backend/api/routes.py`.
5. Comprehensive automated test suite in `tests/test_before_leaving_backend.py`.

## Input Files
- Original Request: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md`
- Project Specification: `/Users/artstrelani/Documents/TaskerBot/PROJECT.md`
- Test Infrastructure Specification: `/Users/artstrelani/Documents/TaskerBot/TEST_INFRA.md`
- Backend Exploration Report: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/survey_explorer_1/handoff.md`
- Test Infrastructure Exploration Report: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/survey_explorer_3/handoff.md`

## File Ownership & Boundaries
- **Exclusively Owned Files**:
  - `backend/models.py`
  - `backend/schemas.py`
  - `backend/crud.py`
  - `backend/api/routes.py`
  - `tests/test_before_leaving_backend.py`
- **Protected Files (DO NOT TOUCH)**:
  - Do NOT modify `frontend/` files (owned by Milestones 2 and 3).
  - Do NOT modify existing tests in `tests/test_numeric_*.py` or `tests/test_non_numeric_*.py`.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Detailed Requirements

### 1. Database Models (`backend/models.py`)
- `BeforeLeavingItem`:
  - `id`: Integer PK autoincrement
  - `user_id`: BigInteger FK to `users.telegram_id` with `ondelete="CASCADE"`, indexed
  - `title`: String(500), nullable=False
  - `order`: Integer, default=0, indexed
  - `created_at`: DateTime, default UTC
  - `updated_at`: DateTime, default UTC, onupdate UTC
  - Relationship to `User.before_leaving_items`
- `BeforeLeavingSession`:
  - `id`: Integer PK autoincrement
  - `user_id`: BigInteger FK to `users.telegram_id` with `ondelete="CASCADE"`, indexed
  - `is_active`: Boolean, default=True, indexed
  - `started_at`: DateTime, default UTC
  - `completed_at`: Optional DateTime, nullable=True
  - Relationship to `User.before_leaving_sessions`
  - Relationship to `BeforeLeavingCheckItem` with `cascade="all, delete-orphan"`, ordered by `order`
- `BeforeLeavingCheckItem`:
  - `id`: Integer PK autoincrement
  - `session_id`: Integer FK to `before_leaving_sessions.id` with `ondelete="CASCADE"`, indexed
  - `template_item_id`: Optional Integer FK to `before_leaving_items.id` with `ondelete="SET NULL"`, nullable=True
  - `title`: String(500), nullable=False
  - `order`: Integer, default=0
  - `is_checked`: Boolean, default=False, indexed
  - `checked_at`: Optional DateTime, nullable=True
  - Relationship to `BeforeLeavingSession.items`

### 2. Pydantic Schemas (`backend/schemas.py`)
- `BeforeLeavingItemCreate`: `title` (validated non-empty string, auto-capitalized via `capitalize_first`), `order: Optional[int] = 0`.
- `BeforeLeavingItemUpdate`: `title: Optional[str]`, `order: Optional[int]`.
- `BeforeLeavingItemRead`: `id`, `user_id`, `title`, `order`, `created_at`, `updated_at` (`from_attributes = True`).
- `BeforeLeavingItemsReorderRequest`: `item_ids: List[int]`.
- `BeforeLeavingCheckItemRead`: `id`, `session_id`, `template_item_id`, `title`, `order`, `is_checked`, `checked_at` (`from_attributes = True`).
- `BeforeLeavingCheckItemToggle`: `is_checked: Optional[bool] = None`.
- `BeforeLeavingSessionRead`: `id`, `user_id`, `is_active`, `started_at`, `completed_at`, `items: List[BeforeLeavingCheckItemRead]`, `total_count: int`, `completed_count: int`, `is_all_completed: bool` (`from_attributes = True`).

### 3. CRUD Operations (`backend/crud.py`)
- Template CRUD:
  - `get_before_leaving_items(session, user_id)`: order by `order ASC, id ASC`.
  - `create_before_leaving_item(session, user_id, title, order)`: auto-increment order if omitted.
  - `update_before_leaving_item(session, item_id, user_id, title, order)`.
  - `delete_before_leaving_item(session, item_id, user_id)`: returns boolean.
  - `reorder_before_leaving_items(session, user_id, item_ids)`: atomic updates of `order` in a single transaction.
- Session Lifecycle:
  - `get_active_before_leaving_session(session, user_id)`: loads active session with `items`, returns session with counts.
  - `start_before_leaving_session(session, user_id, reset)`:
    - If active session exists and `not reset`: return existing active session (persisting progress).
    - If active session exists and `reset`: mark previous session `is_active = False`.
    - If template items empty: raise `ValueError("No template items configured")`.
    - Snapshot template items into `BeforeLeavingCheckItem` records.
  - `toggle_before_leaving_check_item(session, check_item_id, user_id, is_checked)`: atomic toggle or set, updates `checked_at`.
  - `finish_before_leaving_session(session, user_id)`:
    - Checks that all items are checked (`is_checked == True`). If any item is unchecked, raises `ValueError("Cannot finish session: unfinished items remain")`.
    - Sets `is_active = False`, `completed_at = utcnow()`.

### 4. REST API Routes (`backend/api/routes.py`)
Registered with `get_current_user`:
- `GET /api/before-leaving/items`
- `POST /api/before-leaving/items`
- `PATCH /api/before-leaving/items/{item_id}`
- `DELETE /api/before-leaving/items/{item_id}`
- `PUT /api/before-leaving/items/reorder`
- `GET /api/before-leaving/session/active`
- `POST /api/before-leaving/session/start`
- `PATCH /api/before-leaving/session/items/{item_id}/toggle`
- `POST /api/before-leaving/session/finish`

### 5. Automated Tests (`tests/test_before_leaving_backend.py`)
Create a comprehensive test suite using the standalone SQLite fixture pattern from `tests/test_numeric_tasks_persistence.py`.
Verify:
1. Template item creation, non-empty validation, ordering, update, deletion.
2. Batch reordering and order persistence.
3. Start session with empty template -> returns 400.
4. Start session snapshots template items.
5. `GET /session/active` returns active session with item statuses.
6. Toggle check items, verify `completed_count` and `is_all_completed`.
7. Reloading/fetching active session preserves checked states.
8. Finish session fails with 400 if any item is unchecked.
9. Finish session succeeds when all items are checked, sets `is_active=False`.
10. Subsequent `GET /session/active` returns null.
11. Multi-tenant isolation (user A cannot see or modify user B's template or session).

## Verification Commands
Execute:
1. `.venv/bin/pytest tests/test_before_leaving_backend.py -v`
2. `.venv/bin/pytest tests/ -v` (verify all existing 52 tests pass without regressions)
Document all commands and verbatim test outputs in your `handoff.md`.


## 2026-11-02T15:29:00Z
From: d0d180b2-9527-4f62-be27-64edae1f25bf
Content: Safety timer fired. Please report your current progress, files touched, and estimated time to completion.
Action: Update progress.md with current timestamp and reply with status.
