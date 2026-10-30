# BRIEFING — 2026-10-30T17:25:30Z

## Mission
Survey background tasks, periodic sync jobs, cache routines, and polling intervals to determine why numeric task values reset to zero after ~30–40 seconds.

## 🔒 My Identity
- Archetype: explorer
- Roles: [explorer, synthesis]
- Working directory: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_survey_3/
- Original parent: a0d40be5-6dd3-440c-bb4a-3c9aa671791e
- Milestone: survey_background_sync_and_persistence_lifecycle

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Base findings strictly on code evidence and verified facts
- Multi-skill pipeline activation and protocol compliance

## Current Parent
- Conversation ID: a0d40be5-6dd3-440c-bb4a-3c9aa671791e
- Updated: 2026-10-30T17:25:30Z

## Investigation State
- **Explored paths**:
  - `frontend/src/App.jsx` (lines 400–456: background polling `setInterval` 18000ms, visibility & focus listeners)
  - `frontend/src/api.js` (lines 800–1020: `RECENT_MUTATION_TTL` 5000ms, `PENDING_SYNC_KEY` 30000ms prune TTL, `reconcileDashboardWithPending`)
  - `frontend/src/components/TodayTab.jsx` (lines 680–865, 1240–1330: numeric steppers, optimistic state updates)
  - `backend/scheduler.py` (lines 650–669: APScheduler 1-minute and 10-minute jobs)
  - `backend/crud.py` (lines 560–636, 703–746: `get_day_and_upcoming_tasks`, `update_task_progress`)
  - `backend/api/routes.py` (lines 465–472, 636–652: `GET /dashboard/today`, `PATCH /tasks/{id}/progress`)
  - `backend/models.py` & `backend/database.py` (`OneTimeTask` column `current_value FLOAT DEFAULT 0.0`)
- **Key findings**:
  - 18-second polling timer (`pollInterval` in `App.jsx:436`) runs in background; 2 ticks = 36 seconds.
  - 30-second hard TTL (`getPendingSyncQueue` in `api.js:831`) prunes queued mutations older than 30s.
  - 5-second grace window (`RECENT_MUTATION_TTL = 5000`) clears `recentCompletedMutations`.
  - When numeric update fails to persist to DB, optimistic UI holds the value for 5s–30s. At 36s (or next sync after 30s), `loadData()` re-fetches tasks from DB (`current_value = 0.0`) and overwrites UI state.
- **Unexplored areas**: none (full survey complete).

## Key Decisions Made
- Fully documented evidence chain connecting the 18s*2=36s polling loop and 30s hard TTL with the unpersisted database default overwrite.

## Artifact Index
- /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_survey_3/handoff.md — Final investigation handoff report
