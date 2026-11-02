# Dispatch: worker_frontend_m3 (Frontend Milestone 3 Implementation)

## Mission
Implement Milestone 3 (Requirement R2) in TaskerBot: Fullscreen Blocking Checklist & Multi-Layer Hard-Lock.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Context & Inputs
- Authoritative User Request: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md` (Read this first!)
- Project Scope: `/Users/artstrelani/Documents/TaskerBot/PROJECT.md`
- Working Directory: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m3/`
- Reference Blueprints from Explorers:
  - `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m3_1/handoff.md` (Component architecture & styling)
  - `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m3_2/handoff.md` (Multi-layer hard-lock)
  - `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m3_3/handoff.md` (Session sync, API client & boot recovery)

## Target Files & Write Ownership
You have exclusive write ownership over:
- `frontend/src/components/BeforeLeavingActiveOverlay.jsx` (New component)
- `frontend/src/api.js`
- `frontend/src/App.jsx`
- `frontend/src/index.css`

## Implementation Tasks

### 1. `frontend/src/api.js`
- Add synchronous localStorage caching helpers:
  - `getCachedActiveBeforeLeavingSession(userId)`
  - `setCachedActiveBeforeLeavingSession(session, userId)`
  - `clearCachedActiveBeforeLeavingSession(userId)`
- Update `fetchActiveBeforeLeavingSession`, `startBeforeLeavingSession`, `toggleBeforeLeavingCheckItem`, `finishBeforeLeavingSession` to update or clear the local cache synchronously and return clean response objects or error details.

### 2. `frontend/src/components/BeforeLeavingActiveOverlay.jsx`
- Create component with:
  - Fullscreen blocking layout: `position: fixed; inset: 0; z-index: 100; width: 100vw; height: 100dvh; background: var(--bg-app); overscroll-behavior: contain;`.
  - Header: Lock icon / badge, title «Перед выходом», counter `{completedCount} из {totalCount}`, and animated progress bar (`motion.div`).
  - Interactive checklist: Render items snapshot from session, using `AnimatedCheckbox` (`size={22}`), item title, strikethrough/dimming on checked items (`opacity: 0.65`, `text-decoration: line-through`), accessible min 48px touch target.
  - Completion / Unlock state: When `session.is_all_completed === true`:
    - Celebration banner with unlocked badge.
    - Action button «Завершить и выйти» calling `onFinish()`.
  - Hard lock defense:
    - NO close / dismiss button while `!session.is_all_completed`.
    - Trap `Escape` key so it does not dismiss overlay or app.
    - Trap `popstate` / back navigation: push state to history on mount so hardware/browser back button cannot exit the mode while incomplete.

### 3. `frontend/src/App.jsx`
- State initialization:
  - Lazy load from cache: `activeBeforeLeavingSession` and `isBeforeLeavingActive`.
- `loadData()` boot check:
  - Call `fetchActiveBeforeLeavingSession()`. If active, sync state and cache. If inactive/null, clean state and cache.
- Session start:
  - In `handleStartBeforeLeaving()`: Call `startBeforeLeavingSession()`. If successful, activate session and overlay. If empty template error (HTTP 400), open `BeforeLeavingConfigModal` with notification.
- Checkbox toggle:
  - In `handleToggleCheckItem(itemId)`: Optimistically update target item, recalculate counts, update cache and state. Call `toggleBeforeLeavingCheckItem()`. Reconcile on success, roll back on failure with error haptic.
- Session finish:
  - In `handleFinishBeforeLeaving()`: Call `finishBeforeLeavingSession()`. On success, clear session state and cache, close overlay, disengage Telegram closing confirmation / swipe lock, and trigger success haptic.
- Multi-layer hard lock:
  - Apply `.before-leaving-mode-active` class when `isBeforeLeavingActive` is true.
  - Suppress keyboard shortcuts (`c`, `n`, `Escape`) when `isBeforeLeavingActive` is true.
  - Call Telegram WebApp `enableClosingConfirmation()` and `disableVerticalSwipes()` when active; call `disableClosingConfirmation()` and `enableVerticalSwipes()` on finish.
  - Guard `handleTabSwitch`: ignore tab switch if `isBeforeLeavingActive` is true.
  - Render `<BeforeLeavingActiveOverlay>` when `isBeforeLeavingActive && activeBeforeLeavingSession`.

### 4. `frontend/src/index.css`
- Add styling for overlay, container, header, progress bar, checklist cards, celebration banner, and finish button using semantic CSS variables (`var(--bg-app)`, `var(--text-primary)`, `var(--bg-card)`, etc.) supporting dark and light themes with WCAG AA/AAA contrast.
- Add `.before-leaving-mode-active` rules concealing `.desktop-sidebar`, `.app-header`, `.bottom-dock`, `.app-fab` (`pointer-events: none; opacity: 0; visibility: hidden;`).

## Verification Requirements
Run and verify:
1. `npm --prefix frontend run build` -> exit 0
2. `npm --prefix frontend run lint` -> 0 errors
3. Run existing frontend tests:
   - `node --experimental-vm-modules tests/test_frontend_m2_challenge.mjs`
   - `node tests/test_frontend_template_crud.mjs`
   - `node tests/test_profile_bubble_event_coordination.mjs`
   - `node tests/test_challenger_frontend_m2_empirical.mjs`
4. Run backend pytest suite: `.venv/bin/pytest tests/` -> 103 passed
5. Create or extend automated test verifying Milestone 3 checklist lifecycle, hard-lock, toggle sync, and unlock transition.

Write comprehensive handoff report to `handoff.md` with build/test outputs and notify parent via `send_message`.


## 2026-11-02T17:40:25Z
From: d0d180b2-9527-4f62-be27-64edae1f25bf
Message:
You are worker_frontend_m3 (Frontend Milestone 3 Implementation Worker).
Your working directory is: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m3/
Read your task instructions in: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m3/DISPATCH.md
Read the authoritative user request: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md
Read the project specifications: /Users/artstrelani/Documents/TaskerBot/PROJECT.md

Read the implementation blueprints from the 3 Explorers:
- /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m3_1/handoff.md
- /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m3_2/handoff.md
- /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m3_3/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement Milestone 3 (Requirement R2):
1. `frontend/src/api.js`: Add localStorage caching helpers (`getCachedActiveBeforeLeavingSession`, `setCachedActiveBeforeLeavingSession`, `clearCachedActiveBeforeLeavingSession`) and ensure `fetchActiveBeforeLeavingSession`, `startBeforeLeavingSession`, `toggleBeforeLeavingCheckItem`, `finishBeforeLeavingSession` update/clear cache synchronously and handle errors properly.
2. `frontend/src/components/BeforeLeavingActiveOverlay.jsx`: Create the fullscreen blocking overlay with header (lock badge, title «Перед выходом», counter `{completedCount} из {totalCount}`, animated progress bar), interactive checklist with `AnimatedCheckbox` (`size={22}`), completion / unlock banner with action button «Завершить и выйти» calling finish handler, no close button while incomplete, Escape key suppression, and history popstate trap.
3. `frontend/src/App.jsx`: State initialization from cache, boot sync in `loadData`, `handleStartBeforeLeaving` (with empty template HTTP 400 guard), `handleToggleCheckItem` (granular optimistic update with rollback on failure), `handleFinishBeforeLeaving` (cleanup, clearing cache, disengaging Telegram locks, haptic feedback), multi-layer hard lock (concealing navigation elements via `.before-leaving-mode-active`, suppressing keyboard shortcuts `c`, `n`, `Escape`, Telegram `enableClosingConfirmation`/`disableVerticalSwipes`, guarding `handleTabSwitch`).
4. `frontend/src/index.css`: Styles for overlay, header, progress bar, checklist cards, celebration banner, finish button, and `.before-leaving-mode-active` concealment rules with WCAG AA/AAA compliant contrast in dark and light themes.

Run full verification:
1. `npm --prefix frontend run build` -> exit 0
2. `npm --prefix frontend run lint` -> 0 errors
3. Existing frontend tests:
   - `node --experimental-vm-modules tests/test_frontend_m2_challenge.mjs`
   - `node tests/test_frontend_template_crud.mjs`
   - `node tests/test_profile_bubble_event_coordination.mjs`
   - `node tests/test_challenger_frontend_m2_empirical.mjs`
4. Backend pytest suite: `.venv/bin/pytest tests/`
5. Author a test suite verifying Milestone 3 checklist lifecycle, hard-lock, toggle sync, and unlock transition.

Deliver your detailed handoff report to:
/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m3/handoff.md
Notify parent when finished.
