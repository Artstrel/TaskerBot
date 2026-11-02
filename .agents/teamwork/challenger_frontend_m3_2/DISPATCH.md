# Dispatch: challenger_frontend_m3_2 (Session Sync Challenger)

## Mission
Author and execute empirical adversarial tests challenging state synchronization, boot recovery, and lifecycle transitions in Milestone 3 (Requirement R2).

## Context & Inputs
- Authoritative User Request: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md` (Read this first!)
- Project Scope: `/Users/artstrelani/Documents/TaskerBot/PROJECT.md`
- Working Directory: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/challenger_frontend_m3_2/`
- Worker Handoff: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m3/handoff.md`

## Scope & Instructions
1. Inspect implementation of session sync, caching, and state transitions in `api.js`, `App.jsx`, and `BeforeLeavingActiveOverlay.jsx`.
2. Author an automated stress/adversarial test file (e.g. `tests/test_before_leaving_session_sync_challenge.mjs`):
   - Attack 1: 0ms Boot Recovery. Simulate cold boot / page refresh with active session in localStorage cache. Verify `isBeforeLeavingActive` is true on initial evaluation with 0ms visual flash of dashboard.
   - Attack 2: Granular Optimistic Checkbox Toggle & Rollback. Simulate checking item A and item B rapidly. Inject network failure on item B. Verify item A remains checked, while item B safely rolls back to previous state.
   - Attack 3: Finish Transition Invariant. Attempt to finish session when `is_all_completed === false`. Verify finish button is not accessible and finish API rejects. Complete 100% of items and verify finish unlocks interface.
   - Attack 4: Empty Template Guard. Attempt to launch mode with empty template (HTTP 400). Verify active overlay is NOT mounted and config modal is opened instead.
3. Execute all frontend and backend tests:
   - Run authored challenge suite with Node.js.
   - Run `tests/test_frontend_m3_challenge.mjs`.
   - Run backend pytest suite `.venv/bin/pytest tests/`.
   - Run `npm --prefix frontend run build`.
4. Deliver handoff report with clear verdict: **APPROVE** or **REQUEST_CHANGES**.
