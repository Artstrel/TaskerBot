# Survey Explorer 2 Dispatch

## Objective
Investigate frontend codebase for the "Before Leaving" («Перед выходом») feature in TaskerBot.

## Input Context
- Authoritative Request: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md`
- Working Directory: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/survey_explorer_2`
- Codebase Root: `/Users/artstrelani/Documents/TaskerBot`

## Scope & Investigation Tasks
1. Read `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md` thoroughly.
2. Investigate `frontend/`:
   - Component tree, root (`frontend/src/App.jsx`), router/views.
   - Profile bubble component and its context menu/dropdown behavior.
   - Platform & environment detection (Telegram WebApp SDK `window.Telegram?.WebApp.platform`, iOS detection, responsive breakpoints).
   - Navigation elements (tabs, headers, back buttons, keyboard shortcuts).
   - API client (`frontend/src/api.js` or similar) and optimistic UI / background polling patterns.
3. Map out frontend requirements for R1, R2, R3:
   - R1: Template management UI (items/tasks CRUD, modal or dedicated screen).
   - R2: Active mode full-screen blocking interface:
     - Checklist with interactive checkboxes.
     - Strict blocking behavior: completely hides or disables navigation, back buttons, tab switching until all items are completed.
     - Synchronization of checked items with backend.
     - Unlock/exit behavior when all items are checked.
   - R3: Adaptive launch button:
     - Telegram WebApp on iOS -> inside profile bubble context menu.
     - All other devices and breakpoints -> on the same horizontal level (line) as the profile bubble.
4. Produce full report with evidence, file paths, and line references in `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/survey_explorer_2/handoff.md`.

## 2026-11-02T15:05:07Z
Sender: d0d180b2-9527-4f62-be27-64edae1f25bf
Message:
You are Survey Explorer 2 (Frontend Specialist).
Your working directory is: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/survey_explorer_2
Read /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md and /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/survey_explorer_2/DISPATCH.md.

Investigate the frontend architecture in /Users/artstrelani/Documents/TaskerBot/frontend:
1. Examine frontend/src/App.jsx, components, api client (frontend/src/api.js), and styling (Tailwind / CSS).
2. Analyze profile bubble component, context menu/dropdown, and Telegram WebApp SDK usage (iOS detection vs other platforms/breakpoints).
3. Analyze navigation structure, tab switching, and modal/overlay mechanisms.
4. Design the frontend implementation for:
   - R1: Template configuration interface (modal or screen for adding, editing, deleting, ordering items).
   - R2: Active "Before Leaving" mode: full-screen blocking overlay, complete navigation lock (prevent dismissal, tab switching, or exit until all items are checked), checkbox interaction, backend synchronization, unlock upon completion.
   - R3: Adaptive button placement: inside profile bubble context menu on Telegram WebApp iOS; on the same horizontal level as the profile bubble on all other devices/breakpoints.
5. Write your comprehensive report to /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/survey_explorer_2/handoff.md. Update progress.md with timestamp during your work.
When finished, send a completion message with summary and path to your handoff.md.
