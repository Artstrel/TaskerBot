# Handoff Report: Multi-Layer Hard-Lock Mechanisms for Milestone 3 (Requirement R2)

## 1. Observation

Direct observations from codebase inspection of `/Users/artstrelani/Documents/TaskerBot`:

1. **Desktop Sidebar & Header Navigation (`frontend/src/App.jsx`)**:
   - Lines 651-832: `<aside className="desktop-sidebar">` renders profile bubble, quick-add button (`.sidebar-quick-add-btn`), and four navigation buttons (`.sidebar-nav-item`) with click handlers calling `handleTabSwitch(tab)`:
     ```jsx
     <button className={`sidebar-nav-item ${activeTab === 'today' ? 'active' : ''}`} onClick={() => handleTabSwitch('today')} ...>
     ```
   - Lines 837-915: `<header className="app-header">` renders mobile profile bubble, context menu, and «Перед выходом» button (`.header-before-leaving-btn`).
   - Lines 991-1010: Mobile floating action button `<motion.button className="app-fab mobile-only-fab" onClick={() => setIsQuickAddOpen(true)} ...>`.
   - Lines 1013-1082: `<nav className="bottom-dock mobile-only-dock">` renders mobile navigation dock with four buttons calling `handleTabSwitch(tab)`:
     ```jsx
     <motion.button className={`dock-nav-item ${activeTab === 'today' ? 'active' : ''}`} onClick={() => handleTabSwitch('today')}>
     ```

2. **Tab Switching Handler (`frontend/src/App.jsx:508-516`)**:
   - `handleTabSwitch` contains no guards preventing tab switching when an active overlay or session is running:
     ```javascript
     const handleTabSwitch = (tab) => {
       hapticFeedback('selection');
       setActiveTab(tab);
       setTabSwitchTrigger((prev) => prev + 1);
       if (Date.now() - lastFetchedRef.current > 4000) {
         loadData(false, true);
       }
     };
     ```

3. **Global Keyboard Shortcuts (`frontend/src/App.jsx:320-337`)**:
   - Global desktop keyboard shortcuts listener listens on `window` and opens `QuickAddModal` on keys `c`, `n`, `с`, `т` without checking if `isBeforeLeavingActive` is true:
     ```javascript
     useEffect(() => {
       const handleKeyDown = (e) => {
         if (['c', 'n', 'с', 'т'].includes(e.key.toLowerCase())) {
           const target = e.target;
           const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
           if (!isInput && !isQuickAddOpen) {
             e.preventDefault();
             setQuickAddOptions({
               initialCategory: activeTab === 'groceries' ? 'grocery' : activeTab === 'goals' ? 'goal' : 'one_time',
             });
             setIsQuickAddOpen(true);
           }
         }
       };
       window.addEventListener('keydown', handleKeyDown);
       return () => window.removeEventListener('keydown', handleKeyDown);
     }, [isQuickAddOpen, activeTab]);
     ```

4. **Existing Modal Dismiss Patterns (`frontend/src/components/BeforeLeavingConfigModal.jsx`)**:
   - Lines 50-56: Listens to `e.key === 'Escape'` and closes modal via `onClose()`.
   - Lines 190-192: Backdrop click dismisses modal: `onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}`.
   - Lines 212-219: Header contains close button `<button type="button" className="sheet-close-btn" onClick={onClose}><X size={16} /></button>`.
   - In contrast, Requirement R2 explicitly prohibits dismissal while checklist items are incomplete.

5. **Telegram WebApp SDK Integration (`frontend/src/App.jsx:187-205`)**:
   - Telegram WebApp methods are currently initialized at top-level `useEffect` in `App.jsx`:
     ```javascript
     if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
       const tg = window.Telegram.WebApp;
       tg.ready();
       tg.expand();
       try { tg.enableClosingConfirmation(); } catch (_) {}
       try {
         if (typeof tg.disableVerticalSwipes === 'function') {
           tg.disableVerticalSwipes();
         }
       } catch (_) {}
     ```
   - When a session ends or starts, closing confirmation and swipe locking must be explicitly synchronized with the session lifecycle according to Requirement R2 and Project specifications.

6. **Z-Index Layering Hierarchy (`frontend/src/index.css`)**:
   - `.desktop-sidebar`: `z-index: 40` (line 393).
   - `.app-fab`: `z-index: 45` (line 893).
   - `.bottom-dock`: `z-index: 50` (line 938).
   - `.profile-bubble-dropdown`: `z-index: 55` (line 4547).
   - `.safari-edge-shim`: `z-index: 95` (line 294).
   - `.bottom-sheet-backdrop`: `z-index: 99` (line 1705).
   - Therefore, `BeforeLeavingActiveOverlay` must use `z-index: 100` to sit strictly above all application UI elements, shims, and bottom sheets.

---

## 2. Logic Chain

From the observations above, we establish the step-by-step reasoning for the 5-layer hard-lock mechanism:

1. **Layer 1: Navigation Concealment**
   - *Premise*: If navigation bars and tabs remain clickable or accessible, users can bypass the checklist and navigate away to Today, Groceries, Goals, or Settings (Observation 1 & 2).
   - *Deduction*:
     a. **Visual Cover**: The overlay (`.before-leaving-overlay`) must be rendered with `position: fixed; inset: 0; width: 100vw; height: 100dvh; z-index: 100; background: var(--bg-app);` (Observation 6). Being fully opaque, it visually blocks the entire viewport.
     b. **DOM Element Concealment**: When `isBeforeLeavingActive` is true, add `.before-leaving-mode-active` to `.app-shell`. CSS rules hide navigation:
        ```css
        .before-leaving-mode-active .desktop-sidebar,
        .before-leaving-mode-active .app-header,
        .before-leaving-mode-active .bottom-dock,
        .before-leaving-mode-active .app-fab {
          display: none !important;
          pointer-events: none !important;
          visibility: hidden !important;
        }
        ```
     c. **Accessibility & Assistive Tech Defense**: In `App.jsx`, apply HTML standard `inert={isBeforeLeavingActive ? '' : undefined}` and `aria-hidden={isBeforeLeavingActive}` to `.desktop-sidebar`, `.app-header`, `.main-content-viewport`, and `.bottom-dock`. This prevents keyboard focus and screen-reader access to background nodes (`[Documented]` HTML Living Standard § 6.5.3).
     d. **Programmatic Guard**: Guard `handleTabSwitch` in `App.jsx`: `if (isBeforeLeavingActive) return;` (Observation 2).

2. **Layer 2: Modal Defense**
   - *Premise*: Standard modals provide close buttons, backdrop click dismiss, and pull-to-close gestures (Observation 4). If any of these are present while `!is_all_completed`, user could accidentally dismiss the checklist.
   - *Deduction*:
     a. **Zero Close Controls**: In `BeforeLeavingActiveOverlay.jsx`, do NOT render any close button (`<X />`), back chevron, or cancel button in the header while items remain unchecked.
     b. **No Backdrop Click Dismiss**: The root container has no `onClick` handler pointing to dismissal. Clicks on overlay backgrounds or padding are non-operational.
     c. **Overscroll Containment**: Apply `overscroll-behavior: contain; touch-action: pan-y;` on the overlay and inner checklist list to suppress mobile pull-down-to-refresh or pull-down-to-dismiss gestures.
     d. **State-Locked Exit Action**: While `!is_all_completed`, show a locked progress status (`<Lock /> Отметьте все пункты для разблокировки выхода`). Only when `is_all_completed === true` does the primary exit button appear: «Завершить и выйти» calling `handleFinishSession`.

3. **Layer 3: Keyboard Trap**
   - *Premise*: Pressing `Escape` or desktop shortcuts `c`, `n`, `с`, `т` opens modals or triggers unintended state changes (Observation 3). Furthermore, `Tab` cycling without a focus trap allows users to tab out of the overlay into browser chrome or hidden background DOM.
   - *Deduction*:
     a. **Capturing Event Listener**: Register `window.addEventListener('keydown', handleOverlayKeyDown, true)` with `capture: true`.
     b. **Suppress `Escape`**: In the capturing listener, `if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }`.
     c. **Suppress Quick-Add (`c`, `n`, `с`, `т`)**: If not typing in an editable field inside the overlay: `e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();`.
     d. **Focus Trap**: For `Tab` and `Shift+Tab`, calculate focusable elements inside `overlayRef.current`. Cycle focus within overlay boundaries (last element -> first element on `Tab`; first element -> last element on `Shift+Tab`).
     e. **Defensive Guard in `App.jsx`**: In `App.jsx:326`, add `&& !isBeforeLeavingActive` to the shortcut condition as defense-in-depth.

4. **Layer 4: Browser History Trap**
   - *Premise*: Pressing browser "Back", swiping back on mobile Safari, or pressing Android hardware back emits `popstate`. If unhandled, this either exits the application or pops the navigation state.
   - *Deduction*:
     a. **Synthetic History State**: Upon mounting `BeforeLeavingActiveOverlay`, push a lock entry: `window.history.pushState({ before_leaving_lock: true }, document.title);`.
     b. **Popstate Interception & Re-push**: When `popstate` fires while `isBeforeLeavingActive` is true, immediately execute `window.history.pushState({ before_leaving_lock: true }, document.title);` and trigger haptic warning (`hapticFeedback('warning')`). This cancels the backward navigation and keeps the user on the active checklist.
     c. **Unload Warning (`beforeunload`)**: Register `window.addEventListener('beforeunload', handleBeforeUnload)` while `!is_all_completed`, prompting the native browser leave-site confirmation if the user tries to navigate away or close the tab (`[Documented]` W3C HTML § 7.7.4).
     d. **Clean Exit**: When the session is finished (`handleFinishSession`), remove the `popstate` and `beforeunload` listeners before closing the overlay.

5. **Layer 5: Telegram WebApp SDK Integration**
   - *Premise*: Telegram WebApp provides native SDK methods to prevent closing via top-right 'X' or vertical pull-down gestures (Observation 5).
   - *Deduction*:
     a. **Session Activation Hook**:
        - Call `window.Telegram?.WebApp?.enableClosingConfirmation()` (`[Documented]` Telegram Bot API 6.2+). Displays native Telegram modal if user tries to close the Mini App.
        - Call `window.Telegram?.WebApp?.disableVerticalSwipes()` (`[Documented]` Telegram Bot API 7.7+). Disables pull-down gesture closing the Mini App.
        - Call `window.Telegram?.WebApp?.BackButton?.hide()` to guarantee no native back button appears in the Telegram header.
     b. **Session Finish Hook**:
        - When all items are completed and user clicks «Завершить и выйти», call `window.Telegram?.WebApp?.disableClosingConfirmation()`.
        - Call `window.Telegram?.WebApp?.enableVerticalSwipes()`.
     c. **Defensive Guards**: All calls wrapped in `typeof === 'function'` and `try/catch` to guarantee zero crashes on desktop web, mock testing environments, or older Telegram versions.

---

## 3. Caveats

1. **Browser Force-Close / OS Kill**: No web application running in a standard browser sandbox can prevent an operating system kill (e.g. killing the Telegram app process from iOS App Switcher or closing the browser window via OS task manager).
   - *Mitigation*: Requirement R2 handles this through persistent database snapshotting. When the user reopens TaskerBot, `loadData()` calls `GET /api/before-leaving/session/active` and immediately restores the active checklist overlay, restoring the hard-lock state seamlessly.
2. **Older Telegram Client Versions (< 7.7)**: Telegram clients older than Bot API 7.7 do not support `disableVerticalSwipes()`.
   - *Mitigation*: Wrapped with defensive `typeof tg.disableVerticalSwipes === 'function'` check. CSS `overscroll-behavior: contain` and `touch-action: pan-y` provide web-level defense.
3. **Tab Focus Trap with 0 Focusable Items**: If a session somehow had 0 checklist items, the focus trap must prevent error by checking `focusable.length === 0` and focusing the root overlay (`tabIndex={-1}`).

---

## 4. Conclusion & Complete Blueprints

All 5 hard-lock layers are fully designed, mutually reinforcing, and adhere to Requirement R2. Below are the implementation blueprints for the implementing engineers.

### 4.1. Blueprint: `useNavigationLock.js` (Custom React Hook)

Location: `frontend/src/hooks/useNavigationLock.js` (or embedded directly in `BeforeLeavingActiveOverlay.jsx` / `App.jsx`):

```javascript
import { useEffect, useRef, useCallback } from 'react';
import { hapticFeedback } from '../api';

const LOCK_STATE_KEY = 'before_leaving_lock';

/**
 * useNavigationLock: Coordinates multi-layer hard-lock for Before Leaving active session.
 * 
 * Layers:
 * 1. Navigation Concealment (DOM class toggle on app shell and body)
 * 2. Modal Defense (zero dismiss events)
 * 3. Keyboard Trap (capture phase interception of Escape, c, n, and Tab focus cycling)
 * 4. Browser History Trap (pushState + popstate trapping + beforeunload)
 * 5. Telegram WebApp SDK (enableClosingConfirmation + disableVerticalSwipes)
 */
export function useNavigationLock({
  isActive,
  isAllCompleted,
  overlayRef,
}) {
  const isEngagedRef = useRef(false);

  // -------------------------------------------------------------------------
  // Layer 5: Telegram WebApp SDK Integration
  // -------------------------------------------------------------------------
  const engageTelegramLock = useCallback(() => {
    if (typeof window === 'undefined' || !window.Telegram?.WebApp) return;
    const tg = window.Telegram.WebApp;

    try {
      if (typeof tg.enableClosingConfirmation === 'function') {
        tg.enableClosingConfirmation();
      }
    } catch (_) {}

    try {
      if (typeof tg.disableVerticalSwipes === 'function') {
        tg.disableVerticalSwipes();
      }
    } catch (_) {}

    try {
      if (tg.BackButton && typeof tg.BackButton.hide === 'function') {
        tg.BackButton.hide();
      }
    } catch (_) {}
  }, []);

  const disengageTelegramLock = useCallback(() => {
    if (typeof window === 'undefined' || !window.Telegram?.WebApp) return;
    const tg = window.Telegram.WebApp;

    try {
      if (typeof tg.disableClosingConfirmation === 'function') {
        tg.disableClosingConfirmation();
      }
    } catch (_) {}

    try {
      if (typeof tg.enableVerticalSwipes === 'function') {
        tg.enableVerticalSwipes();
      }
    } catch (_) {}
  }, []);

  // -------------------------------------------------------------------------
  // Main Lock Lifecycle Effect
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isActive) {
      if (isEngagedRef.current) {
        disengageTelegramLock();
        document.body.classList.remove('before-leaving-lock-body');
        isEngagedRef.current = false;
      }
      return;
    }

    isEngagedRef.current = true;
    engageTelegramLock();
    document.body.classList.add('before-leaving-lock-body');

    // -----------------------------------------------------------------------
    // Layer 4: Browser History Trap (pushState + popstate + beforeunload)
    // -----------------------------------------------------------------------
    try {
      window.history.pushState({ [LOCK_STATE_KEY]: true, ts: Date.now() }, document.title);
    } catch (_) {}

    const handlePopState = (e) => {
      // Re-push state immediately to neutralize the Back action
      try {
        window.history.pushState({ [LOCK_STATE_KEY]: true, ts: Date.now() }, document.title);
      } catch (_) {}
      hapticFeedback('warning');
    };

    const handleBeforeUnload = (e) => {
      if (!isAllCompleted) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // -----------------------------------------------------------------------
    // Layer 3: Keyboard Trap (capturing listener)
    // -----------------------------------------------------------------------
    const handleCaptureKeyDown = (e) => {
      const key = e.key;
      const lowerKey = key.toLowerCase();

      // Intercept Escape
      if (key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        hapticFeedback('warning');
        return;
      }

      // Intercept desktop shortcuts (c, n, cyrillic с, т)
      if (['c', 'n', 'с', 'т'].includes(lowerKey)) {
        const target = e.target;
        const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (!isInput) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
      }

      // Focus Trapping within overlay container
      if (key === 'Tab' && overlayRef?.current) {
        const focusable = overlayRef.current.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first || !overlayRef.current.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last || !overlayRef.current.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        } else {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleCaptureKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleCaptureKeyDown, true);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.body.classList.remove('before-leaving-lock-body');
      disengageTelegramLock();
      isEngagedRef.current = false;
    };
  }, [isActive, isAllCompleted, overlayRef, engageTelegramLock, disengageTelegramLock]);
}
```

---

### 4.2. Blueprint: `frontend/src/App.jsx` Updates

Key code modifications in `App.jsx`:

1. **Tab Switch Guard** (around line 508):
   ```javascript
   const handleTabSwitch = (tab) => {
     if (isBeforeLeavingActive) {
       console.warn('[NavigationLock] Tab switch ignored while Before Leaving session is active.');
       return;
     }
     hapticFeedback('selection');
     setActiveTab(tab);
     setTabSwitchTrigger((prev) => prev + 1);
     if (Date.now() - lastFetchedRef.current > 4000) {
       loadData(false, true);
     }
   };
   ```

2. **Keyboard Shortcut Guard** (around line 326):
   ```javascript
   if (!isInput && !isQuickAddOpen && !isBeforeLeavingActive) {
     e.preventDefault();
     setQuickAddOptions({
       initialCategory: activeTab === 'groceries' ? 'grocery' : activeTab === 'goals' ? 'goal' : 'one_time',
     });
     setIsQuickAddOpen(true);
   }
   ```

3. **App Shell Root Class & Inert Attributes** (around line 649):
   ```jsx
   <div className={`app-shell ${isBeforeLeavingActive ? 'before-leaving-mode-active' : ''}`}>
     {/* Desktop Sidebar */}
     <aside
       className="desktop-sidebar"
       inert={isBeforeLeavingActive ? '' : undefined}
       aria-hidden={isBeforeLeavingActive ? 'true' : undefined}
     >
       ...
     </aside>

     {/* Main Content Area */}
     <div
       className="app-main-wrapper"
       inert={isBeforeLeavingActive ? '' : undefined}
       aria-hidden={isBeforeLeavingActive ? 'true' : undefined}
     >
       <header className="app-header">...</header>
       <main className="main-content-viewport">...</main>
       <nav className="bottom-dock mobile-only-dock">...</nav>
     </div>

     {/* Before Leaving Active Overlay Component */}
     {isBeforeLeavingActive && activeBeforeLeavingSession && (
       <BeforeLeavingActiveOverlay
         session={activeBeforeLeavingSession}
         onToggleItem={handleToggleBeforeLeavingItem}
         onFinishSession={handleFinishBeforeLeavingSession}
       />
     )}
   </div>
   ```

4. **Finish Session Handler in `App.jsx`**:
   ```javascript
   const handleFinishBeforeLeavingSession = useCallback(async () => {
     hapticFeedback('success');
     const res = await finishBeforeLeavingSession();
     if (res) {
       setIsBeforeLeavingActive(false);
       setActiveBeforeLeavingSession(null);
       loadData(true);
     }
   }, []);
   ```

---

### 4.3. Blueprint: `BeforeLeavingActiveOverlay.jsx` Architecture

```jsx
import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DoorOpen, Check, Lock, Sparkles } from 'lucide-react';
import AnimatedCheckbox from './ui/AnimatedCheckbox';
import { useNavigationLock } from '../hooks/useNavigationLock';

export default function BeforeLeavingActiveOverlay({
  session,
  onToggleItem,
  onFinishSession,
  isFinishing = false,
}) {
  const overlayRef = useRef(null);
  const items = session?.items || [];
  const completedCount = session?.completed_count ?? items.filter((i) => i.is_checked).length;
  const totalCount = session?.total_count ?? items.length;
  const isAllCompleted = session?.is_all_completed ?? (totalCount > 0 && completedCount === totalCount);
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Multi-layer hard lock activation
  useNavigationLock({
    isActive: true,
    isAllCompleted,
    overlayRef,
  });

  // Focus trap initiation on mount
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.focus();
    }
  }, []);

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="before-leaving-overlay"
      role="region"
      aria-modal="true"
      aria-label="Режим «Перед выходом»: блокирующий чеклист"
    >
      {/* Top Header with title and progress bar (NO close button) */}
      <header className="before-leaving-header">
        <div className="before-leaving-header-top">
          <div className="before-leaving-title-group">
            <DoorOpen size={22} className="before-leaving-title-icon" />
            <h1 className="before-leaving-title">Перед выходом</h1>
          </div>
          <div className="before-leaving-counter" aria-live="polite">
            <span className="before-leaving-counter-current">{completedCount}</span>
            <span className="before-leaving-counter-divider">/</span>
            <span className="before-leaving-counter-total">{totalCount}</span>
          </div>
        </div>

        {/* Animated Progress Bar */}
        <div className="before-leaving-progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
          <motion.div
            className="before-leaving-progress-fill"
            initial={false}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </header>

      {/* Scrollable Checklist Items */}
      <div className="before-leaving-list-container">
        <div className="before-leaving-list" role="list">
          {items.map((item) => (
            <motion.div
              key={item.id}
              className={`before-leaving-check-row ${item.is_checked ? 'is-checked' : ''}`}
              role="listitem"
              onClick={() => onToggleItem(item.id)}
              whileTap={{ scale: 0.985 }}
            >
              <AnimatedCheckbox
                checked={item.is_checked}
                onChange={() => onToggleItem(item.id)}
                size={22}
                ariaLabel={`Отметить пункт: ${item.title}`}
              />
              <span className="before-leaving-check-title">{item.title}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Bottom Sticky Action Footer */}
      <footer className="before-leaving-footer">
        <AnimatePresence mode="wait">
          {!isAllCompleted ? (
            <motion.div
              key="locked-status"
              className="before-leaving-lock-badge"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <Lock size={16} />
              <span>Отметьте все пункты для разблокировки выхода</span>
            </motion.div>
          ) : (
            <motion.div
              key="unlocked-action"
              className="before-leaving-unlocked-box"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            >
              <div className="before-leaving-celebration-hint">
                <Sparkles size={16} color="var(--accent-primary)" />
                <span>Все вещи проверены! Можно выходить.</span>
              </div>
              <button
                type="button"
                className="before-leaving-finish-btn"
                onClick={onFinishSession}
                disabled={isFinishing}
                aria-label="Завершить и выйти из режима"
              >
                <Check size={18} strokeWidth={2.4} />
                <span>{isFinishing ? 'Завершение...' : 'Завершить и выйти'}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </div>
  );
}
```

---

### 4.4. Blueprint: `frontend/src/index.css` Rules

```css
/* =========================================================================
   Milestone 3: Navigation Hard-Lock & Fullscreen Overlay Styling
   ========================================================================= */

/* Prevent document body scroll and gesture chaining when overlay is active */
body.before-leaving-lock-body {
  overflow: hidden !important;
  overscroll-behavior: contain !important;
  touch-action: none;
}

/* Hard concealment of desktop sidebar, header, mobile dock, and FAB */
.before-leaving-mode-active .desktop-sidebar,
.before-leaving-mode-active .app-header,
.before-leaving-mode-active .bottom-dock,
.before-leaving-mode-active .app-fab {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

.before-leaving-mode-active .main-content-viewport {
  overflow: hidden !important;
  pointer-events: none !important;
}

/* Fullscreen Blocking Overlay */
.before-leaving-overlay {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  z-index: 100; /* Stits above shims (95), bottom sheets (99) */
  background: var(--bg-app);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overscroll-behavior: contain;
  touch-action: pan-y;
  outline: none;
  padding-top: max(16px, env(safe-area-inset-top, 16px));
  padding-bottom: max(20px, env(safe-area-inset-bottom, 20px));
}

.before-leaving-header {
  padding: 12px 20px;
  background: var(--bg-app);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.before-leaving-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.before-leaving-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.before-leaving-title-icon {
  color: var(--accent-primary, #6366f1);
}

.before-leaving-title {
  margin: 0;
  font-size: var(--font-header, 20px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.before-leaving-counter {
  font-size: var(--font-subtext, 14px);
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-card);
  padding: 4px 10px;
  border-radius: var(--radius-full, 9999px);
  border: 1px solid var(--border-subtle);
}

.before-leaving-progress-track {
  width: 100%;
  height: 6px;
  background: var(--border-subtle);
  border-radius: 999px;
  overflow: hidden;
}

.before-leaving-progress-fill {
  height: 100%;
  background: var(--accent-primary, #6366f1);
  border-radius: 999px;
}

.before-leaving-list-container {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 16px 20px;
}

.before-leaving-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 600px;
  margin: 0 auto;
}

.before-leaving-check-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md, 12px);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.before-leaving-check-row:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-hover);
}

.before-leaving-check-row.is-checked {
  background: var(--bg-card-dim, rgba(255, 255, 255, 0.02));
  border-color: var(--border-subtle);
}

.before-leaving-check-title {
  font-size: var(--font-body, 16px);
  color: var(--text-primary);
  font-weight: 500;
  word-break: break-word;
  transition: opacity 0.2s ease, text-decoration 0.2s ease;
}

.before-leaving-check-row.is-checked .before-leaving-check-title {
  text-decoration: line-through;
  opacity: 0.5;
  color: var(--text-secondary);
}

.before-leaving-footer {
  padding: 14px 20px;
  background: var(--bg-app);
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

.before-leaving-lock-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: var(--font-subtext, 14px);
  padding: 8px 14px;
}

.before-leaving-unlocked-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 480px;
}

.before-leaving-celebration-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-subtext, 14px);
  font-weight: 600;
  color: var(--text-primary);
}

.before-leaving-finish-btn {
  width: 100%;
  height: 48px;
  background: var(--accent-primary, #6366f1);
  color: #ffffff;
  border: none;
  border-radius: var(--radius-md, 12px);
  font-size: var(--font-body, 16px);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.1s ease;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
}

.before-leaving-finish-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.before-leaving-finish-btn:active:not(:disabled) {
  transform: scale(0.98);
}
```

---

## 5. Verification Method

To independently verify the multi-layer hard-lock implementation:

1. **Test Environment Execution**:
   - Backend verification:
     ```bash
     ./.venv/bin/pytest tests/test_before_leaving_backend.py
     ```
   - Frontend regression verification:
     ```bash
     node --experimental-vm-modules --test tests/test_frontend_m2_challenge.mjs
     node --experimental-vm-modules --test tests/test_profile_bubble_event_coordination.mjs
     ```

2. **Automated Lock Challenger Test Suite (`tests/test_before_leaving_navigation_lock.mjs`)**:
   Implement automated Node tests with simulated DOM verifying:
   - **Test 1: Tab Navigation Suppression**: Invoking `handleTabSwitch('groceries')` while `isBeforeLeavingActive === true` does not update `activeTab`.
   - **Test 2: Keyboard Shortcut Interception**: Dispatching `Escape`, `c`, `n`, `с`, `т` with `capture: true` calls `e.preventDefault()`, `e.stopPropagation()`, and does not toggle quick-add modal.
   - **Test 3: Browser History Trap**: Dispatching `popstate` on `window` while incomplete executes `window.history.pushState` to re-push the lock state.
   - **Test 4: Telegram WebApp SDK Calls**: Mocking `window.Telegram.WebApp` verifies `enableClosingConfirmation()` and `disableVerticalSwipes()` are called upon session activation, and `disableClosingConfirmation()` and `enableVerticalSwipes()` are called upon finish.
   - **Test 5: Absence of Close Buttons**: Inactive session contains 0 close or cancel buttons while `is_all_completed === false`.

3. **Invalidation Conditions**:
   - The solution is invalidated if pressing `Escape` closes the overlay before all checkboxes are checked.
   - The solution is invalidated if clicking a dock or sidebar tab navigates away from the active checklist.
   - The solution is invalidated if Telegram vertical pull-down dismisses the Mini App while the session is active.
