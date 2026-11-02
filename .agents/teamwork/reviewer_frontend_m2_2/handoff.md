# Handoff Report: Milestone 2 — Frontend Styling, Layout, Theme Tokens & Accessibility Review

## 1. Observation

### 1.1 Automated Build, Lint & Test Verification
1. **Frontend Production Build**:
   - Command: `npm --prefix frontend run build`
   - Result: Exit code 0. Vite compiled 2385 modules successfully into `frontend/dist/` in 207ms.
2. **Frontend Linter Check**:
   - Command: `npm --prefix frontend run lint`
   - Result: Exit code 0. 0 errors, 171 warnings (exact baseline count preserved; 0 new linter warnings introduced).
   - Component-specific oxlint: `./frontend/node_modules/.bin/oxlint frontend/src/components/BeforeLeavingConfigModal.jsx frontend/src/components/ProfileBubbleContextMenu.jsx` returned 0 errors and 0 warnings.
3. **Backend & Regression Tests**:
   - Command: `./.venv/bin/pytest tests/test_before_leaving_backend.py tests/test_numeric_tasks_persistence.py tests/test_numeric_challenge_stress.py tests/test_non_numeric_regressions_stress.py`
   - Result: Exit code 0. All 66 tests passed in 6.82s.

### 1.2 Inspection Observations in Implementation Code

#### 1. Theme Tokens and Light Mode (`frontend/src/index.css`)
- In `frontend/src/index.css:4650-4665`:
  ```css
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
  ```
  In dark mode (`:root`), `--accent-primary: #ffffff`, so black text (`#000000`) on white is readable.
  However, in light mode (`[data-theme="light"]`, lines 182-183), `--accent-primary: #09090b` (near-black). Because `color: #000000` is hardcoded, the button renders `#000000` text on `#09090b` background in light mode (contrast ratio 1.05:1; fails WCAG 2.1 AA/AAA completely).
- In `frontend/src/index.css:4592-4595`:
  ```css
  .profile-dropdown-item-primary {
    color: #ffffff;
    font-weight: 600;
  }
  ```
  In `ProfileBubbleContextMenu.jsx:57`, the "Перед выходом" menu item uses `profile-dropdown-item-primary`. In light mode (`[data-theme="light"]`, line 169), the dropdown background is `var(--bg-elevated)` (`#ffffff`). Because `color: #ffffff` is hardcoded, the text "Перед выходом" renders white text on white background (contrast ratio 1.00:1; completely invisible).
- In `frontend/src/index.css:4754`:
  ```css
  .before-leaving-item-title:hover {
    color: #ffffff;
    text-decoration: underline;
    text-decoration-color: var(--border-hover);
  }
  ```
  In light mode, when hovering over checklist item titles on the card (`var(--bg-card)` is `#ffffff`), the text turns white (`#ffffff`), disappearing into the card surface.
- In `frontend/src/index.css:4580` and `4809`:
  Hover backgrounds use hardcoded `rgba(255, 255, 255, 0.08)` which washes out or provides 0 contrast on light background (`#ffffff`).

#### 2. Outside Click & Toggle Race Condition (`frontend/src/components/ProfileBubbleContextMenu.jsx`)
- In `frontend/src/components/ProfileBubbleContextMenu.jsx:17-40`:
  ```javascript
  const handleClickOutside = (e) => {
    if (menuRef.current && !menuRef.current.contains(e.target)) {
      onClose();
    }
  };
  document.addEventListener('mousedown', handleClickOutside);
  document.addEventListener('touchstart', handleClickOutside);
  ```
- In `frontend/src/App.jsx:657-671` & `841-855`:
  ```jsx
  <button
    type="button"
    className={`header-profile-bubble ${isSyncing ? 'is-syncing' : ''}`}
    onClick={() => {
      if (isTgIos) {
        setIsProfileMenuOpen((prev) => !prev);
      } else {
        handlePillRefresh();
      }
    }}
  >
  ```
  When the menu is open (`isProfileMenuOpen === true`) and the user taps or clicks `.header-profile-bubble` to close it:
  1. The browser fires `mousedown`/`touchstart` on `.header-profile-bubble`.
  2. `handleClickOutside` executes because `.header-profile-bubble` is outside `menuRef.current` (which only wraps the dropdown div).
  3. `handleClickOutside` calls `onClose()`, which executes `setIsProfileMenuOpen(false)`.
  4. Immediately after, the browser fires `click` on `.header-profile-bubble`.
  5. The `onClick` handler executes: `setIsProfileMenuOpen((prev) => !prev)`. Since `prev` was just set to `false`, `!prev` is `true`.
  6. The menu immediately re-opens. Tapping the profile bubble to toggle the menu closed is broken.

#### 3. Modal Focus Trap and Initial Focus (`frontend/src/components/BeforeLeavingConfigModal.jsx`)
- In `BeforeLeavingConfigModal.jsx:200-218`:
  The `<input className="before-leaving-input" ... />` lacks `autoFocus` or an initial focus ref when opening. Keyboard users opening the modal have focus remain on the trigger.
  Additionally, Tab key navigation is not trapped within the modal backdrop, allowing focus to cycle into hidden background elements.

---

## 2. Logic Chain

1. **Integrity Verification**:
   - Source code was thoroughly audited for hardcoding, facades, and mock shortcuts.
   - All API endpoints in `frontend/src/api.js` (`fetchBeforeLeavingItems`, `createBeforeLeavingItem`, `updateBeforeLeavingItem`, `deleteBeforeLeavingItem`, `reorderBeforeLeavingItems`, `startBeforeLeavingSession`, `toggleBeforeLeavingCheckItem`, `finishBeforeLeavingSession`) perform authentic network requests against `${API_BASE}/before-leaving/...`, with legitimate local storage cache management and offline fallbacks.
   - No mock flags or dummy facades are present. The implementation is genuine.

2. **R1 & R3 Requirement Conformance**:
   - **R1 (Template Configuration)**: `BeforeLeavingConfigModal.jsx` fully implements adding, inline editing, deleting, and reordering items with persistent backend sync and optimistic updates.
   - **R3 (Adaptive Button Placement)**: `isTelegramIos()` accurately distinguishes Telegram WebApp iOS from Android, Desktop Telegram, and standalone browsers. On Telegram iOS, the button is placed inside the profile context menu; on all other platforms, it is rendered inline on the same horizontal level as the profile bubble in `.sidebar-top-bar` and `.app-header`.

3. **Styling & Visual Accessibility Defect Analysis**:
   - TaskerBot supports dual-theme operation (`data-theme="light"` and dark) managed via `frontend/src/theme.js` and Telegram WebApp `colorScheme`.
   - Hardcoding `#000000` text on `var(--accent-primary)` in `.before-leaving-add-btn` breaks completely in light mode where `--accent-primary` is `#09090b`.
   - Hardcoding `#ffffff` text on `.profile-dropdown-item-primary` breaks completely in light mode where `--bg-elevated` is `#ffffff`.
   - Hardcoding `#ffffff` text on `.before-leaving-item-title:hover` breaks on white card surfaces.
   - In accordance with TaskerBot's established design system conventions (e.g. `.quick-bar-btn-submit` in `index.css:2088-2089`), primary inverted buttons must use `background: var(--text-primary); color: var(--bg-app);` or theme-adaptive semantic tokens.

4. **Event Coordination Defect Analysis**:
   - The outside-click handler in `ProfileBubbleContextMenu` fails to exclude its own triggering element (`.header-profile-bubble`), causing a state flip-flop between `mousedown` (`onClose()`) and `click` (`(prev) => !prev`).

5. **Verdict Rationale**:
   - While functional logic and API contracts are well implemented, the visual contrast failure in light mode renders primary actions completely unreadable and invisible to users. Furthermore, the toggle race condition degrades iOS context menu usability.
   - Therefore, a formal verdict of **REQUEST_CHANGES** is required.

---

## 3. Caveats

- Physical VoiceOver screen reader testing on an actual Apple iOS device running Telegram native client was not conducted directly; evaluation was performed via DOM structure, ARIA attribute inspection, and browser event simulation.
- All other non-theme components and backend routes are functioning as specified.

---

## 4. Conclusion

The Milestone 2 implementation demonstrates solid architecture, authentic API contracts, robust platform detection, and zero linter/build regressions. However, two high-impact issues must be addressed before proceeding:
1. **Critical Contrast Failure in Light Mode**: Primary button text and context menu text become invisible due to hardcoded hex colors conflicting with light theme variables.
2. **Major Outside-Click Race Condition**: Tapping the profile bubble cannot toggle the context menu closed.

Formal Verdict: **REQUEST_CHANGES**

---

## 5. Verification Method

To verify the reported defects and subsequent fixes:
1. **Light Mode Visual Inspection**:
   In browser DevTools, set `<html data-theme="light">` (or execute `document.documentElement.setAttribute('data-theme', 'light')`).
   - Open `ProfileBubbleContextMenu`: inspect the computed `color` and `background-color` of `.profile-dropdown-item-primary` (currently `#ffffff` on `#ffffff`).
   - Open `BeforeLeavingConfigModal`: inspect the computed `color` and `background-color` of `.before-leaving-add-btn` (currently `#000000` on `#09090b`).
2. **Toggle Race Condition**:
   Set `isTgIos` to true or simulate Telegram iOS. Click the profile bubble to open the menu. Click the profile bubble again. Observe that the menu fails to close.
3. **Build & Lint Verification**:
   ```bash
   npm --prefix frontend run build
   npm --prefix frontend run lint
   ```

---

# Detailed Quality Review Report

**Verdict**: REQUEST_CHANGES

## Findings

### [Critical] Finding 1: Unreadable & Invisible Text in Light Mode (`data-theme="light"`)
- **What**: Black-on-black and white-on-white text rendering primary actions illegible in light theme.
- **Where**: `frontend/src/index.css` lines 4593, 4657, 4754, 4809.
- **Why**:
  1. `.before-leaving-add-btn`: `background: var(--accent-primary)` (`#09090b` in light mode) with hardcoded `color: #000000` results in black text on black background (contrast ratio 1.05:1).
  2. `.profile-dropdown-item-primary`: Hardcoded `color: #ffffff` inside `.profile-bubble-dropdown` (`background: var(--bg-elevated)`, which is `#ffffff` in light mode) results in white text on white background (contrast ratio 1.00:1).
  3. `.before-leaving-item-title:hover`: Hardcoded `color: #ffffff` turns item title white against white card background.
- **Suggestion**:
  - In `frontend/src/index.css`:
    ```css
    /* Fix .before-leaving-add-btn: follow .quick-bar-btn-submit pattern */
    .before-leaving-add-btn {
      background: var(--text-primary);
      color: var(--bg-app);
      ...
    }

    /* Fix .profile-dropdown-item-primary */
    .profile-dropdown-item-primary {
      color: var(--text-primary);
      font-weight: 600;
    }

    /* Fix hover on items */
    .before-leaving-item-title:hover {
      color: var(--text-primary);
      text-decoration: underline;
      text-decoration-color: var(--border-hover);
    }

    /* Fix preview button hover tokens */
    .before-leaving-launch-preview-btn {
      background: var(--bg-card-hover, rgba(255, 255, 255, 0.08));
      color: var(--text-primary);
      ...
    }
    .before-leaving-launch-preview-btn:hover {
      background: var(--bg-input-focus, rgba(255, 255, 255, 0.14));
      border-color: var(--border-hover);
    }
    ```

### [Major] Finding 2: Profile Bubble Tap Cannot Close Context Menu (Toggle Race Condition)
- **What**: Tapping or clicking `.header-profile-bubble` while `ProfileBubbleContextMenu` is open fails to dismiss the menu.
- **Where**: `frontend/src/components/ProfileBubbleContextMenu.jsx` lines 19-23.
- **Why**: `handleClickOutside` triggers on `mousedown`/`touchstart` and calls `onClose()`, resetting state to `false`. Then `onClick` on `.header-profile-bubble` fires `setIsProfileMenuOpen((prev) => !prev)` which flips it back to `true`.
- **Suggestion**:
  In `frontend/src/components/ProfileBubbleContextMenu.jsx:20`, exclude `.header-profile-bubble`:
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

### [Minor] Finding 3: Missing Focus Management and Dialog Focus Trap
- **What**: Opening `BeforeLeavingConfigModal` does not focus the item title input, and keyboard Tab navigation can escape into background DOM.
- **Where**: `frontend/src/components/BeforeLeavingConfigModal.jsx`.
- **Why**: Degrades keyboard and accessibility ergonomics for screen reader / keyboard-only users.
- **Suggestion**: Add a ref to the add-item input and call `inputRef.current?.focus()` on open, or implement a simple Tab trap within the dialog container.

### [Minor] Finding 4: Text Overflow Risk on Narrow Screens (< 360px) for Non-iOS
- **What**: On Android / mobile web screens narrower than 360px, placing `.header-before-leaving-btn` (with full text "Перед выходом") beside `.header-profile-bubble` may cause horizontal constraint pressure in `.app-header`.
- **Where**: `frontend/src/index.css:4825`.
- **Suggestion**: Consider adding a mobile media query (`@media (max-width: 360px)`) that hides the text `span` and keeps only the `DoorOpen` icon, matching the tablet rail behavior.

## Verified Claims
- `npm --prefix frontend run build`: 0 errors → verified → PASS
- `npm --prefix frontend run lint`: 0 errors, 171 baseline warnings → verified → PASS
- `./.venv/bin/pytest`: 66 passed → verified → PASS
- R1 persistent template CRUD and reorder API integration → verified → PASS
- R3 adaptive placement (iOS Telegram context menu vs non-iOS inline button) → verified → PASS

## Coverage Gaps
- None.

## Unverified Items
- Physical iOS device VoiceOver gesture navigation (simulated via ARIA and DOM audit).

---

# Adversarial Challenge Report

**Overall risk assessment**: HIGH (due to visual failure in production light theme and UI lockup on context menu dismissal).

## Challenges

### [Critical] Challenge 1: User switches to Light Theme in Telegram or Web Browser
- **Assumption challenged**: The UI is only viewed in dark mode.
- **Attack scenario**: User has system light mode enabled, or Telegram client set to light theme (`colorScheme === 'light'`). App invokes `applyTheme()` setting `data-theme="light"`.
- **Blast radius**:
  1. In the iOS Profile Context menu, the primary button «Перед выходом» has white text on white background (`#ffffff` on `#ffffff`), making the entire feature unfindable.
  2. In the template editor, the «Добавить» button has black text on black background (`#000000` on `#09090b`), rendering the primary submission action unreadable.
- **Mitigation**: Replace hardcoded hex colors with theme-aware CSS custom properties (`var(--text-primary)`, `var(--bg-app)`).

### [High] Challenge 2: iOS Telegram User Taps Profile Bubble to Dismiss Menu
- **Assumption challenged**: Outside-click handlers work cleanly with separate trigger buttons without explicit exclusion.
- **Attack scenario**: User taps profile bubble to open menu, decides not to start the session, and naturally taps the profile bubble again to close it.
- **Blast radius**: Menu flashes and remains open. User is unable to close the menu via the trigger button.
- **Mitigation**: Ignore outside clicks when `e.target.closest('.header-profile-bubble')` is truthy.

## Stress Test Results
- Scenario 1: Empty template start → launches `handleStartBeforeLeaving()` → API returns 400 → falls back to opening `BeforeLeavingConfigModal` → PASS.
- Scenario 2: Rapid item reordering at bounds (index 0 move up, last index move down) → disabled states and bounds guards prevent out-of-range index → PASS.
- Scenario 3: Extremely long item title (500 chars) → constrained by `maxLength={500}` and `word-break: break-word` → PASS.
- Scenario 4: Modal Escape key during inline edit vs general modal → first Escape cancels inline edit; second Escape dismisses modal → PASS.
- Scenario 5: Light theme rendering → contrast fails completely on primary buttons → FAIL.
- Scenario 6: Profile bubble tap-to-toggle dismissal → toggle race condition causes menu to remain open → FAIL.

## Unchallenged Areas
- Backend SQLite/Postgres transaction locks (tested and confirmed in Milestone 1).
