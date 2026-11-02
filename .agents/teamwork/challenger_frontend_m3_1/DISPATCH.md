# Dispatch: challenger_frontend_m3_1 (Hard-Lock Challenger)

## Mission
Author and execute empirical adversarial tests challenging the multi-layer hard lock in Milestone 3 (Requirement R2).

## Context & Inputs
- Authoritative User Request: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md` (Read this first!)
- Project Scope: `/Users/artstrelani/Documents/TaskerBot/PROJECT.md`
- Working Directory: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/challenger_frontend_m3_1/`
- Worker Handoff: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m3/handoff.md`

## Scope & Instructions
1. Inspect implementation of hard-lock mechanisms in `BeforeLeavingActiveOverlay.jsx`, `App.jsx`, and `index.css`.
2. Author an automated stress/adversarial test file (e.g. `tests/test_before_leaving_hard_lock_challenge.mjs`):
   - Attack 1: Attempt to switch tabs (call `handleTabSwitch('goals')`, `handleTabSwitch('groceries')`) while active session is running. Verify tab switch is blocked.
   - Attack 2: Attempt keyboard shortcuts (`Escape`, `c`, `n`, `с`, `т`). Verify shortcuts are prevented from opening other modals or closing the overlay.
   - Attack 3: Simulate browser back navigation (`popstate` event). Verify history trap maintains the blocking overlay.
   - Attack 4: Verify navigation bars (`.desktop-sidebar`, `.app-header`, `.bottom-dock`, `.app-fab`) are concealed and inaccessible.
   - Attack 5: Verify zero close button / dismiss action exists while `is_all_completed === false`.
3. Execute all frontend and backend tests:
   - Run authored challenge suite with Node.js.
   - Run `tests/test_frontend_m3_challenge.mjs`.
   - Run backend pytest suite `.venv/bin/pytest tests/`.
   - Run `npm --prefix frontend run build`.
4. Deliver handoff report with clear verdict: **APPROVE** or **REQUEST_CHANGES**.


## 2026-11-02T17:56:23Z
You are challenger_frontend_m3_1 (Hard-Lock Challenger).
Your working directory is: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/challenger_frontend_m3_1/
Read your task instructions in: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/challenger_frontend_m3_1/DISPATCH.md
Read the authoritative user request: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md
Read the project specifications: /Users/artstrelani/Documents/TaskerBot/PROJECT.md
Read worker handoff: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m3/handoff.md

Empirically challenge the Milestone 3 multi-layer hard-lock implementation:
- Author an automated test file (e.g. `tests/test_before_leaving_hard_lock_challenge.mjs`) to test:
  1. Tab switching blocked while active session is running.
  2. Keyboard shortcuts (`Escape`, `c`, `n`) suppressed and trapped.
  3. Browser back navigation (`popstate`) trapped.
  4. Navigation elements completely concealed and inert.
  5. Absence of close button while incomplete.
- Run your authored test suite, existing frontend tests, build, and backend pytest suite.
- Deliver your detailed handoff report to:
  /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/challenger_frontend_m3_1/handoff.md
- Send message to parent with your verdict: APPROVE or REQUEST_CHANGES.
