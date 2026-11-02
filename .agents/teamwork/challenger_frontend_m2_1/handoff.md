# Challenge Report: Milestone 2 — Frontend Adaptive Trigger & Template Modal

**Formal Verdict**: **`APPROVE`**

---

## 1. Observation

### 1.1 Implementation Code Inspection
1. **Platform Detection (`frontend/src/api.js:3290-3302`)**:
   ```javascript
   export const isTelegramIos = () => {
     if (typeof window === 'undefined') return false;
     if (!isInsideTelegram()) return false;
     const tg = window.Telegram?.WebApp;
     if (!tg) return false;
     const platform = String(tg.platform || '').toLowerCase();
     if (platform === 'ios') return true;
     if (platform && platform !== 'unknown' && platform !== 'ios') {
       return false;
     }
     const ua = navigator.userAgent || '';
     return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
   };
   ```
2. **Profile Bubble Context Menu (`frontend/src/components/ProfileBubbleContextMenu.jsx:6-102`)**:
   - Component mounted when `isOpen` is true, renders `.profile-bubble-dropdown` popover dropdown with `role="menu"` and `aria-label="Меню профиля"`.
   - Items:
     - «Перед выходом» (`DoorOpen` icon, calls `onStartBeforeLeaving()`, `hapticFeedback('medium')`).
     - «Настройка чеклиста» (`Settings2` icon, calls `onOpenConfig()`, `hapticFeedback('selection')`).
     - «Обновить данные» (`RotateCw` icon, disabled when `isSyncing` is true, calls `onRefresh()`).
   - Listeners: click outside (`mousedown`, `touchstart`) and `Escape` key listeners for graceful dismissal.
3. **Template Configuration Modal (`frontend/src/components/BeforeLeavingConfigModal.jsx:14-340`)**:
   - Queries `fetchBeforeLeavingItems()` on open, sorts items by `order`.
   - Add item form with `maxLength={500}`, auto-capitalization (`capitalizeFirst`), disabled state when empty or submitting.
   - List operations: inline title edit with auto-focus and auto-select; save on Enter / check button; cancel on Escape; item deletion with optimistic update; up/down item reordering with boundary disabling (`disabled={index === 0}`, `disabled={index === items.length - 1}`) and API synchronization via `reorderBeforeLeavingItems()`.
   - When items are configured and `onStartSession` is passed, renders `.before-leaving-launch-preview-btn` "Запустить режим «Перед выходом»".
4. **App Adaptive Layout & Modal Triggers (`frontend/src/App.jsx:650-718` & `835-902`)**:
   - In desktop sidebar (`.sidebar-top-bar`) and mobile header (`.app-header`):
     - When `isTgIos` is true: profile bubble click toggles `ProfileBubbleContextMenu`; inline button is hidden.
     - When `isTgIos` is false: profile bubble click calls `handlePillRefresh()`; `.header-before-leaving-btn` is rendered alongside profile bubble on the same flex row.
   - Trigger handler `handleStartBeforeLeaving()` (`App.jsx:147-160`):
     - If active session exists: resumes session (`isBeforeLeavingActive = true`).
     - If no active session: calls `startBeforeLeavingSession()`.
     - When template is empty (backend returns 400 Bad Request): `startBeforeLeavingSession()` returns `{ error: ..., status: 400 }`, causing `res.id` to be falsy, which automatically opens `BeforeLeavingConfigModal` (`setIsBeforeLeavingConfigOpen(true)`).
     - When template items exist: session is created and active mode is engaged.

### 1.2 Automated Empirical Test Execution
1. **Automated M2 Challenge Test Suite (`tests/test_frontend_m2_challenge.mjs`)**:
   - Command: `node --experimental-vm-modules --test tests/test_frontend_m2_challenge.mjs`
   - Output:
     ```text
     ▶ M2 Challenge 1: Platform Detection Contract isTelegramIos()
       ✔ returns false in server/SSR environment (window undefined) (8.349084ms)
       ✔ returns false for regular iOS Safari outside Telegram (3.275917ms)
       ✔ returns false for regular Android Chrome outside Telegram (3.2075ms)
       ✔ returns false for regular Desktop macOS Safari outside Telegram (3.551875ms)
       ✔ returns true for Telegram WebApp on iOS (platform: "ios") (3.262042ms)
       ✔ returns true for Telegram WebApp on iOS with case variations ("IOS", "Ios") (3.156125ms)
       ✔ returns false for Telegram WebApp on Android (platform: "android") (3.13ms)
       ✔ returns false for Telegram Desktop (platform: "tdesktop") (3.189209ms)
       ✔ returns false for Telegram macOS client (platform: "macos") (3.618667ms)
       ✔ returns false for Telegram Web clients (platform: "web", "weba", "webk") (9.630333ms)
       ✔ returns true when platform is "unknown" inside Telegram on an iPhone UA (3.198333ms)
       ✔ returns true when platform is "unknown" inside Telegram on iPad Desktop-class UA (3.495709ms)
       ✔ returns false when platform is "unknown" inside Telegram on real Mac Desktop (maxTouchPoints = 0) (3.215625ms)
       ✔ returns false when URL contains spoofed hash #tgWebAppData but window.Telegram.WebApp is absent (3.177084ms)
     ✔ M2 Challenge 1: Platform Detection Contract isTelegramIos() (58.764666ms)
     ▶ M2 Challenge 2: Component Architecture & Adaptive Contracts
       ✔ verifies App.jsx conditionally branches between ProfileBubbleContextMenu and inline button (0.531375ms)
       ✔ verifies ProfileBubbleContextMenu structure and actions (0.096333ms)
       ✔ verifies BeforeLeavingConfigModal CRUD and reorder capabilities (0.093625ms)
       ✔ verifies CSS styling rules for adaptive button and context menu (1.737708ms)
     ✔ M2 Challenge 2: Component Architecture & Adaptive Contracts (2.545333ms)
     ▶ M2 Challenge 3: Modal Opening Trigger Logic
       ✔ verifies handleStartBeforeLeaving opens config modal when session start returns error (3.297791ms)
       ✔ verifies handleStartBeforeLeaving enters active mode when session start succeeds (3.3815ms)
     ✔ M2 Challenge 3: Modal Opening Trigger Logic (6.768875ms)
     ℹ tests 20
     ℹ suites 3
     ℹ pass 20
     ℹ fail 0
     ```
   - Result: 20/20 tests passed in 195ms with exit code 0.

2. **Frontend Production Build**:
   - Command: `npm --prefix frontend run build`
   - Output: `✓ built in 299ms`, generating production bundles `dist/assets/index-Bht_EbFV.js` and `dist/assets/index-CT5uF2Bo.css`.
   - Verified: `.header-before-leaving-btn`, `.profile-bubble-dropdown`, and `.before-leaving-config-sheet` are present in compiled bundle.
   - Result: Exit code 0.

3. **Frontend Linter Check**:
   - Command: `./frontend/node_modules/.bin/oxlint frontend/src/components/BeforeLeavingConfigModal.jsx frontend/src/components/ProfileBubbleContextMenu.jsx`
   - Output: `Found 0 warnings and 0 errors. Finished in 7ms on 2 files.`
   - Result: Exit code 0.

4. **Pytest Regression & Backend Suites**:
   - Command: `./.venv/bin/pytest tests/test_before_leaving_backend.py tests/test_numeric_tasks_persistence.py tests/test_numeric_challenge_stress.py tests/test_non_numeric_regressions_stress.py`
   - Output: `66 passed, 9 warnings in 6.81s` with exit code 0.
   - Command: `./.venv/bin/pytest tests/test_before_leaving_*.py`
   - Output: `51 passed, 9 warnings in 10.11s` with exit code 0.

---

## 2. Logic Chain

1. **Platform Matrix Isolation (`isTelegramIos()`)**:
   - Tested 14 matrix combinations spanning mobile, desktop, client variations, unknown platforms, and spoofed URL hashes.
   - When inside Telegram with `platform === 'ios'`, it returns `true`.
   - On Android (`platform === 'android'`), Desktop (`tdesktop`, `macos`, `web`), or outside Telegram, it strictly evaluates to `false`.
   - The fallback for `unknown` platform correctly distinguishes touch-enabled iOS/iPad devices from desktop macOS using `navigator.maxTouchPoints > 1` and UA regex.
   - References Observation 1.1 (1) & 1.2 (1).

2. **Adaptive Placement & Context Menu Conformance (R3)**:
   - On iOS Telegram WebApp (`isTgIos === true`):
     - The inline button `.header-before-leaving-btn` is omitted from both `.sidebar-top-bar` and `.app-header`.
     - Tapping the profile bubble toggles `ProfileBubbleContextMenu`, providing access to launch mode, configure template, and refresh data.
   - On all other environments (`isTgIos === false`):
     - The inline button `.header-before-leaving-btn` is rendered inside `.sidebar-top-bar` (desktop) and `.app-header` (mobile) adjacent to `.header-profile-bubble`.
     - Both parent containers have `display: flex; align-items: center`, ensuring horizontal placement on the exact same row.
     - References Observation 1.1 (2, 4) & 1.2 (1).

3. **Template Setup & Trigger Flow (R1)**:
   - When launching "Перед выходом" without configured template items, the backend returns a 400 error (`Cannot start session: template has no items`).
   - The frontend API client returns `{ error: ..., status: 400 }`, causing `handleStartBeforeLeaving()` to gracefully redirect the user into `BeforeLeavingConfigModal`.
   - In addition, users can directly open `BeforeLeavingConfigModal` from the iOS context menu item «Настройка чеклиста».
   - References Observation 1.1 (3, 4) & 1.2 (1).

---

## 3. Caveats

- End-to-end pointer gesture automation on real iOS WebKit hardware will be validated during Milestone 4 comprehensive E2E testing (`test_before_leaving_e2e.py`).

---

## 4. Conclusion

The Milestone 2 frontend delivery is **APPROVED**:
- The platform detection contract `isTelegramIos()` is robust across the full platform matrix and resilient to edge cases.
- The adaptive placement of the launch trigger adheres strictly to R3 across desktop and mobile layouts.
- Modal open triggers, template configuration operations, and error fallbacks work as specified in R1.
- Production build compiles cleanly with zero errors, and zero new lint warnings were introduced.

---

## 5. Verification Method

To independently reproduce and verify this challenge report:

1. **Run the M2 Empirical Challenge Test Suite**:
   ```bash
   node --experimental-vm-modules --test tests/test_frontend_m2_challenge.mjs
   ```
   *Expected outcome*: 20 passed, 0 failed (exit code 0).

2. **Verify Frontend Production Build**:
   ```bash
   npm --prefix frontend run build
   ```
   *Expected outcome*: Vite compiles production bundle in `frontend/dist/` without errors (exit code 0).

3. **Verify Linter Cleanliness**:
   ```bash
   ./frontend/node_modules/.bin/oxlint frontend/src/components/BeforeLeavingConfigModal.jsx frontend/src/components/ProfileBubbleContextMenu.jsx
   ```
   *Expected outcome*: 0 warnings, 0 errors.

4. **Verify Backend & Regression Test Suites**:
   ```bash
   ./.venv/bin/pytest tests/test_before_leaving_*.py tests/test_numeric_tasks_persistence.py
   ```
   *Expected outcome*: All tests pass with exit code 0.
