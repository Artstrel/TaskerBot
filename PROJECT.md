# Project: TaskerBot "Before Leaving" («Перед выходом») Mode

## Architecture
- **Backend**: FastAPI, SQLAlchemy 2.0 (asyncio mode with SQLite dev/test and Supabase PostgreSQL production), Pydantic v2 schemas, `get_current_user` auth dependency.
- **Frontend**: React 19, Vite, custom design system (`index.css` CSS custom properties, `motion/react`, `lucide-react`), Telegram WebApp SDK integration.
- **Core Data Flow**:
  1. **Template Setup (R1)**: User configures list of items/tasks to check before leaving in `BeforeLeavingConfigModal`. Data is saved via `POST/PATCH/DELETE/PUT /api/before-leaving/items`.
  2. **Adaptive Launch (R3)**:
     - On Telegram WebApp iOS: Trigger button is placed inside the Profile Bubble context menu (`ProfileBubbleContextMenu`).
     - On all other devices & breakpoints: Trigger button is placed inline at the same horizontal level as the Profile Bubble.
  3. **Active Mode & Navigation Lock (R2)**:
     - Triggering launches `POST /api/before-leaving/session/start`, which snapshots current template items into `BeforeLeavingCheckItem` rows attached to an active `BeforeLeavingSession`.
     - `BeforeLeavingActiveOverlay` renders at `z-index: 100`, covering 100vw x 100dvh, concealing all navigation elements.
     - Multi-layer hard lock engages: no close button, tab switching concealed/disabled, keyboard shortcuts intercepted, Telegram `enableClosingConfirmation()` and `disableVerticalSwipes()` engaged, browser `popstate` trapped.
     - Checkbox toggles call `PATCH /api/before-leaving/session/items/{id}/toggle`, updating database state.
     - On browser refresh or app restart, `GET /api/before-leaving/session/active` automatically re-locks the UI into the active checklist.
  4. **Unlock & Finish (R2)**:
     - Once all items are checked (`is_all_completed == True`), lock transitions to unlocked state with completion action.
     - User clicks "Завершить и выйти" (`POST /api/before-leaving/session/finish`), which deactivates the session, restores standard navigation, and cleans up closing confirmation locks.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | DB Models for Template & Active Session | SQLAlchemy models `BeforeLeavingItem`, `BeforeLeavingSession`, `BeforeLeavingCheckItem` with User relationships in `backend/models.py` | M1 | survey_explorer_1 |
| 2 | Template CRUD & Reorder Endpoints | REST endpoints in `backend/api/routes.py` for `GET`, `POST`, `PATCH`, `DELETE`, `PUT /reorder` on `/api/before-leaving/items` | M1 | survey_explorer_1 |
| 3 | Active Session & Toggle Endpoints | REST endpoints for active session lifecycle (`/session/active`, `/session/start`, `/session/items/{id}/toggle`, `/session/finish` with completion validation) | M1 | survey_explorer_1 |
| 4 | Backend Automated API Tests | Pytest test suite `tests/test_before_leaving_backend.py` verifying template CRUD, session snapshotting, toggle sync, and finish validation | M1 | survey_explorer_1, survey_explorer_3 |
| 5 | Frontend API Client & State Sync | Methods in `frontend/src/api.js` for template CRUD, session start, item toggle, finish, and active session query | M2 | survey_explorer_2 |
| 6 | Template Configuration Modal (R1) | `BeforeLeavingConfigModal.jsx` allowing users to add, edit, delete, and reorder template items with backend persistence | M2 | survey_explorer_2 |
| 7 | Adaptive Trigger & Context Menu (R3) | `ProfileBubbleContextMenu.jsx` on iOS Telegram WebApp; inline button on same horizontal level as profile bubble on other platforms | M2 | survey_explorer_2 |
| 8 | Fullscreen Blocking Overlay (R2) | `BeforeLeavingActiveOverlay.jsx` with full viewport coverage, progress bar, and interactive checkboxes | M3 | survey_explorer_2 |
| 9 | Multi-Layer Navigation Hard-Lock (R2) | Total lock preventing dismissal or navigation until all items checked (no close button, keyboard trap, popstate trap, Telegram WebApp closing confirmation & swipe disable) | M3 | survey_explorer_2 |
| 10 | Session Sync & Finish Transition (R2) | Checkbox toggle sync with DB, reload recovery, unlock button transition upon 100% completion, and clean exit | M3 | survey_explorer_2 |
| 11 | Comprehensive E2E Test Suite (Tiers 1-4) | End-to-end tests covering Feature Coverage, Boundaries, Cross-Feature interactions, and Real-World Scenarios | M4 | survey_explorer_3 |
| 12 | Adversarial Hardening (Tier 5) & Zero Regression | White-box stress tests, concurrency race verification, and 100% pass on existing 52-test regression suite | M4 | survey_explorer_3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Data Models, API Endpoints & Tests | `backend/models.py`, `backend/schemas.py`, `backend/crud.py`, `backend/api/routes.py`, `tests/test_before_leaving_backend.py` | none | DONE |
| M2 | Frontend Template Editor & Adaptive Trigger | `frontend/src/api.js`, `frontend/src/components/BeforeLeavingConfigModal.jsx`, `frontend/src/components/ProfileBubbleContextMenu.jsx`, `frontend/src/App.jsx`, `frontend/src/index.css` | M1 | DONE |
| M3 | Fullscreen Blocking Checklist & Hard-Lock | `frontend/src/components/BeforeLeavingActiveOverlay.jsx`, `frontend/src/App.jsx`, `frontend/src/index.css`, reload recovery | M1, M2 | PLANNED |
| M4 | Comprehensive E2E Testing & Hardening | Full 4-tier E2E test suite + Tier 5 adversarial testing + 52-test baseline verification | M1, M2, M3 | PLANNED |

## Interface Contracts

### Frontend ↔ Backend: Template Items (`/api/before-leaving/items`)
- `GET /api/before-leaving/items?telegram_id={id}`
  - Response: `200 OK` `List[BeforeLeavingItemRead]`: `[{"id": int, "user_id": int, "title": str, "order": int, "created_at": str, "updated_at": str}]`
- `POST /api/before-leaving/items?telegram_id={id}`
  - Request: `{"title": str, "order": Optional[int]}`
  - Response: `200 OK` `BeforeLeavingItemRead`
- `PATCH /api/before-leaving/items/{item_id}?telegram_id={id}`
  - Request: `{"title": Optional[str], "order": Optional[int]}`
  - Response: `200 OK` `BeforeLeavingItemRead`
- `DELETE /api/before-leaving/items/{item_id}?telegram_id={id}`
  - Response: `200 OK` `{"status": "deleted"}`
- `PUT /api/before-leaving/items/reorder?telegram_id={id}`
  - Request: `{"item_ids": List[int]}`
  - Response: `200 OK` `List[BeforeLeavingItemRead]`

### Frontend ↔ Backend: Active Session (`/api/before-leaving/session`)
- `GET /api/before-leaving/session/active?telegram_id={id}`
  - Response: `200 OK` `Optional[BeforeLeavingSessionRead]`
  - Schema: `{"id": int, "user_id": int, "is_active": bool, "started_at": str, "completed_at": Optional[str], "items": [{"id": int, "session_id": int, "template_item_id": Optional[int], "title": str, "order": int, "is_checked": bool, "checked_at": Optional[str]}], "total_count": int, "completed_count": int, "is_all_completed": bool}`
- `POST /api/before-leaving/session/start?telegram_id={id}`
  - Request: `{"reset": bool = False}`
  - Response: `200 OK` `BeforeLeavingSessionRead`
  - Error: `400 Bad Request` if template is empty
- `PATCH /api/before-leaving/session/items/{item_id}/toggle?telegram_id={id}`
  - Request: `{"is_checked": Optional[bool] = None}`
  - Response: `200 OK` `BeforeLeavingSessionRead`
- `POST /api/before-leaving/session/finish?telegram_id={id}`
  - Response: `200 OK` `BeforeLeavingSessionRead`
  - Error: `400 Bad Request` if `is_all_completed == False` (`"Cannot finish session: unfinished items remain"`)

## Code Layout
- `backend/models.py`: Database models (`BeforeLeavingItem`, `BeforeLeavingSession`, `BeforeLeavingCheckItem`)
- `backend/schemas.py`: Pydantic validation schemas
- `backend/crud.py`: Database CRUD and transaction logic
- `backend/api/routes.py`: REST API route registrations under `/api/before-leaving`
- `frontend/src/api.js`: API client functions for template and session operations
- `frontend/src/components/BeforeLeavingConfigModal.jsx`: Template configuration modal (R1)
- `frontend/src/components/ProfileBubbleContextMenu.jsx`: iOS Telegram context menu (R3)
- `frontend/src/components/BeforeLeavingActiveOverlay.jsx`: Fullscreen blocking checklist (R2)
- `frontend/src/App.jsx`: Top-level state, adaptive button integration, and hard-lock coordination
- `frontend/src/index.css`: Styles and design tokens for modal, overlay, and context menu
- `tests/test_before_leaving_backend.py`: Backend API and regression test suite
- `tests/test_before_leaving_e2e.py`: End-to-end integration test suite (Tiers 1-4)
