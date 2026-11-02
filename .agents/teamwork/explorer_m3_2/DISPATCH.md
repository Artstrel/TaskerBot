# Dispatch: explorer_m3_2 (Navigation Lock Explorer)

## Mission
Investigate and design multi-layer hard-lock mechanisms for Milestone 3 (Requirement R2) in TaskerBot.

## Context & Inputs
- Authoritative User Request: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md` (Read this first!)
- Project Scope: `/Users/artstrelani/Documents/TaskerBot/PROJECT.md`
- Working Directory: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m3_2/`
- Existing Frontend Codebase:
  - `frontend/src/App.jsx` (inspect keyboard event listeners, tab navigation, navigation bar, sidebar)
  - `frontend/src/index.css`

## Scope & Instructions
1. Inspect how `App.jsx` handles:
   - Tab switching / navigation (bottom dock `.mobile-nav`, desktop `.desktop-sidebar`, header).
   - Global keyboard shortcuts (`Escape`, `c`, `n`).
   - Telegram WebApp SDK bindings (`window.Telegram?.WebApp`).
2. Design a multi-layer hard lock that satisfies Acceptance Criteria:
   - "В активном состоянии режим перекрывает навигационные элементы и запрещает выход или переход между вкладками, пока хотя бы один чек-бокс не отмечен."
   - "При завершении всех пунктов из списка блокировка снимается, позволяя штатно выйти из режима."
3. Detailed lock mechanisms to specify:
   - Visual concealment: hide or completely disable tab switching and header navigation while overlay is active.
   - Modal defense: No close (X) button, backdrop click dismissal, or escape dismiss while `!is_all_completed`.
   - Keyboard trap: intercept and suppress `Escape`, `c`, `n` while active session is running.
   - Browser history trap: handle browser `popstate` / back navigation so back button cannot leave the app or navigate away while incomplete.
   - Telegram WebApp integration: engage `enableClosingConfirmation()` and `disableVerticalSwipes()` on active session; disengage (`disableClosingConfirmation()`, `enableVerticalSwipes()`) when user finishes session.
4. Produce a detailed implementation blueprint in `handoff.md`. Do NOT write production code.


## 2026-11-02T17:32:09Z
You are explorer_m3_2 (Navigation Lock Explorer).
Your working directory is: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m3_2/
Read your task instructions in: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m3_2/DISPATCH.md
Read the authoritative user request: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md
Read the project specifications: /Users/artstrelani/Documents/TaskerBot/PROJECT.md

Investigate multi-layer hard-lock mechanisms for Milestone 3 (Requirement R2) in TaskerBot.
Focus on:
1. Navigation concealment: completely hide/disable mobile bottom nav, desktop sidebar, and header navigation while overlay is active.
2. Modal defense: ensure NO dismiss, backdrop tap dismiss, or close buttons exist while checklist is incomplete (`!is_all_completed`).
3. Keyboard trap: intercept and suppress `Escape`, `c`, `n` while session is active.
4. Browser history trap: popstate / pushState handling to prevent back navigation from leaving the application or dismissing mode.
5. Telegram WebApp SDK: call `window.Telegram?.WebApp?.enableClosingConfirmation()` and `window.Telegram?.WebApp?.disableVerticalSwipes()` upon active session; call `disableClosingConfirmation()` and `enableVerticalSwipes()` when session is finished.

Write your detailed findings and implementation blueprint to:
/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m3_2/handoff.md
Update your progress.md regularly. When finished, send a notification back to parent.
DO NOT write production code files directly — provide blueprints and code snippets in handoff.md only.
