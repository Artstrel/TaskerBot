# Worker Dispatch — Milestone 2: Frontend Template Editor & Adaptive Trigger

## Objective
Implement frontend functionality for R1 (Template configuration) and R3 (Adaptive launch button placement):
1. API client functions in `frontend/src/api.js`.
2. Template configuration modal in `frontend/src/components/BeforeLeavingConfigModal.jsx`.
3. Profile bubble context menu in `frontend/src/components/ProfileBubbleContextMenu.jsx`.
4. Adaptive button placement and modal integration in `frontend/src/App.jsx`.
5. CSS styling in `frontend/src/index.css`.

## Input Information
- Authoritative Request: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md`
- Project Specification: `/Users/artstrelani/Documents/TaskerBot/PROJECT.md`
- Frontend Architectural Blueprint: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/survey_explorer_2/handoff.md`
- Backend API Specification: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/survey_explorer_1/handoff.md`

## File Ownership
- Exclusively owns:
  - `frontend/src/api.js`
  - `frontend/src/components/BeforeLeavingConfigModal.jsx`
  - `frontend/src/components/ProfileBubbleContextMenu.jsx`
  - `frontend/src/App.jsx`
  - `frontend/src/index.css`
- Do NOT touch `backend/` files.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Detailed Requirements

### 1. API Client (`frontend/src/api.js`)
Implement and export:
- `fetchBeforeLeavingItems(userId)` -> `GET /api/before-leaving/items?telegram_id={id}`
- `createBeforeLeavingItem(data, userId)` -> `POST /api/before-leaving/items?telegram_id={id}` (`data: { title: str, order?: int }`)
- `updateBeforeLeavingItem(id, data, userId)` -> `PATCH /api/before-leaving/items/{id}?telegram_id={id}` (`data: { title?: str, order?: int }`)
- `deleteBeforeLeavingItem(id, userId)` -> `DELETE /api/before-leaving/items/{id}?telegram_id={id}`
- `reorderBeforeLeavingItems(itemIds, userId)` -> `PUT /api/before-leaving/items/reorder?telegram_id={id}` (`itemIds: number[]`)
- `fetchActiveBeforeLeavingSession(userId)` -> `GET /api/before-leaving/session/active?telegram_id={id}`
- `startBeforeLeavingSession(reset = False, userId)` -> `POST /api/before-leaving/session/start?telegram_id={id}`
- `toggleBeforeLeavingCheckItem(itemId, isChecked, userId)` -> `PATCH /api/before-leaving/session/items/{itemId}/toggle?telegram_id={id}`
- `finishBeforeLeavingSession(userId)` -> `POST /api/before-leaving/session/finish?telegram_id={id}`
Ensure proper authentication handling (`getEffectiveUserId()`, headers, error handling, local cache fallback).

### 2. Template Configuration Modal (`frontend/src/components/BeforeLeavingConfigModal.jsx`)
- Rendered conditionally inside `<AnimatePresence>` with backdrop blur (`.sheet-backdrop`).
- Add item form:
  - Input field with automatic first-letter capitalization (`capitalizeFirst`), max length 500 chars.
  - "Добавить" button and Enter key submission.
- Item list:
  - Displays all template items in order.
  - Inline title editing or edit modal/state.
  - Delete button (trash icon) with confirmation or immediate delete.
  - Up and Down reorder buttons (or drag) calling `reorderBeforeLeavingItems`.
  - Empty state message: "Список вещей пуст. Добавьте то, что нужно проверить перед выходом из дома (ключи, документы, выключить утюг...)".
- Header with title "Перед выходом: Настройка шаблона" and close button.

### 3. Profile Bubble Context Menu (`frontend/src/components/ProfileBubbleContextMenu.jsx`)
- Floating popover dropdown anchored to the Profile Bubble.
- Rendered on Telegram WebApp on iOS when clicking or tapping the profile bubble.
- Menu options:
  1. 🚪 **Перед выходом** (calls `handleStartBeforeLeaving`).
  2. ⚙️ **Настроить список** (opens `BeforeLeavingConfigModal`).
  3. 🔄 **Обновить** (calls `handlePillRefresh`).
- Click outside / backdrop closes the context menu.

### 4. Adaptive Placement in `frontend/src/App.jsx` (Requirement R3)
- Helper `isTelegramIos()`:
  - Returns `true` if `tg.platform === 'ios'` or user agent indicates iOS inside Telegram WebApp.
  - Returns `false` on Desktop (tdesktop, macos, web) and Android or regular browser.
- **On Telegram iOS**:
  - The "Перед выходом" mode button is inside `ProfileBubbleContextMenu` attached to the Profile Bubble (`.header-profile-bubble`).
- **On all other platforms and breakpoints** (Desktop sidebar and non-iOS Mobile header):
  - A dedicated "Перед выходом" button is placed **on the same horizontal level (same line)** as the Profile Bubble:
    - Desktop: In `.sidebar-top-bar` right beside the profile bubble.
    - Mobile: In `.app-header` right beside the mobile profile bubble.
  - Button styling matches the header pills: clean icon (e.g. `LogOut` or `DoorOpen` or `CheckSquare` from `lucide-react`) + "Перед выходом" label.
  - Clicking starts active mode or opens menu/settings if template is empty.

### 5. Styling (`frontend/src/index.css`)
- Styles for `.before-leaving-modal`, `.before-leaving-context-menu`, `.before-leaving-header-btn`.
- Responsive behavior, dark/light theme tokens, safe area padding for iOS Telegram.

## Verification Requirements
Execute:
1. `npm --prefix frontend run build` (must exit 0 with valid production assets in `frontend/dist/`)
2. `npm --prefix frontend run lint` (must pass with 0 errors)
3. Ensure no existing UI components are broken.
Document all commands and verification results in `handoff.md`.


## 2026-11-02T16:10:00Z
You are Worker (Frontend Specialist) for Milestone 2.
Your working directory is: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m2
Read /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md and /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m2/DISPATCH.md.
Also read /Users/artstrelani/Documents/TaskerBot/PROJECT.md and /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/survey_explorer_2/handoff.md.

Implement the frontend template editor in frontend/src/components/BeforeLeavingConfigModal.jsx, profile bubble context menu in frontend/src/components/ProfileBubbleContextMenu.jsx, api methods in frontend/src/api.js, adaptive button placement in frontend/src/App.jsx, and CSS in frontend/src/index.css.
Verify build: npm --prefix frontend run build
Verify lint: npm --prefix frontend run lint

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Document your implementation and verification in /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m2/handoff.md.
When finished, send a completion message with summary and path to your handoff.md.
