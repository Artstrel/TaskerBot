# Handoff Report: Investigation of CSS Variable Tokens & Light Theme (`[data-theme="light"]`) Compatibility for "Before Leaving" Components

## 1. Observation

Direct examination of `frontend/src/index.css` (lines 87-233 and 4513-4837), `frontend/src/theme.js`, and `frontend/src/components/ProfileBubbleContextMenu.jsx` revealed multiple hardcoded color values and contrast anomalies in light mode:

### 1.1 Verified Token Definitions (`frontend/src/index.css:87-233`)
`[Documented]`
- **Dark Mode (`:root`, `[data-theme="dark"]`)**:
  - `--bg-app: #0d0d0d` ($L = 0.007$)
  - `--bg-surface: #141414` ($L = 0.012$)
  - `--bg-card: #1c1c1f` ($L = 0.018$)
  - `--bg-card-hover: #26262a` ($L = 0.027$)
  - `--bg-elevated: #242428` ($L = 0.024$)
  - `--border-subtle: rgba(255, 255, 255, 0.10)`
  - `--border-hover: rgba(255, 255, 255, 0.20)`
  - `--border-focus: rgba(255, 255, 255, 0.45)`
  - `--text-primary: #ededed` ($L = 0.835$)
  - `--text-secondary: #a1a1aa` ($L = 0.364$)
  - `--text-tertiary: #71717a` ($L = 0.176$)
  - `--text-muted: #52525b` ($L = 0.088$)
  - `--accent-primary: #ffffff` ($L = 1.000$)
  - `--accent-primary-hover: #e4e4e7` ($L = 0.771$)
  - `--accent-primary-dim: rgba(255, 255, 255, 0.12)`
- **Light Mode (`[data-theme="light"]`)**:
  - `--bg-app: #f4f4f6` ($L = 0.914$)
  - `--bg-surface: #ffffff` ($L = 1.000$)
  - `--bg-card: #ffffff` ($L = 1.000$)
  - `--bg-card-hover: #f8f8fa` ($L = 0.947$)
  - `--bg-elevated: #ffffff` ($L = 1.000$)
  - `--border-subtle: rgba(0, 0, 0, 0.08)`
  - `--border-hover: rgba(0, 0, 0, 0.16)`
  - `--border-focus: rgba(0, 0, 0, 0.38)`
  - `--text-primary: #09090b` ($L = 0.0053$)
  - `--text-secondary: #52525b` ($L = 0.088$)
  - `--text-tertiary: #71717a` ($L = 0.176$)
  - `--text-muted: #a1a1aa` ($L = 0.364$)
  - `--accent-primary: #09090b` ($L = 0.0053$)
  - `--accent-primary-hover: #27272a` ($L = 0.030$)
  - `--accent-primary-dim: rgba(0, 0, 0, 0.06)`

### 1.2 Observed Component Rules & Defect Inventory (`frontend/src/index.css:4513-4837`)
`[Empirical]`
1. **`.before-leaving-add-btn` (lines 4650-4665)**:
   ```css
   background: var(--accent-primary);
   color: #000000;
   ```
   - Dark mode: `#ffffff` background with `#000000` text -> contrast $21.00:1$ (Passes AAA).
   - Light mode: `--accent-primary` is `#09090b`. `#09090b` background with hardcoded `#000000` text -> contrast $1.11:1$ (FAILS WCAG 2.1 AA/AAA; black on black).
   - Missing `:hover:not(:disabled)` state definition.
2. **`.profile-dropdown-item-primary` (lines 4592-4595)**:
   ```css
   color: #ffffff;
   font-weight: 600;
   ```
   - In `.profile-bubble-dropdown`, background is `var(--bg-elevated)`.
   - Dark mode: `#242428` background with `#ffffff` text -> contrast $14.19:1$ (Passes AAA).
   - Light mode: `var(--bg-elevated)` is `#ffffff`. Hardcoded `#ffffff` text on `#ffffff` background -> contrast $1.00:1$ (FAILS WCAG 2.1 AA/AAA; completely invisible white-on-white).
3. **`.profile-dropdown-item:hover` and `:active` (lines 4579-4585)**:
   ```css
   .profile-dropdown-item:hover {
     background: rgba(255, 255, 255, 0.08);
   }
   .profile-dropdown-item:active {
     background: rgba(255, 255, 255, 0.12);
   }
   ```
   - Dark mode: blends over `#242428` to yield `#353539` (visible).
   - Light mode: blends over `#ffffff` to yield `#ffffff` (0 contrast delta; hover and active states are completely imperceptible).
4. **`.before-leaving-item-reorder button:hover:not(:disabled)` (lines 4730-4733)**:
   ```css
   color: var(--text-primary);
   background: rgba(255, 255, 255, 0.08);
   ```
   - Light mode: row hover is `var(--bg-card-hover)` (`#f8f8fa`). `rgba(255, 255, 255, 0.08)` on `#f8f8fa` produces `#fafafb` (contrast delta $< 1.01:1$, imperceptible).
5. **`.before-leaving-item-title:hover` (lines 4754-4758)**:
   ```css
   color: #ffffff;
   text-decoration: underline;
   text-decoration-color: var(--border-hover);
   ```
   - Dark mode: `#ffffff` text on `#26262a` row hover -> contrast $13.64:1$ (Passes AAA).
   - Light mode: row is `#ffffff` (or `#f8f8fa` when hovered). Hardcoded `#ffffff` text on `#ffffff`/`#f8f8fa` background -> contrast $1.00:1$ to $1.08:1$ (FAILS WCAG 2.1 AA/AAA; text disappears on hover).
6. **`.before-leaving-item-btn:hover` (lines 4792-4795)**:
   ```css
   color: var(--text-primary);
   background: rgba(255, 255, 255, 0.08);
   ```
   - Light mode: `rgba(255, 255, 255, 0.08)` on `#f8f8fa` gives 0 contrast delta (imperceptible pill background).
7. **`.before-leaving-item-btn.before-leaving-item-delete:hover` (lines 4797-4800)**:
   ```css
   color: #f87171 !important;
   background: rgba(239, 68, 68, 0.12) !important;
   ```
   - Light mode: `#f87171` text ($L = 0.329$) on `rgba(239, 68, 68, 0.12)` blended on `#ffffff` (`#fdeced`, $L = 0.870$) -> contrast ratio $\frac{0.870 + 0.05}{0.329 + 0.05} = 2.43:1$ (FAILS WCAG 2.1 AA requirement of $\ge 3:1$ for graphical/icon controls and $\ge 4.5:1$ for text).
8. **`.before-leaving-launch-preview-btn` and `:hover` (lines 4802-4822)**:
   ```css
   background: rgba(255, 255, 255, 0.08);
   border: 1px solid var(--border-subtle);
   ```
   ```css
   .before-leaving-launch-preview-btn:hover {
     background: rgba(255, 255, 255, 0.14);
     border-color: var(--border-hover);
   }
   ```
   - Inside bottom sheet, surface is `var(--bg-surface)` (`#ffffff` in light mode).
   - Light mode: `rgba(255, 255, 255, 0.08)` on `#ffffff` is `#ffffff` (no button card surface visible).
   - Light mode hover: `rgba(255, 255, 255, 0.14)` on `#ffffff` is `#ffffff` (no hover background feedback).
9. **`.profile-bubble-dropdown` Box-Shadow (line 4552)**:
   ```css
   box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
   ```
   - Light mode: $50\%$ black shadow is harsh against `--bg-app: #f4f4f6`.

---

## 2. Logic Chain

1. **Root Cause Analysis**:
   - `[Documented]` In TaskerBot's dual-theme architecture (`frontend/src/theme.js` and `frontend/src/index.css:87-233`), `:root` is monochrome graphite dark, and `[data-theme="light"]` inverts colors so that `--text-primary` becomes dark `#09090b` and `--bg-app` becomes light `#f4f4f6`.
   - `[Documented]` Primary action buttons in TaskerBot adhere to the inverted pattern exemplified by `.quick-bar-btn-submit` (line 2088) and `.btn-primary` (line 856):
     ```css
     background: var(--text-primary);
     color: var(--bg-app);
     ```
     Hover:
     ```css
     background: var(--accent-primary-hover);
     color: var(--bg-app);
     ```
   - In `frontend/src/index.css:4656-4657`, `.before-leaving-add-btn` deviated from this pattern by pairing `var(--accent-primary)` with hardcoded `color: #000000`. In dark mode, `--accent-primary` is `#ffffff` (yielding black-on-white, $21:1$), but in light mode, `--accent-primary` is `#09090b`, resulting in black text on near-black background ($1.11:1$).
   - Similarly, `.profile-dropdown-item-primary` hardcoded `color: #ffffff` assuming a dark popover background. In light mode, `.profile-bubble-dropdown` adopts `--bg-elevated: #ffffff`, causing white text on white background ($1.00:1$).
   - The same assumption affected `.before-leaving-item-title:hover` (`color: #ffffff` on `#ffffff` card surface, $1.00:1$) and hover backgrounds utilizing `rgba(255, 255, 255, 0.08)`.

2. **Mathematical Verification of Remediations (WCAG 2.1 AA/AAA Compliance)**:
   - **Remediation 1: `.before-leaving-add-btn`**:
     Using `background: var(--text-primary); color: var(--bg-app);` with `:hover:not(:disabled)` using `background: var(--accent-primary-hover); color: var(--bg-app);`:
     - Dark Base: `#ededed` on `#0d0d0d` -> $C = \frac{0.835 + 0.05}{0.007 + 0.05} = 15.53:1$ (Passes AAA $\ge 7:1$).
     - Dark Hover: `#e4e4e7` on `#0d0d0d` -> $C = \frac{0.771 + 0.05}{0.007 + 0.05} = 14.40:1$ (Passes AAA $\ge 7:1$).
     - Light Base: `#09090b` on `#f4f4f6` -> $C = \frac{0.914 + 0.05}{0.0053 + 0.05} = 17.43:1$ (Passes AAA $\ge 7:1$).
     - Light Hover: `#27272a` on `#f4f4f6` -> $C = \frac{0.914 + 0.05}{0.030 + 0.05} = 12.05:1$ (Passes AAA $\ge 7:1$).
   - **Remediation 2: `.profile-dropdown-item-primary`**:
     Using `color: var(--text-primary); font-weight: 600;`:
     - Dark Mode: `#ededed` on `#242428` -> $C = \frac{0.835 + 0.05}{0.024 + 0.05} = 11.96:1$ (Passes AAA $\ge 7:1$).
     - Light Mode: `#09090b` on `#ffffff` -> $C = \frac{1.000 + 0.05}{0.0053 + 0.05} = 18.99:1$ (Passes AAA $\ge 7:1$).
   - **Remediation 3: `.before-leaving-item-title:hover`**:
     Using `color: var(--text-primary); text-decoration: underline; text-decoration-color: var(--border-hover);`:
     - Dark Mode Hover: `#ededed` on `#26262a` -> $C = \frac{0.835 + 0.05}{0.027 + 0.05} = 11.49:1$ (Passes AAA $\ge 7:1$).
     - Light Mode Hover: `#09090b` on `#f8f8fa` -> $C = \frac{0.947 + 0.05}{0.0053 + 0.05} = 18.03:1$ (Passes AAA $\ge 7:1$).
   - **Remediation 4: Hover states (`.profile-dropdown-item:hover`, `.before-leaving-item-reorder button:hover`, `.before-leaving-item-btn:hover`)**:
     Replacing hardcoded `rgba(255, 255, 255, 0.08)` with semantic tokens:
     - For dropdown items: `background: var(--bg-card-hover);` (`#26262a` in dark, `#f8f8fa` in light).
     - For mini icon action buttons inside card rows: `background: var(--accent-primary-dim);` (`rgba(255, 255, 255, 0.12)` in dark; `rgba(0, 0, 0, 0.06)` in light).
   - **Remediation 5: Destructive Action (`.before-leaving-item-delete:hover`)**:
     In light mode, `#f87171` on `#fdeced` fails with $2.43:1$. Overriding in light mode with `#dc2626` (Tailwind red-600, $L = 0.134$) on `rgba(239, 68, 68, 0.10)` ($L = 0.887$):
     - Light Mode Contrast: $C = \frac{0.887 + 0.05}{0.134 + 0.05} = 5.09:1$ (Passes WCAG 2.1 AA $\ge 4.5:1$).
   - **Remediation 6: Secondary Action Button (`.before-leaving-launch-preview-btn`)**:
     Using `background: var(--bg-card); border: 1px solid var(--border-subtle); color: var(--text-primary);` and on hover `background: var(--bg-card-hover); border-color: var(--border-hover);`:
     - Dark Base: `#ededed` on `#1c1c1f` -> $13.01:1$ (Passes AAA).
     - Dark Hover: `#ededed` on `#26262a` -> $11.49:1$ (Passes AAA).
     - Light Base: `#09090b` on `#ffffff` -> $18.99:1$ (Passes AAA).
     - Light Hover: `#09090b` on `#f8f8fa` -> $18.03:1$ (Passes AAA).

3. **Context Menu Outside Click Race Condition**:
   - `[Documented]` In `frontend/src/components/ProfileBubbleContextMenu.jsx:19-23`, `handleClickOutside` triggers on `mousedown`/`touchstart`. When tapping `.header-profile-bubble` to close an open menu, `handleClickOutside` fires first and calls `onClose()` (setting `isProfileMenuOpen` to `false`). The subsequent `click` event fires on `.header-profile-bubble` which executes `setIsProfileMenuOpen((prev) => !prev)`, immediately re-opening the menu.
   - Adding `if (e.target && e.target.closest && e.target.closest('.header-profile-bubble')) return;` prevents this flip-flop.

---

## 3. Caveats

1. The current investigation is strictly read-only; no modifications have been made to `frontend/src/index.css` or `frontend/src/components/ProfileBubbleContextMenu.jsx`.
2. The contrast calculations assume standard opaque blending over default theme backgrounds (`#0d0d0d`/`#141414` in dark, `#f4f4f6`/`#ffffff` in light).
3. The proposed changes do not alter any JavaScript API contracts, backend endpoints, or existing regression test suites.

---

## 4. Conclusion

The contrast failures in light mode are completely caused by hardcoded hex/rgba values (`#000000`, `#ffffff`, `#f87171`, `rgba(255, 255, 255, 0.08)`) in `frontend/src/index.css:4513-4837`.
A targeted, 100% token-compliant remediation strategy eliminates all contrast violations and brings all components to WCAG 2.1 AA/AAA compliance ($> 11:1$ for text, $> 5:1$ for destructive actions).

### Remediation Plan & Exact Line-by-Line Changes

#### A. In `frontend/src/index.css`:

1. **Lines 4579-4585**: Replace hardcoded RGBA with theme tokens for `.profile-dropdown-item`:
   ```css
   /* Before */
   .profile-dropdown-item:hover {
     background: rgba(255, 255, 255, 0.08);
   }

   .profile-dropdown-item:active {
     background: rgba(255, 255, 255, 0.12);
   }

   /* After */
   .profile-dropdown-item:hover {
     background: var(--bg-card-hover);
   }

   .profile-dropdown-item:active {
     background: var(--accent-primary-dim);
   }
   ```

2. **Lines 4592-4595**: Fix `.profile-dropdown-item-primary` text color:
   ```css
   /* Before */
   .profile-dropdown-item-primary {
     color: #ffffff;
     font-weight: 600;
   }

   /* After */
   .profile-dropdown-item-primary {
     color: var(--text-primary);
     font-weight: 600;
   }
   ```

3. **Lines 4650-4665**: Fix `.before-leaving-add-btn` to use inverted primary button tokens:
   ```css
   /* Before */
   .before-leaving-add-btn {
     height: 42px;
     padding: 0 16px;
     display: inline-flex;
     align-items: center;
     gap: 6px;
     background: var(--accent-primary);
     color: #000000;
     border: none;
     border-radius: var(--radius-md);
     font-size: var(--font-body);
     font-weight: 600;
     cursor: pointer;
     transition: opacity 0.15s ease, transform 0.1s ease;
     white-space: nowrap;
   }

   /* After */
   .before-leaving-add-btn {
     height: 42px;
     padding: 0 16px;
     display: inline-flex;
     align-items: center;
     gap: 6px;
     background: var(--text-primary);
     color: var(--bg-app);
     border: none;
     border-radius: var(--radius-md);
     font-size: var(--font-body);
     font-weight: 600;
     cursor: pointer;
     transition: opacity 0.15s ease, transform 0.1s ease, background-color 0.15s ease;
     white-space: nowrap;
   }

   .before-leaving-add-btn:hover:not(:disabled) {
     background: var(--accent-primary-hover);
     color: var(--bg-app);
   }
   ```

4. **Lines 4730-4733**: Fix `.before-leaving-item-reorder button:hover:not(:disabled)`:
   ```css
   /* Before */
   .before-leaving-item-reorder button:hover:not(:disabled) {
     color: var(--text-primary);
     background: rgba(255, 255, 255, 0.08);
   }

   /* After */
   .before-leaving-item-reorder button:hover:not(:disabled) {
     color: var(--text-primary);
     background: var(--accent-primary-dim);
   }
   ```

5. **Lines 4754-4758**: Fix `.before-leaving-item-title:hover` text color:
   ```css
   /* Before */
   .before-leaving-item-title:hover {
     color: #ffffff;
     text-decoration: underline;
     text-decoration-color: var(--border-hover);
   }

   /* After */
   .before-leaving-item-title:hover {
     color: var(--text-primary);
     text-decoration: underline;
     text-decoration-color: var(--border-hover);
   }
   ```

6. **Lines 4792-4795**: Fix `.before-leaving-item-btn:hover`:
   ```css
   /* Before */
   .before-leaving-item-btn:hover {
     color: var(--text-primary);
     background: rgba(255, 255, 255, 0.08);
   }

   /* After */
   .before-leaving-item-btn:hover {
     color: var(--text-primary);
     background: var(--accent-primary-dim);
   }
   ```

7. **Lines 4802-4822**: Fix `.before-leaving-launch-preview-btn` and `:hover`:
   ```css
   /* Before */
   .before-leaving-launch-preview-btn {
     width: 100%;
     height: 42px;
     display: flex;
     align-items: center;
     justify-content: center;
     gap: 8px;
     background: rgba(255, 255, 255, 0.08);
     border: 1px solid var(--border-subtle);
     border-radius: var(--radius-md);
     color: var(--text-primary);
     font-size: var(--font-body);
     font-weight: 500;
     cursor: pointer;
     transition: all 0.15s ease;
   }

   .before-leaving-launch-preview-btn:hover {
     background: rgba(255, 255, 255, 0.14);
     border-color: var(--border-hover);
   }

   /* After */
   .before-leaving-launch-preview-btn {
     width: 100%;
     height: 42px;
     display: flex;
     align-items: center;
     justify-content: center;
     gap: 8px;
     background: var(--bg-card);
     border: 1px solid var(--border-subtle);
     border-radius: var(--radius-md);
     color: var(--text-primary);
     font-size: var(--font-body);
     font-weight: 500;
     cursor: pointer;
     transition: all 0.15s ease;
   }

   .before-leaving-launch-preview-btn:hover {
     background: var(--bg-card-hover);
     border-color: var(--border-hover);
     color: var(--text-primary);
   }
   ```

8. **After line 4823**: Add light mode specific rules for popover shadow and destructive action hover:
   ```css
   /* Light theme specific overrides for Before Leaving popovers and destructive actions */
   [data-theme="light"] .profile-bubble-dropdown {
     box-shadow: 0 12px 32px rgba(0, 0, 0, 0.10);
   }

   [data-theme="light"] .before-leaving-item-btn.before-leaving-item-delete:hover {
     color: #dc2626 !important;
     background: rgba(239, 68, 68, 0.10) !important;
   }
   ```

#### B. In `frontend/src/components/ProfileBubbleContextMenu.jsx`:

1. **Lines 19-23**: Exclude `.header-profile-bubble` from outside-click detection:
   ```javascript
   const handleClickOutside = (e) => {
     if (e.target && e.target.closest && e.target.closest('.header-profile-bubble')) {
       return;
     }
     if (menuRef.current && !menuRef.current.contains(e.target)) {
       onClose();
     }
   };
   ```

### Artifacts Produced
- `remediation_index_css.patch`: Ready-to-apply patch file for `frontend/src/index.css`.
- `remediation_context_menu.patch`: Ready-to-apply patch file for `frontend/src/components/ProfileBubbleContextMenu.jsx`.

---

## 5. Verification Method

To verify the investigation and subsequent implementation:

1. **Automated Verification**:
   ```bash
   # Frontend build verification (must compile with 0 errors)
   npm --prefix frontend run build

   # Frontend lint verification (must preserve 0 errors, 171 baseline warnings)
   npm --prefix frontend run lint

   # Backend API and regression test verification (must pass 66/66 tests)
   ./.venv/bin/pytest tests/test_before_leaving_backend.py tests/test_numeric_tasks_persistence.py tests/test_numeric_challenge_stress.py tests/test_non_numeric_regressions_stress.py
   ```

2. **DOM & CSS Computed Style Verification**:
   Inspect elements in browser with `<html data-theme="light">`:
   - `.before-leaving-add-btn`:
     - Computed `background-color`: `rgb(9, 9, 11)` (`#09090b`)
     - Computed `color`: `rgb(244, 244, 246)` (`#f4f4f6`)
     - Computed contrast ratio: $17.43:1$ (WCAG AAA compliant)
   - `.profile-dropdown-item-primary`:
     - Computed `color`: `rgb(9, 9, 11)` (`#09090b`)
     - Computed `background-color`: `rgb(255, 255, 255)` (`#ffffff`)
     - Computed contrast ratio: $18.99:1$ (WCAG AAA compliant)
   - `.before-leaving-item-title:hover`:
     - Computed `color`: `rgb(9, 9, 11)` (`#09090b`)
     - Computed contrast ratio: $18.03:1$ (WCAG AAA compliant)
   - `.before-leaving-item-btn.before-leaving-item-delete:hover`:
     - Computed `color`: `rgb(220, 38, 38)` (`#dc2626`)
     - Computed contrast ratio: $5.09:1$ (WCAG AA compliant)
