# Dispatch: Worker Frontend M2 R2 (Remediation)

You are the remediation worker for Milestone 2 Iteration 4.
Your working directory is `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m2_r2`.

## Mandatory Reading:
1. `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md`
2. `/Users/artstrelani/Documents/TaskerBot/PROJECT.md`
3. `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/orchestrator/GATE_STATUS.md`
4. `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/reviewer_frontend_m2_2/handoff.md`
5. `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m2_r2_1/handoff.md`
6. `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m2_r2_2/handoff.md`
7. `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m2_r2_3/handoff.md`

## Mandatory Integrity Warning:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Files You Own Exclusively:
- `frontend/src/index.css`
- `frontend/src/components/ProfileBubbleContextMenu.jsx`
- `frontend/src/components/BeforeLeavingConfigModal.jsx`

## Task Instructions:
1. Apply the CSS token and light-mode contrast fixes to `frontend/src/index.css`:
   - `.profile-dropdown-item:hover`: `background: var(--bg-card-hover);`
   - `.profile-dropdown-item:active`: `background: var(--accent-primary-dim);`
   - `.profile-dropdown-item-primary`: `color: var(--text-primary); font-weight: 600;`
   - `.before-leaving-add-btn`: `background: var(--text-primary); color: var(--bg-app);` with `:hover:not(:disabled)` using `background: var(--accent-primary-hover); color: var(--bg-app);`
   - `.before-leaving-item-reorder button:hover:not(:disabled)`: `color: var(--text-primary); background: var(--accent-primary-dim);`
   - `.before-leaving-item-title:hover`: `color: var(--text-primary); text-decoration: underline; text-decoration-color: var(--border-hover);`
   - `.before-leaving-item-btn:hover`: `color: var(--text-primary); background: var(--accent-primary-dim);`
   - `.before-leaving-launch-preview-btn`: `background: var(--bg-card); color: var(--text-primary);` and hover `background: var(--bg-card-hover);`
   - Add light theme overrides: `[data-theme="light"] .profile-bubble-dropdown { box-shadow: 0 12px 32px rgba(0, 0, 0, 0.10); }` and `[data-theme="light"] .before-leaving-item-btn.before-leaving-item-delete:hover { color: #dc2626 !important; background: rgba(239, 68, 68, 0.10) !important; }`
   - Add narrow mobile responsive rule: `@media (max-width: 360px) { .app-header .header-before-leaving-btn { width: 38px; height: 38px; padding: 0; border-radius: var(--radius-full); justify-content: center; flex-shrink: 0; } .app-header .header-before-leaving-btn span { display: none !important; } }`
2. Apply the outside-click and toggle race fix in `frontend/src/components/ProfileBubbleContextMenu.jsx`:
   - Dual-layer containment check:
     `const target = e.target instanceof Element ? e.target : e.target?.parentElement;`
     `if (menuRef.current?.contains(e.target) || (target && typeof target.closest === 'function' && target.closest('.profile-bubble-dropdown'))) return;`
     `if (triggerRef?.current?.contains(e.target) || (target && typeof target.closest === 'function' && target.closest('.header-profile-bubble'))) return;`
   - Add `{ passive: true }` to `touchstart` listener.
3. Apply focus management and modal Tab-trap in `frontend/src/components/BeforeLeavingConfigModal.jsx`:
   - Add `addInputRef` and `sheetRef`.
   - On open: 50ms layout settle timeout calling `addInputRef.current?.focus()`, and add `autoFocus` on the input.
   - On keydown: intercept Tab and Shift+Tab to trap focus within `sheetRef.current`.
4. Verification:
   - Run `npm --prefix frontend run build` (must exit 0).
   - Run `npm --prefix frontend run lint` (0 errors).
   - Run `node --experimental-vm-modules tests/test_frontend_m2_challenge.mjs` (must pass 20/20).
   - Run `node tests/test_frontend_template_crud.mjs` (must pass 50/50).
   - Run `./.venv/bin/pytest tests/test_before_leaving_backend.py tests/test_numeric_tasks_persistence.py tests/test_numeric_challenge_stress.py tests/test_non_numeric_regressions_stress.py` (must pass 66/66).
5. Document all changes and verification outputs in `handoff.md` and message parent via `send_message`.


## 2026-11-02T17:10:12Z
[Message] timestamp=2026-11-02T17:10:12Z sender=d0d180b2-9527-4f62-be27-64edae1f25bf priority=MESSAGE_PRIORITY_HIGH content=You are worker_frontend_m2_r2.
Your working directory is /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m2_r2.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read:
1. /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md
2. /Users/artstrelani/Documents/TaskerBot/PROJECT.md
3. /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/worker_frontend_m2_r2/DISPATCH.md
4. /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/reviewer_frontend_m2_2/handoff.md
5. /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m2_r2_1/handoff.md
6. /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m2_r2_2/handoff.md
7. /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m2_r2_3/handoff.md

Files you own exclusively:
- frontend/src/index.css
- frontend/src/components/ProfileBubbleContextMenu.jsx
- frontend/src/components/BeforeLeavingConfigModal.jsx

Execute the remediation steps per DISPATCH.md and the three explorer handoff reports:
1. Theme Tokens in index.css: Fix contrast failures in light mode (use var(--text-primary), var(--bg-app), var(--bg-card), var(--bg-card-hover), var(--accent-primary-dim), and light mode overrides) so all elements achieve WCAG AAA/AA compliance. Add @media (max-width: 360px) narrow screen rule.
2. Event Coordination in ProfileBubbleContextMenu.jsx: Fix profile bubble toggle race and cross-instance false dismiss by adding dual-layer containment checks and passive touch listener.
3. Accessibility in BeforeLeavingConfigModal.jsx: Add addInputRef, autoFocus, 50ms layout settle autofocus, and dialog Tab-trap.
4. Verify by running build (`npm --prefix frontend run build`), lint (`npm --prefix frontend run lint`), challenge test suites (`node --experimental-vm-modules tests/test_frontend_m2_challenge.mjs`, `node tests/test_frontend_template_crud.mjs`), and pytest suite.
5. Write your complete handoff report to handoff.md in your working directory and notify parent via send_message.
