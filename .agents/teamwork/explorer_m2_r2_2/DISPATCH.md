## 2026-11-02T16:51:36Z
You are explorer_m2_r2_2.
Your working directory is /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m2_r2_2.
You MUST read:
1. /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md
2. /Users/artstrelani/Documents/TaskerBot/PROJECT.md
3. /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/orchestrator/GATE_STATUS.md
4. /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/reviewer_frontend_m2_2/handoff.md

Objective: Investigate event coordination and outside click handling in `frontend/src/components/ProfileBubbleContextMenu.jsx` and `frontend/src/App.jsx`:
1. When `isProfileMenuOpen` is true, tapping or clicking `.header-profile-bubble` fires `mousedown`/`touchstart` on document, triggering `handleClickOutside` which calls `onClose()`.
2. Immediately following, the browser fires `click` on `.header-profile-bubble`, executing `setIsProfileMenuOpen((prev) => !prev)`.
3. Because state was just set to false, `(prev) => !prev` flips it back to true, preventing the user from closing the menu via the profile bubble.
Analyze the DOM hierarchy, event bubbling, and touch/mouse event sequences across iOS Safari / Telegram WebApp and desktop browsers.
Formulate a clean, bulletproof solution (e.g. `e.target.closest('.header-profile-bubble')` exclusion guard, or trigger ref) that seamlessly supports both toggle-on-click and click-outside dismiss.
DO NOT implement changes yourself. Formulate a precise strategy in your `handoff.md`.
Communicate when done via send_message.
