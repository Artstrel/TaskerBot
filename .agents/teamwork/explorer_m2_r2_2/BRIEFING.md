# BRIEFING — 2026-11-02T17:05:00Z

## Mission
Investigate event coordination and outside click handling between ProfileBubbleContextMenu and App.jsx profile bubble trigger.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m2_r2_2
- Original parent: d0d180b2-9527-4f62-be27-64edae1f25bf
- Milestone: milestone_2_round_2

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Analyze DOM hierarchy, event bubbling, and touch/mouse event sequences across iOS Safari / Telegram WebApp and desktop browsers
- Formulate clean, bulletproof solution for toggle-on-click vs click-outside dismiss

## Current Parent
- Conversation ID: d0d180b2-9527-4f62-be27-64edae1f25bf
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `frontend/src/components/ProfileBubbleContextMenu.jsx`
  - `frontend/src/App.jsx`
  - `frontend/src/index.css`
  - `frontend/src/api.js`
  - `frontend/index.html`
  - `tests/test_frontend_m2_challenge.mjs`
  - `tests/test_frontend_template_crud.mjs`
- **Key findings**:
  1. Race condition mechanism identified: W3C event lifecycle executes `touchstart`/`mousedown` on document BEFORE synthetic `click` on button. `handleClickOutside` fires `onClose()` -> `setIsProfileMenuOpen(false)` on downstroke. Subsequently, button `onClick` fires `setIsProfileMenuOpen((prev) => !prev)`, flipping `false` back to `true`.
  2. Multi-instance DOM collision identified: `App.jsx` renders `<ProfileBubbleContextMenu>` in BOTH `.desktop-sidebar` (line 696) and `.app-header` (line 880). Even when one is `display: none !important;`, both remain mounted in React DOM. Clicks inside the active visible dropdown are treated as "outside clicks" by the hidden sibling instance unless `.profile-bubble-dropdown` is guarded via `closest()`.
  3. Formulated bulletproof hybrid solution with dual guards: `target.closest('.profile-bubble-dropdown')` (prevents cross-instance false dismiss) + `target.closest('.header-profile-bubble')` & optional `triggerRef` (prevents trigger downstroke race condition) + `{ passive: true }` on touchstart.
- **Unexplored areas**: None within the scope of this investigation.

## Key Decisions Made
- Recommending hybrid exclusion guard in `ProfileBubbleContextMenu.jsx` using `target.closest()` for both `.profile-bubble-dropdown` and `.header-profile-bubble`, supplemented by optional `triggerRef` for explicit containment.
- Documenting exact event sequence lifecycle across iOS WebKit / Telegram WebApp and desktop browsers.

## Artifact Index
- DISPATCH.md — Dispatch instructions log
- progress.md — Liveness heartbeat and task tracker
- handoff.md — Final 5-component handoff report
