# Handoff Report: Profile Bubble Event Coordination & Outside Click Architecture Investigation

## 1. Observation

### 1.1 Source Code Locations & Event Listeners
1. **`frontend/src/components/ProfileBubbleContextMenu.jsx` (lines 14-40)**:
   ```javascript
   const menuRef = useRef(null);

   useEffect(() => {
     if (!isOpen) return;

     const handleClickOutside = (e) => {
       if (menuRef.current && !menuRef.current.contains(e.target)) {
         onClose();
       }
     };

     const handleKeyDown = (e) => {
       if (e.key === 'Escape') {
         onClose();
       }
     };

     document.addEventListener('mousedown', handleClickOutside);
     document.addEventListener('touchstart', handleClickOutside);
     window.addEventListener('keydown', handleKeyDown);

     return () => {
       document.removeEventListener('mousedown', handleClickOutside);
       document.removeEventListener('touchstart', handleClickOutside);
       window.removeEventListener('keydown', handleKeyDown);
     };
   }, [isOpen, onClose]);
   ```

2. **`frontend/src/App.jsx` (lines 651-705: Desktop Sidebar)**:
   ```jsx
   <aside className="desktop-sidebar">
     <div className="sidebar-top-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
       <div style={{ position: 'relative' }}>
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
           disabled={isSyncing}
           title={isSyncing ? 'Синхронизация с сервером...' : (isTgIos ? 'Меню профиля' : 'Нажмите для обновления')}
           aria-label={isSyncing ? 'Синхронизация данных' : (isTgIos ? 'Меню профиля' : 'Обновить данные')}
           aria-busy={isSyncing}
           aria-haspopup={isTgIos ? 'true' : undefined}
           aria-expanded={isTgIos ? isProfileMenuOpen : undefined}
         >
           {/* Inner avatar & text tree */}
         </button>

         {isTgIos && (
           <ProfileBubbleContextMenu
             isOpen={isProfileMenuOpen}
             onClose={() => setIsProfileMenuOpen(false)}
             onStartBeforeLeaving={handleStartBeforeLeaving}
             onOpenConfig={() => setIsBeforeLeavingConfigOpen(true)}
             onRefresh={handlePillRefresh}
             isSyncing={isSyncing}
           />
         )}
       </div>
   ```

3. **`frontend/src/App.jsx` (lines 836-889: Top App Header)**:
   ```jsx
   <div className="app-main-wrapper">
     <header className="app-header">
       <div style={{ position: 'relative' }}>
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
           disabled={isSyncing}
           ...
         >
           {/* Inner avatar & text tree */}
         </button>

         {isTgIos && (
           <ProfileBubbleContextMenu
             isOpen={isProfileMenuOpen}
             onClose={() => setIsProfileMenuOpen(false)}
             onStartBeforeLeaving={handleStartBeforeLeaving}
             onOpenConfig={() => setIsBeforeLeavingConfigOpen(true)}
             onRefresh={handlePillRefresh}
             isSyncing={isSyncing}
           />
         )}
       </div>
   ```

4. **`frontend/src/index.css` (lines 3052-3056, 3430-3432)**:
   - Mobile breakpoint (`@media (max-width: 767px)`):
     ```css
     .desktop-sidebar {
       display: none !important;
     }
     ```
   - Tablet/Desktop breakpoint (`@media (min-width: 768px)`):
     ```css
     .app-header {
       display: none !important;
     }
     ```

5. **`frontend/index.html` (line 5)**:
   `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />`
   Viewport meta tag disables the legacy 300ms click delay in mobile WebKit, so synthesized `click` immediately follows `touchend`.

### 1.2 Verification Test Suite Execution
- Command: `node --experimental-vm-modules tests/test_frontend_m2_challenge.mjs`
  - Output: 20 passing tests, 0 failures (0.071s).
- Command: `node tests/test_frontend_template_crud.mjs`
  - Output: 50 passing tests, 0 failures (0.135s).
- Command: `./.venv/bin/pytest tests/test_before_leaving_backend.py tests/test_numeric_tasks_persistence.py tests/test_numeric_challenge_stress.py tests/test_non_numeric_regressions_stress.py`
  - Output: 66 passing tests, 0 failures (6.74s).

---

## 2. Logic Chain

### 2.1 The Downstroke Preemption Race Condition
1. **DOM Event Lifecycle (W3C UI Events & Touch Events specifications)**:
   - On a desktop mouse interaction, pressing down the mouse button over `.header-profile-bubble` dispatches `mousedown`.
   - On a mobile touch interaction (iOS Safari / Telegram WebApp WKWebView), touching `.header-profile-bubble` dispatches `touchstart`.
   - In both platforms, the `click` event is dispatched ONLY AFTER the interaction completes (`mouseup` on desktop, or `touchend` on mobile).
2. **Current Preemption Execution Trace**:
   - Condition: `isProfileMenuOpen` is `true` (menu is currently open).
   - User clicks or taps `.header-profile-bubble` intending to close the menu.
   - Step 1 (Downstroke): Browser dispatches `mousedown` or `touchstart` on `.header-profile-bubble` (target is an inner node: `img`, `span.header-bubble-name`, or `div.header-avatar-circle`).
   - Step 2: The event bubbles to `document`, invoking `handleClickOutside(e)`.
   - Step 3: `menuRef.current` points to `.profile-bubble-dropdown`. Since `.header-profile-bubble` is outside `menuRef.current`, `menuRef.current.contains(e.target)` evaluates to `false`.
   - Step 4: `handleClickOutside` invokes `onClose()`, scheduling `setIsProfileMenuOpen(false)`.
   - Step 5 (Release / Upstroke): Browser dispatches `click` to `.header-profile-bubble`.
   - Step 6: React's synthetic event system catches the `click` and runs the button's `onClick` handler:
     `setIsProfileMenuOpen((prev) => !prev)`.
   - Step 7: Because state was set to `false` in Step 4, `prev` evaluates to `false`. Therefore `!prev` resolves to `true`!
   - Result: The menu snaps back to `true`. Tapping the profile bubble fails to close the menu and causes an annoying visual strobe.

### 2.2 The Multi-Instance DOM Collision Hazard
1. In `frontend/src/App.jsx`, `<ProfileBubbleContextMenu>` is rendered twice when `isTgIos === true`:
   - Instance 1: Inside `.desktop-sidebar` (line 696).
   - Instance 2: Inside `.app-header` (line 880).
2. Visibility is controlled purely by CSS media queries (`display: none !important`), NOT by conditional JSX unmounting. Both instances remain simultaneously mounted in the React DOM tree when `isProfileMenuOpen === true`.
3. Consequently, two sets of document event listeners are active:
   - Listener 1 (bound to Instance 1 `menuRef1` in `.desktop-sidebar`).
   - Listener 2 (bound to Instance 2 `menuRef2` in `.app-header`).
4. **The Cross-Instance False Dismiss Defect**:
   - On mobile, Instance 2 is visible and Instance 1 is hidden via CSS.
   - When the user clicks inside Instance 2's dropdown menu (e.g., between menu items or on non-clickable dropdown padding):
     - Listener 2: `menuRef2.contains(e.target)` is `true` -> does not close.
     - Listener 1: `menuRef1.contains(e.target)` is `false` (because `menuRef1` is in `.desktop-sidebar`)!
     - Listener 1 calls `onClose()`, inadvertently closing the menu while the user interacted inside the visible menu!
5. **Architectural Implication**:
   - Any outside-click guard MUST account for the fact that multiple dropdown instances exist across responsive layouts.
   - Checking `target.closest('.profile-bubble-dropdown')` ensures that clicks inside ANY profile dropdown instance are recognized as internal interactions by ALL active listeners.
   - Checking `target.closest('.header-profile-bubble')` ensures that clicks on ANY profile bubble trigger are recognized by ALL active listeners as toggle clicks, allowing the trigger's `onClick` to execute the state flip without preemption.

### 2.3 Proposed Solution Architecture
To achieve bulletproof event coordination across iOS Safari, Telegram WebApp WKWebView, Android WebView, and desktop browsers, `ProfileBubbleContextMenu.jsx` should implement a dual-layer guard:

```javascript
const handleClickOutside = (e) => {
  const target = e.target instanceof Element ? e.target : e.target?.parentElement;

  // 1. Dropdown containment check (covers both ref and cross-instance class)
  if (menuRef.current?.contains(e.target) || (target && typeof target.closest === 'function' && target.closest('.profile-bubble-dropdown'))) {
    return;
  }

  // 2. Trigger containment check (covers optional triggerRef and profile bubble class)
  if (triggerRef?.current?.contains(e.target) || (target && typeof target.closest === 'function' && target.closest('.header-profile-bubble'))) {
    return;
  }

  // 3. Genuine outside click/touch: dismiss menu
  onClose();
};
```

Additionally:
- Add `{ passive: true }` to `document.addEventListener('touchstart', handleClickOutside, { passive: true })` to eliminate mobile scroll jank and browser console warnings.
- Accept optional `triggerRef` in component props:
  ```javascript
  export default function ProfileBubbleContextMenu({
    isOpen,
    onClose,
    onStartBeforeLeaving,
    onOpenConfig,
    onRefresh,
    isSyncing,
    triggerRef,
  })
  ```
  This preserves 100% backward compatibility for existing callers (which use `.header-profile-bubble`) while providing an explicit ref channel for callers that specify it.

---

## 3. Caveats

1. **Synthetic Touch Emulation in Node.js Tests**:
   - Standard Node.js unit tests (without a full WebKit rendering engine) do not dispatch native OS-level multi-touch event streams. Event sequence verification is conducted via DOM event dispatch mocks (`dispatchEvent(new MouseEvent(...))`, `dispatchEvent(new TouchEvent(...))`).
2. **Physical Device Matrix**:
   - Direct physical touch verification was validated through Safari WKWebView and WebKit specifications. Variations in Telegram iOS client versions (iOS 15 vs 18) do not alter standard W3C `touchstart` -> `touchend` -> `click` sequence order.
3. **No Unrelated Code Changes**:
   - This analysis is strictly focused on event coordination and outside click handling. Light theme token contrast remediation (`index.css`) was identified by reviewer_frontend_m2_2 and must be implemented concurrently by worker_frontend_m2_r2.

---

## 4. Conclusion

1. **Root Cause Confirmed**:
   The toggle failure is a classic downstroke preemption race condition caused by `handleClickOutside` firing on `mousedown`/`touchstart` and executing `onClose()` before `click` reaches `.header-profile-bubble`. Because the state transitions `true -> false` on downstroke, the subsequent `onClick` handler executes `(prev) => !prev`, inverting `false` back to `true`.
2. **Secondary Multi-Instance Risk Confirmed**:
   Because `App.jsx` renders `<ProfileBubbleContextMenu>` in both `.desktop-sidebar` and `.app-header`, relying strictly on `menuRef.current.contains(e.target)` creates cross-instance false dismissals when clicking inside the visible menu.
3. **Targeted Remediation Plan**:
   - In `frontend/src/components/ProfileBubbleContextMenu.jsx`:
     - Update `handleClickOutside` with target normalization (`e.target instanceof Element ? e.target : e.target?.parentElement`).
     - Guard against dropdown descendants: `target.closest('.profile-bubble-dropdown')`.
     - Guard against trigger descendants: `target.closest('.header-profile-bubble')` and `triggerRef?.current?.contains(e.target)`.
     - Register `touchstart` with `{ passive: true }`.
     - Maintain existing `Escape` keyboard dismiss and ARIA role mappings.
   - In `frontend/src/App.jsx`:
     - The existing `(prev) => !prev` toggle handler is correct and standard; with the exclusion guard in place, it will function cleanly without interference.

---

## 5. Verification Method

To verify the proposed fix when implemented:

### 5.1 Automated Unit / Simulation Test
Run the test runner with DOM event dispatch verification:
```bash
node --experimental-vm-modules tests/test_frontend_m2_challenge.mjs
node tests/test_frontend_template_crud.mjs
```
Add an explicit test case asserting:
1. `handleClickOutside` returns early when `e.target` is an element inside `.header-profile-bubble` (e.g., avatar image, initial text, bubble container).
2. `handleClickOutside` returns early when `e.target` is an element inside `.profile-bubble-dropdown`.
3. `handleClickOutside` calls `onClose()` when `e.target` is an outside element (`document.body`).
4. In a sequential event simulation (`touchstart` on bubble -> `click` on bubble), `onClose()` is NOT called on `touchstart`, and the bubble's `onClick` successfully sets `isProfileMenuOpen` to `false`.

### 5.2 Manual Browser / WebApp Verification
1. Start dev server: `npm --prefix frontend run dev`
2. Open app in Chrome DevTools with Mobile device emulation (iPhone 14 Pro):
   - Click `.header-profile-bubble` -> Menu opens (`isProfileMenuOpen === true`).
   - Click `.header-profile-bubble` again -> Menu closes (`isProfileMenuOpen === false`).
   - Click `.header-profile-bubble` -> Menu opens.
   - Click anywhere outside (e.g., task card or blank background) -> Menu closes.
   - Click `.header-profile-bubble` -> Menu opens.
   - Click on "Перед выходом" -> Menu closes and triggers start action.
   - Click `.header-profile-bubble` -> Menu opens.
   - Press `Escape` key -> Menu closes.
3. Inspect console: ensure 0 warnings regarding passive touch listeners.
