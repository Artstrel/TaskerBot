# Dispatch: explorer_m3_3 (Session Sync & Recovery Explorer)

## Mission
Investigate and design state synchronization, API client methods, and boot reload recovery for Milestone 3 (Requirement R2) in TaskerBot.

## Context & Inputs
- Authoritative User Request: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md` (Read this first!)
- Project Scope: `/Users/artstrelani/Documents/TaskerBot/PROJECT.md`
- Working Directory: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m3_3/`
- Existing Frontend Codebase:
  - `frontend/src/api.js` (inspect existing endpoints and add active session methods)
  - `frontend/src/App.jsx` (inspect `loadData`, state hooks, error handling)
  - Backend endpoints documented in `PROJECT.md § Interface Contracts`:
    - `GET /api/before-leaving/session/active?telegram_id={id}`
    - `POST /api/before-leaving/session/start?telegram_id={id}`
    - `PATCH /api/before-leaving/session/items/{item_id}/toggle?telegram_id={id}`
    - `POST /api/before-leaving/session/finish?telegram_id={id}`

## Scope & Instructions
1. Inspect `frontend/src/api.js`:
   - Specify required API wrapper functions: `fetchActiveBeforeLeavingSession`, `startBeforeLeavingSession`, `toggleBeforeLeavingCheckItem`, `finishBeforeLeavingSession`.
2. Inspect `frontend/src/App.jsx`:
   - State management: `activeBeforeLeavingSession`, `isActiveBeforeLeavingOpen`, etc.
   - Boot synchronization: in `loadData()`, call `fetchActiveBeforeLeavingSession(user?.telegram_id)`. If an active session exists, immediately mount the overlay and lock navigation.
   - Start session flow: trigger from ProfileBubble context menu or inline button -> call `startBeforeLeavingSession` -> set state -> open overlay. Handle empty template gracefully (notify user to configure items first).
   - Checkbox toggle flow: optimistic update of `item.is_checked`, `completed_count`, `is_all_completed`, then call API; revert state on failure.
   - Finish session flow: call `finishBeforeLeavingSession` -> clear active session state -> unlock navigation -> show success toast / feedback.
3. Edge cases to analyze:
   - Network failure during toggle.
   - Starting session with 0 template items (HTTP 400).
   - App refresh mid-checklist: verify that state restores with exact checked/unchecked items and locks navigation.
4. Produce a detailed implementation blueprint in `handoff.md`. Do NOT write production code.


## 2026-11-02T17:32:16Z
[Message from d0d180b2-9527-4f62-be27-64edae1f25bf]
Investigate state synchronization, API client methods, and boot reload recovery for Milestone 3 (Requirement R2) in TaskerBot.
Focus on:
1. `frontend/src/api.js`: design exact API methods for active session lifecycle (`fetchActiveBeforeLeavingSession`, `startBeforeLeavingSession`, `toggleBeforeLeavingCheckItem`, `finishBeforeLeavingSession`) matching backend contracts in `PROJECT.md`.
2. `frontend/src/App.jsx`: design state integration:
   - Boot sync in `loadData`: automatically restore active session on refresh/boot and engage hard lock.
   - Start session flow: trigger, empty template validation, starting active session.
   - Checkbox toggle flow: optimistic local update with rollback on network failure.
   - Finish session flow: finish call, clearing session, disengaging lock, restoring standard navigation.
3. Edge cases: empty template launch prevention (HTTP 400), network toggle retries, browser reload mid-checklist state consistency.

Write your detailed findings and implementation blueprint to:
/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m3_3/handoff.md
Update your progress.md regularly. When finished, send a notification back to parent.
DO NOT write production code files directly — provide blueprints and code snippets in handoff.md only.
