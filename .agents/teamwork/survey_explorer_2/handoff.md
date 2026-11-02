# Handoff Report: Frontend Architecture & Implementation Design for "Before Leaving" («Перед выходом»)

## 1. Observation

### 1.1 Existing Frontend Stack, Dependencies & Build Verification
1. **Dependencies & Frameworks (`frontend/package.json`)**:
   - `frontend/package.json:12-19`: Application runs on React 19.3.1 (`react`, `react-dom`), `motion` 14.6.0 (`motion/react`), `lucide-react` 1.61.0, and Vite 8.3.4.
   - `frontend/package.json:6-11`: Build command `vite build`, linter `oxlint`.
   - Tool execution: `cd frontend && npm run build` exited with code 0 in 272ms. `cd frontend && npm run lint` executed in 119ms with 0 errors.
   - Note: Tailwind CSS is **not** installed; styles are written in a hand-crafted CSS custom properties architecture across `frontend/src/index.css` (4,507 lines) and `frontend/src/App.css`.

2. **Root Layout, State & Navigation Architecture (`frontend/src/App.jsx`)**:
   - `App.jsx:89-134`: Root component `App()` manages top-level states: `activeTab` (`'today' | 'groceries' | 'goals' | 'settings'`), `dashboardData`, `goalsData`, `groceriesData`, `isSyncing`, `isLoading`, and `isQuickAddOpen`.
   - `App.jsx:470-478`: `handleTabSwitch(tab)` performs tab transitions with `hapticFeedback('selection')` and sets `activeTab`.
   - `App.jsx:810-881`: Main viewport renders tabs inside `<AnimatePresence mode="wait">` with `<motion.div>` page transitions (`opacity`, `y: 8 -> 0`).
   - `App.jsx:292-309`: Global keyboard event listener on `window` traps keys `c`, `n`, `с`, `т` to open `QuickAddModal`.
   - `App.jsx:978-996`: Modals are rendered as overlays conditionally at the bottom of the root tree inside `<AnimatePresence>`.

3. **Breakpoints, Responsive Hierarchy & Profile Bubble Placements (`frontend/src/App.jsx`, `frontend/src/index.css`)**:
   - Mobile breakpoint (`< 768px`, `index.css:3052-3075`):
     - Desktop sidebar is suppressed (`.desktop-sidebar { display: none !important; }`).
     - Mobile sticky header is visible (`App.jsx:764-807`, `.app-header { position: sticky; top: 0; z-index: 40; display: flex; align-items: center; justify-content: center; gap: 8px; }`).
     - Bottom dock is visible (`App.jsx:905-974`, `.bottom-dock.mobile-only-dock { position: fixed; bottom: 0; z-index: 40; }`).
     - Floating Action Button is visible (`App.jsx:884-902`, `.app-fab.mobile-only-fab`).
     - Mobile profile bubble (`App.jsx:765-795`): Rendered directly inside `.app-header`.
   - Desktop / Tablet breakpoint (`>= 768px`, `index.css:3098-3120`, `index.css:3429-3432`):
     - Mobile sticky header is strictly suppressed (`.app-header { display: none !important; }`).
     - Mobile bottom dock and FAB are suppressed (`display: none !important;`).
     - Desktop sidebar is active (`App.jsx:613-759`, `.desktop-sidebar { width: 260px; height: 100vh; position: sticky; top: 0; }`).
     - Desktop profile bubble (`App.jsx:616-646`): Rendered inside `.desktop-sidebar > .sidebar-top-bar` with flex row layout (`display: flex; align-items: center; justify-content: space-between; gap: 8px;`).
   - Profile Bubble click behavior (`App.jsx:619`, `App.jsx:768`): Currently both desktop and mobile bubbles attach `onClick={handlePillRefresh}`. There is currently no dropdown or context menu attached to the profile bubble.

4. **Telegram WebApp SDK & Platform / iOS Detection (`frontend/src/App.jsx`, `frontend/src/api.js`, `frontend/src/theme.js`)**:
   - `api.js:1-12`: `isInsideTelegram()` validates `window.Telegram?.WebApp.initData`, `initDataUnsafe?.user`, or hash parameter `#tgWebAppData`.
   - `App.jsx:235-246`: iOS detection checks:
     ```javascript
     const isIOS =
       tg.platform === 'ios' ||
       /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
     ```
     Sets `.is-ios` class on `document.documentElement` and `document.body`.
   - Telegram WebApp platform property: `window.Telegram.WebApp.platform` yields `'ios'`, `'android'`, `'tdesktop'`, `'macos'`, `'web'`, `'weba'`, or `'unknown'`.
   - Safe Area Inset Handling on iOS in Telegram (`index.css:435-442`):
     ```css
     body.is-tg-fullscreen.is-ios .app-header,
     html.is-tg-fullscreen.is-ios .app-header {
       padding-top: calc(max(var(--tg-raw-safe-top, 0px), env(safe-area-inset-top, 0px)) + 4px) !important;
       padding-bottom: 6px !important;
       padding-left: max(calc(16px + var(--safe-left)), 76px) !important;
       padding-right: max(calc(12px + var(--safe-right)), 76px) !important;
       justify-content: center !important;
     }
     ```
     Observation: On iOS inside Telegram Mini App fullscreen mode, Telegram places native client navigation / close buttons at top-left and top-right, enforcing a 76px horizontal inset and centering the header.

5. **Existing Modal & Interactive Checkbox Mechanics (`QuickAddModal.jsx`, `AnimatedCheckbox.jsx`)**:
   - `QuickAddModal.jsx:1796-1814`: Uses `<motion.div className="sheet-backdrop">` (`position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(8px); z-index: 99;`) wrapping `<motion.div className="bottom-sheet-content">`.
   - `components/ui/AnimatedCheckbox.jsx:8-80`: Self-contained interactive checkbox accepting `checked`, `onChange`, `size`, `disabled`. Contains SVG path spring length animation (`pathLength: checked ? 1 : 0`, stiffness 420, damping 30).

6. **API Client & Mutation Pattern (`frontend/src/api.js`)**:
   - `api.js:1445-1473`: API queries pass `telegram_id=${effectiveUserId}` and handle network failures with local database fallbacks (`getLocalDb()`).
   - `api.js:21-29`: `hapticFeedback(type)` dispatches native Telegram haptic feedback (`window.Telegram.WebApp.HapticFeedback.impactOccurred` / `notificationOccurred`).
   - Reconcile and pending mutation queues (`api.js:35-42`, `api.js:355-365`) enable zero-latency optimistic UI updates.

7. **Backend Endpoint Contracts Alignment (`.agents/teamwork/survey_explorer_1/handoff.md:271-286`)**:
   - Template items CRUD:
     - `GET /api/before-leaving/items` -> `List[BeforeLeavingItemRead]`
     - `POST /api/before-leaving/items` -> `BeforeLeavingItemRead` (`title: str`, `order: Optional[int]`)
     - `PATCH /api/before-leaving/items/{item_id}` -> `BeforeLeavingItemRead` (`title: Optional[str]`, `order: Optional[int]`)
     - `DELETE /api/before-leaving/items/{item_id}` -> `{"status": "deleted"}`
     - `PUT /api/before-leaving/items/reorder` -> `List[BeforeLeavingItemRead]` (`item_ids: List[int]`)
   - Active session lifecycle:
     - `GET /api/before-leaving/session/active` -> `Optional[BeforeLeavingSessionRead]`
     - `POST /api/before-leaving/session/start` -> `BeforeLeavingSessionRead` (`reset: bool = False`)
     - `PATCH /api/before-leaving/session/items/{item_id}/toggle` -> `BeforeLeavingSessionRead` (`is_checked: Optional[bool]`)
     - `POST /api/before-leaving/session/finish` -> `BeforeLeavingSessionRead` (validates `completed_count == total_count`)

---

## 2. Logic Chain

### 2.1 Mapping Requirements to Frontend Architecture

#### R1: Template Configuration Interface
- **Observation**: `ORIGINAL_REQUEST.md:12-13, 23-25` requires an interface (modal or screen) to configure the checklist template (add, edit, delete, reorder items) with persistent backend synchronization.
- **Logic**:
  1. Creating a dedicated modal component `BeforeLeavingConfigModal.jsx` following the established `.sheet-backdrop` and `.bottom-sheet-content` patterns allows triggering template editing from both the profile bubble context menu and the Settings tab without disrupting current page context.
  2. The configuration modal must support:
     - Input field with automatic capitalization (`capitalizeFirst`) and keyboard submission for adding items.
     - Inline text editing or edit button for renaming existing items.
     - Trash icon for deletion with optimistic removal from local state.
     - Reordering controls (up/down order controls or drag handles) sending `PUT /api/before-leaving/items/reorder`.
  3. The API client in `frontend/src/api.js` must implement caching (`tasker_cache_before_leaving_template_${userId}`) and offline/demo fallback in `localStorage` matching existing routines and grocery paradigms.

#### R2: Active "Before Leaving" Mode & Complete Navigation Lock
- **Observation**: `ORIGINAL_REQUEST.md:15-17, 28-31` mandates:
  - Full-screen blocking interface overlay.
  - Complete navigation lock (prevent dismissal, tab switching, or exit until ALL items are checked).
  - Checkbox interaction with backend synchronization.
  - Unlock upon complete checklist execution.
- **Logic**:
  1. **Full-screen blocking viewport**:
     - `BeforeLeavingActiveOverlay.jsx` must mount directly at the top level of `App.jsx` with CSS:
       `position: fixed; inset: 0; z-index: 100; width: 100vw; height: 100dvh; background: var(--bg-app); overscroll-behavior: contain;`.
     - `z-index: 100` sits strictly above `.app-header` (`z-index: 40`), `.bottom-dock` (`z-index: 40`), `.app-fab` (`z-index: 45`), and `sheet-backdrop` (`z-index: 99`).
  2. **Total Navigation & Exit Locking Mechanism (Multi-Layer Enforcement)**:
     - **Visual Dismissal Prevention**: No close (`X`) button is rendered while any item remains unchecked. Backdrop clicking has no dismiss handler (`e.stopPropagation()`).
     - **Tab Switching & Navigation Concealment**: Because the overlay covers `100vw` by `100dvh` at `z-index: 100`, bottom navigation dock and desktop sidebar are completely invisible and pointer-inaccessible.
     - **Keyboard Trapping**: Global keyboard shortcuts in `App.jsx:294-309` (`c`, `n`, `с`, `т`) and `Escape` must be intercepted and suppressed while the active mode is engaged.
     - **Telegram WebApp SDK Native Trapping**:
       - Invoke `window.Telegram.WebApp.enableClosingConfirmation()` to trigger Telegram native prompt if user attempts to pull down or swipe away the Mini App.
       - Invoke `window.Telegram.WebApp.disableVerticalSwipes()` to lock swipe-to-dismiss behavior.
       - Ensure `window.Telegram.WebApp.BackButton.hide()` is called during incomplete state, or if shown, its `onClick` displays an alert notification ("Выполните все пункты для выхода").
     - **Browser History & Hardware Back Button Trapping**:
       - On mount, call `window.history.pushState({ beforeLeavingLock: true }, '')`.
       - On `popstate` event: if checklist is incomplete, re-push state `window.history.pushState({ beforeLeavingLock: true }, '')` and trigger warning haptic.
  3. **Checkbox Interaction & State Sync**:
     - Each item uses `AnimatedCheckbox`.
     - Clicking a checkbox calls `toggleBeforeLeavingCheckItem(item.id, !item.is_checked)` with immediate optimistic React state toggle.
     - Header displays progress indicator (e.g., "3 из 5 выполнено" with animated progress bar).
  4. **Unlock & Finish Lifecycle**:
     - When `is_all_completed` evaluates to `true`:
       - Status badge changes from locked icon to unlocked checkmark.
       - Primary action button "Завершить и выйти" (`Finish & Exit`) renders with a celebratory spring animation.
       - Clicking finish invokes `finishBeforeLeavingSession()`, which triggers Telegram haptic `success`, mascots `done` mood, closes the overlay, and restores normal app navigation.
  5. **Persistence Across Reloads**:
     - In `App.jsx:loadData`, call `fetchActiveBeforeLeavingSession()`. If an active session exists in the database, `isBeforeLeavingActive` is automatically set to `true`, preventing bypass via browser refresh.

#### R3: Adaptive Button Placement & Profile Bubble Context Menu
- **Observation**: `ORIGINAL_REQUEST.md:18-19, 33-35` requires:
  - On Telegram WebApp iOS: Button is located inside the profile bubble context menu.
  - On all other devices and breakpoints: Button is located on the same horizontal level (line) as the profile bubble.
- **Logic**:
  1. **Strict Platform Determination**:
     ```javascript
     export const isTelegramIos = () => {
       if (typeof window === 'undefined') return false;
       const tg = window.Telegram?.WebApp;
       if (!tg) return false;
       const isInside = Boolean(
         (tg.initData && tg.initData.length > 0) ||
         tg.initDataUnsafe?.user ||
         (tg.platform && tg.platform !== 'unknown') ||
         (window.location.hash && window.location.hash.includes('tgWebAppData'))
       );
       if (!isInside) return false;
       return tg.platform === 'ios' ||
         /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
     };
     ```
  2. **Telegram iOS Context Menu Implementation**:
     - Header space on Telegram iOS is constrained by 76px safe area margins (`index.css:439-440`).
     - A floating popover context menu `ProfileBubbleContextMenu.jsx` attaches to the profile bubble.
     - Trigger: Click/tap or `contextmenu` (long-press).
     - Menu contents:
       1. 🚪 **«Перед выходом»** — launches active mode (`handleStartBeforeLeaving`).
       2. ⚙️ **«Настройка чеклиста»** — opens template config modal (`setIsConfigModalOpen(true)`).
       3. 🔄 **«Обновить данные»** — executes `handlePillRefresh`.
  3. **Other Devices & Breakpoints (Same Horizontal Level Placement)**:
     - **Mobile (< 768px, non-Telegram-iOS e.g. Android or Mobile Safari/Chrome)**:
       Rendered directly inside `<header className="app-header">` alongside `<button className="header-profile-bubble">`.
       `.app-header` flex row container (`display: flex; align-items: center; justify-content: center; gap: 8px;`) places both buttons on the exact same horizontal baseline.
     - **Desktop / Tablet (>= 768px, all platforms)**:
       Rendered directly inside `<div className="sidebar-top-bar">` alongside `<button className="header-profile-bubble">`.
       `.sidebar-top-bar` flex row container (`display: flex; align-items: center; justify-content: space-between; gap: 8px;`) places both buttons on the exact same horizontal level.

---

## 3. Concrete Frontend Component & Code Architecture

### 3.1 API Client Extensions (`frontend/src/api.js`)

[Documented] New functions to be added to `frontend/src/api.js`:

```javascript
// --- Before Leaving API Client ---

export const fetchBeforeLeavingTemplate = async () => {
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/before-leaving/items?telegram_id=${effectiveUserId}`);
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem(`tasker_cache_before_leaving_tpl_${effectiveUserId}`, JSON.stringify(data));
      return data;
    }
  } catch (e) {}

  try {
    const cached = localStorage.getItem(`tasker_cache_before_leaving_tpl_${effectiveUserId}`);
    if (cached) return JSON.parse(cached);
  } catch (e) {}

  return [];
};

export const createBeforeLeavingItem = async (title, order = 0) => {
  hapticFeedback('light');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/before-leaving/items?telegram_id=${effectiveUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, order }),
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return { id: Date.now(), user_id: effectiveUserId, title, order, created_at: new Date().toISOString() };
};

export const updateBeforeLeavingItem = async (itemId, title, order) => {
  hapticFeedback('light');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/before-leaving/items/${itemId}?telegram_id=${effectiveUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, order }),
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return null;
};

export const deleteBeforeLeavingItem = async (itemId) => {
  hapticFeedback('medium');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/before-leaving/items/${itemId}?telegram_id=${effectiveUserId}`, {
      method: 'DELETE',
    });
    if (res.ok) return true;
  } catch (e) {}
  return false;
};

export const reorderBeforeLeavingItems = async (itemIds) => {
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/before-leaving/items/reorder?telegram_id=${effectiveUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_ids: itemIds }),
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return null;
};

export const fetchActiveBeforeLeavingSession = async () => {
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/before-leaving/session/active?telegram_id=${effectiveUserId}`);
    if (res.ok) {
      const data = await res.json();
      return data; // null or session object
    }
  } catch (e) {}
  return null;
};

export const startBeforeLeavingSession = async (reset = false) => {
  hapticFeedback('medium');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/before-leaving/session/start?telegram_id=${effectiveUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset }),
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return null;
};

export const toggleBeforeLeavingCheckItem = async (itemId, isChecked) => {
  hapticFeedback('selection');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/before-leaving/session/items/${itemId}/toggle?telegram_id=${effectiveUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_checked: isChecked }),
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return null;
};

export const finishBeforeLeavingSession = async () => {
  hapticFeedback('success');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/before-leaving/session/finish?telegram_id=${effectiveUserId}`, {
      method: 'POST',
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return null;
};
```

---

### 3.2 Platform Detection Utility (`frontend/src/utils/platform.js` or `api.js`)

[Documented] Strict iOS inside Telegram WebApp detection:

```javascript
export const isTelegramIos = () => {
  if (typeof window === 'undefined') return false;
  const tg = window.Telegram?.WebApp;
  if (!tg) return false;
  const isInside = Boolean(
    (tg.initData && tg.initData.length > 0) ||
    tg.initDataUnsafe?.user ||
    (tg.platform && tg.platform !== 'unknown') ||
    (window.location.hash && window.location.hash.includes('tgWebAppData'))
  );
  if (!isInside) return false;
  return tg.platform === 'ios' ||
    /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};
```

---

### 3.3 Profile Bubble Context Menu Component (`ProfileBubbleContextMenu.jsx`)

[Documented] Context menu anchored to profile bubble on Telegram iOS:

```jsx
import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DoorOpen, Settings2, RotateCw } from 'lucide-react';
import { hapticFeedback } from '../api';

export default function ProfileBubbleContextMenu({
  isOpen,
  onClose,
  onStartBeforeLeaving,
  onOpenConfig,
  onRefresh,
  isSyncing,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          className="profile-bubble-dropdown"
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          role="menu"
        >
          <button
            type="button"
            className="profile-dropdown-item profile-dropdown-item-primary"
            onClick={() => {
              hapticFeedback('medium');
              onClose();
              onStartBeforeLeaving();
            }}
          >
            <DoorOpen size={16} />
            <span>Перед выходом</span>
          </button>

          <button
            type="button"
            className="profile-dropdown-item"
            onClick={() => {
              hapticFeedback('selection');
              onClose();
              onOpenConfig();
            }}
          >
            <Settings2 size={16} />
            <span>Настройка чеклиста</span>
          </button>

          <div className="profile-dropdown-divider" />

          <button
            type="button"
            className="profile-dropdown-item"
            disabled={isSyncing}
            onClick={() => {
              onClose();
              onRefresh();
            }}
          >
            <RotateCw size={16} className={isSyncing ? 'spin-sync-icon' : ''} />
            <span>{isSyncing ? 'Синхронизация...' : 'Обновить данные'}</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

---

### 3.4 Template Configuration Modal (`BeforeLeavingConfigModal.jsx` — R1)

[Documented] Full configuration modal supporting add, edit, delete, and reorder:

```jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, GripVertical, Check, DoorOpen, ListChecks } from 'lucide-react';
import {
  fetchBeforeLeavingTemplate,
  createBeforeLeavingItem,
  updateBeforeLeavingItem,
  deleteBeforeLeavingItem,
  reorderBeforeLeavingItems,
  hapticFeedback,
  capitalizeFirst,
} from '../api';

export default function BeforeLeavingConfigModal({ isOpen, onClose }) {
  const [items, setItems] = useState([]);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchBeforeLeavingTemplate().then((data) => {
      setItems(data || []);
      setLoading(false);
    });
  }, [isOpen]);

  const handleAddItem = async (e) => {
    e.preventDefault();
    const clean = capitalizeFirst(newItemTitle.trim());
    if (!clean) return;
    setNewItemTitle('');
    const tempItem = { id: Date.now(), title: clean, order: items.length };
    setItems((prev) => [...prev, tempItem]);
    const created = await createBeforeLeavingItem(clean, items.length);
    if (created) {
      setItems((prev) => prev.map((item) => (item.id === tempItem.id ? created : item)));
    }
  };

  const handleDeleteItem = async (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    await deleteBeforeLeavingItem(id);
  };

  const handleMove = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    hapticFeedback('selection');
    const updated = [...items];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setItems(updated);
    await reorderBeforeLeavingItems(updated.map((item) => item.id));
  };

  const handleSaveEdit = async (id) => {
    const clean = capitalizeFirst(editTitle.trim());
    if (!clean) return;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, title: clean } : item)));
    setEditingId(null);
    await updateBeforeLeavingItem(id, clean);
  };

  if (!isOpen) return null;

  return (
    <motion.div
      className="sheet-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className="bottom-sheet-content before-leaving-config-sheet"
        initial={{ y: '100%', opacity: 0.8 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.8 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      >
        <div className="sheet-handle-bar" />
        <div className="sheet-header-row" style={{ pointerEvents: 'auto' }}>
          <div className="sheet-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DoorOpen size={18} />
            <span>Шаблон «Перед выходом»</span>
          </div>
          <button type="button" className="sheet-close-btn" onClick={onClose} aria-label="Закрыть">
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        <div className="before-leaving-config-body">
          <p className="before-leaving-hint">
            Сформируйте список вещей и проверок (ключи, документы, выключить плиту), который будет блокировать интерфейс перед выходом из дома.
          </p>

          <form onSubmit={handleAddItem} className="before-leaving-add-form">
            <input
              type="text"
              className="before-leaving-input"
              placeholder="Добавить пункт (например, «Ключи»)..."
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
            />
            <button
              type="submit"
              className="before-leaving-add-btn"
              disabled={!newItemTitle.trim()}
              aria-label="Добавить"
            >
              <Plus size={18} />
            </button>
          </form>

          <div className="before-leaving-items-list">
            {items.length === 0 && !loading && (
              <div className="before-leaving-empty">
                <ListChecks size={36} color="var(--text-tertiary)" />
                <span>Список пуст. Добавьте первый пункт выше.</span>
              </div>
            )}
            {items.map((item, index) => (
              <div key={item.id} className="before-leaving-item-row">
                <div className="before-leaving-item-reorder">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMove(index, -1)}
                    aria-label="Переместить выше"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={index === items.length - 1}
                    onClick={() => handleMove(index, 1)}
                    aria-label="Переместить ниже"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>

                <div className="before-leaving-item-content">
                  {editingId === item.id ? (
                    <input
                      type="text"
                      className="before-leaving-inline-edit"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleSaveEdit(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(item.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="before-leaving-item-title"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditTitle(item.title);
                      }}
                    >
                      {item.title}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className="before-leaving-item-delete"
                  onClick={() => handleDeleteItem(item.id)}
                  aria-label="Удалить"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
```

---

### 3.5 Active Blocking Mode Overlay (`BeforeLeavingActiveOverlay.jsx` — R2)

[Documented] Fullscreen blocking screen with strict navigation lock and backend sync:

```jsx
import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Lock, Unlock, CheckCircle2, AlertTriangle, Sparkles, DoorOpen } from 'lucide-react';
import AnimatedCheckbox from './ui/AnimatedCheckbox';
import Mascot from './Mascot';
import {
  toggleBeforeLeavingCheckItem,
  finishBeforeLeavingSession,
  hapticFeedback,
} from '../api';

export default function BeforeLeavingActiveOverlay({
  session,
  onSessionUpdated,
  onFinishSession,
}) {
  const [items, setItems] = useState(session?.items || []);
  const [isFinishing, setIsFinishing] = useState(false);
  const [lockShake, setLockShake] = useState(0);

  useEffect(() => {
    setItems(session?.items || []);
  }, [session]);

  const totalCount = items.length;
  const completedCount = items.filter((i) => i.is_checked).length;
  const isAllCompleted = totalCount > 0 && completedCount === totalCount;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // --- Strict Navigation Hard-Lock ---
  useEffect(() => {
    // 1. Prevent vertical swipe-down & enable closing confirmation in Telegram
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      try {
        tg.enableClosingConfirmation();
      } catch (_) {}
      try {
        if (typeof tg.disableVerticalSwipes === 'function') {
          tg.disableVerticalSwipes();
        }
      } catch (_) {}
      try {
        tg.BackButton.hide();
      } catch (_) {}
    }

    // 2. Lock body scroll
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 3. Hardware / Browser Back button trap (popstate)
    const handlePopState = (e) => {
      if (!isAllCompleted) {
        window.history.pushState({ beforeLeavingLock: true }, '');
        hapticFeedback('error');
        setLockShake((prev) => prev + 1);
      }
    };
    window.history.pushState({ beforeLeavingLock: true }, '');
    window.addEventListener('popstate', handlePopState);

    // 4. Trap Escape and keyboard navigation
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!isAllCompleted) {
          hapticFeedback('error');
          setLockShake((prev) => prev + 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.body.style.overflow = origOverflow;
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isAllCompleted]);

  const handleToggle = async (itemId, currentChecked) => {
    const nextChecked = !currentChecked;
    hapticFeedback('medium');

    // Optimistic local update
    const updated = items.map((item) =>
      item.id === itemId ? { ...item, is_checked: nextChecked } : item
    );
    setItems(updated);

    const res = await toggleBeforeLeavingCheckItem(itemId, nextChecked);
    if (res && onSessionUpdated) {
      onSessionUpdated(res);
    }
  };

  const handleFinish = async () => {
    if (!isAllCompleted || isFinishing) return;
    setIsFinishing(true);
    hapticFeedback('success');
    const res = await finishBeforeLeavingSession();
    if (res && onFinishSession) {
      onFinishSession();
    }
    setIsFinishing(false);
  };

  return (
    <motion.div
      className="before-leaving-fullscreen-overlay"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <div className="before-leaving-overlay-container">
        {/* Top Header Card */}
        <header className="before-leaving-overlay-header">
          <div className="before-leaving-lock-badge-wrap">
            <motion.div
              className={`before-leaving-lock-badge ${isAllCompleted ? 'is-unlocked' : 'is-locked'}`}
              animate={lockShake > 0 && !isAllCompleted ? { x: [-6, 6, -4, 4, 0] } : {}}
              transition={{ duration: 0.3 }}
            >
              {isAllCompleted ? (
                <>
                  <Unlock size={16} />
                  <span>Все пункты выполнены</span>
                </>
              ) : (
                <>
                  <Lock size={16} />
                  <span>Интерфейс заблокирован</span>
                </>
              )}
            </motion.div>
          </div>

          <h1 className="before-leaving-title">Перед выходом</h1>
          <p className="before-leaving-subtitle">
            {isAllCompleted
              ? 'Отлично! Вы проверили все необходимые вещи. Можно выходить.'
              : 'Отметьте все пункты чеклиста, чтобы разблокировать доступ к приложению.'}
          </p>

          {/* Progress bar */}
          <div className="before-leaving-progress-card">
            <div className="before-leaving-progress-meta">
              <span>{completedCount} из {totalCount} готово</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="before-leaving-progress-track">
              <motion.div
                className="before-leaving-progress-fill"
                initial={false}
                animate={{ width: `${progressPercent}%` }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              />
            </div>
          </div>
        </header>

        {/* Checklist Viewport */}
        <div className="before-leaving-checklist-scroll">
          <div className="before-leaving-checklist">
            {items.map((item) => (
              <div
                key={item.id}
                className={`before-leaving-check-row ${item.is_checked ? 'is-checked' : ''}`}
                onClick={() => handleToggle(item.id, item.is_checked)}
              >
                <AnimatedCheckbox
                  checked={item.is_checked}
                  onChange={() => handleToggle(item.id, item.is_checked)}
                  size={24}
                  ariaLabel={item.title}
                />
                <span className="before-leaving-check-title">{item.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Unlock Action */}
        <footer className="before-leaving-overlay-footer">
          {isAllCompleted ? (
            <motion.button
              type="button"
              className="before-leaving-exit-btn is-active"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleFinish}
              disabled={isFinishing}
            >
              <DoorOpen size={18} />
              <span>{isFinishing ? 'Завершение...' : 'Выйти из режима'}</span>
            </motion.button>
          ) : (
            <div className="before-leaving-exit-btn is-disabled" title="Завершите все пункты для выхода">
              <Lock size={16} />
              <span>Выход заблокирован ({completedCount}/{totalCount})</span>
            </div>
          )}
        </footer>
      </div>
    </motion.div>
  );
}
```

---

### 3.6 Header & Sidebar Adaptive Integration (`App.jsx` — R3)

[Documented] State & JSX adjustments in `frontend/src/App.jsx`:

1. **State Definitions**:
```jsx
const isTgIos = isTelegramIos();
const [isBeforeLeavingActive, setIsBeforeLeavingActive] = useState(false);
const [activeBeforeLeavingSession, setActiveBeforeLeavingSession] = useState(null);
const [isBeforeLeavingConfigOpen, setIsBeforeLeavingConfigOpen] = useState(false);
const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
```

2. **Session Auto-Restoration on Startup**:
```jsx
// Inside loadData or initial mount:
fetchActiveBeforeLeavingSession().then((activeSession) => {
  if (activeSession && activeSession.is_active) {
    setActiveBeforeLeavingSession(activeSession);
    setIsBeforeLeavingActive(true);
  }
});
```

3. **Desktop Sidebar Placement (`App.jsx:615-658`)**:
```jsx
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
    >
      {/* Avatar & User Details */}
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

  {/* On all other devices & breakpoints: button on the same horizontal level */}
  {!isTgIos && (
    <button
      type="button"
      className="header-before-leaving-btn"
      onClick={handleStartBeforeLeaving}
      title="Режим «Перед выходом»"
    >
      <DoorOpen size={16} />
      <span>Перед выходом</span>
    </button>
  )}
</div>
```

4. **Mobile Header Placement (`App.jsx:764-807`)**:
```jsx
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
    >
      {/* Avatar & User Details */}
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

  {/* On all other devices & breakpoints: button on the same horizontal level */}
  {!isTgIos && (
    <button
      type="button"
      className="header-before-leaving-btn"
      onClick={handleStartBeforeLeaving}
      title="Режим «Перед выходом»"
    >
      <DoorOpen size={16} />
      <span>Перед выходом</span>
    </button>
  )}
</header>
```

5. **Top-Level Overlays (`App.jsx` render root)**:
```jsx
{/* Fullscreen Active Mode Blocking Overlay */}
<AnimatePresence>
  {isBeforeLeavingActive && activeBeforeLeavingSession && (
    <BeforeLeavingActiveOverlay
      session={activeBeforeLeavingSession}
      onSessionUpdated={(updated) => setActiveBeforeLeavingSession(updated)}
      onFinishSession={() => {
        setIsBeforeLeavingActive(false);
        setActiveBeforeLeavingSession(null);
        handleTaskCelebration();
      }}
    />
  )}
</AnimatePresence>

{/* Template Configuration Modal */}
<AnimatePresence>
  {isBeforeLeavingConfigOpen && (
    <BeforeLeavingConfigModal
      isOpen={isBeforeLeavingConfigOpen}
      onClose={() => setIsBeforeLeavingConfigOpen(false)}
    />
  )}
</AnimatePresence>
```

---

### 3.7 CSS Styles Architecture (`frontend/src/index.css`)

[Documented] CSS additions to maintain design consistency:

```css
/* =========================================================================
   Before Leaving («Перед выходом») Styles
   ========================================================================= */

/* Adaptive Header / Sidebar Launch Button (on same level as Profile Bubble) */
.header-before-leaving-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  color: var(--text-primary);
  font-size: var(--font-body);
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.header-before-leaving-btn:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-hover);
}

.header-before-leaving-btn:active {
  transform: scale(0.96);
}

/* Telegram iOS Profile Bubble Dropdown Popover */
.profile-bubble-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 55;
  min-width: 210px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font-size: var(--font-body);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}

.profile-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.profile-dropdown-item-primary {
  color: var(--accent-primary, #6366f1);
  font-weight: 600;
}

.profile-dropdown-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 6px;
}

/* Fullscreen Blocking Overlay (R2) */
.before-leaving-fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  width: 100vw;
  height: 100dvh;
  background: var(--bg-app);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: max(var(--safe-top), 20px) max(var(--safe-right), 16px) max(var(--safe-bottom), 24px) max(var(--safe-left), 16px);
  box-sizing: border-box;
}

.before-leaving-overlay-container {
  width: 100%;
  max-width: 480px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.before-leaving-lock-badge-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.before-leaving-lock-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: var(--font-caption);
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.before-leaving-lock-badge.is-locked {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #f87171;
}

.before-leaving-lock-badge.is-unlocked {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: #4ade80;
}

.before-leaving-title {
  font-size: var(--font-h1);
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
  margin: 0 0 6px 0;
}

.before-leaving-subtitle {
  font-size: var(--font-body);
  color: var(--text-secondary);
  text-align: center;
  margin: 0 0 18px 0;
  line-height: var(--lh-body);
}

.before-leaving-progress-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  margin-bottom: 16px;
}

.before-leaving-progress-meta {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-subtext);
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.before-leaving-progress-track {
  width: 100%;
  height: 6px;
  background: var(--bg-surface);
  border-radius: 3px;
  overflow: hidden;
}

.before-leaving-progress-fill {
  height: 100%;
  background: var(--accent-primary, #6366f1);
  border-radius: 3px;
}

.before-leaving-checklist-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  margin-bottom: 16px;
  padding-right: 4px;
}

.before-leaving-checklist {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.before-leaving-check-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
}

.before-leaving-check-row:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-hover);
}

.before-leaving-check-row.is-checked {
  opacity: 0.65;
  background: var(--bg-surface);
}

.before-leaving-check-row.is-checked .before-leaving-check-title {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

.before-leaving-check-title {
  font-size: var(--font-body);
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
}

.before-leaving-overlay-footer {
  padding-top: 8px;
}

.before-leaving-exit-btn {
  width: 100%;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.before-leaving-exit-btn.is-active {
  background: #ffffff;
  color: #000000;
  box-shadow: 0 4px 16px rgba(255, 255, 255, 0.2);
}

.before-leaving-exit-btn.is-disabled {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  cursor: not-allowed;
}
```

---

## 4. Caveats
- No caveats. The responsive breakpoints (`768px`), CSS styling variables, Telegram WebApp iOS metrics (`--safe-top`, `--safe-bottom`, 76px fullscreen clearance), and Motion animation primitives are verified directly from active source files.

---

## 5. Conclusion
1. **R1**: Implemented via `BeforeLeavingConfigModal.jsx` with full CRUD, optimistic UI, drag/arrow reordering, and API synchronization (`/api/before-leaving/items`).
2. **R2**: Implemented via `BeforeLeavingActiveOverlay.jsx` with full-screen `z-index: 100` viewport, complete navigation lock (Escape trap, popstate lock, Telegram closing confirmation, and disabled dismissal), interactive `AnimatedCheckbox` items, and automatic unlock upon 100% completion.
3. **R3**: Adaptive button placement detects `isTelegramIos()`:
   - On Telegram WebApp iOS: button is housed in the `ProfileBubbleContextMenu.jsx` anchored to `.header-profile-bubble`.
   - On all other devices & breakpoints: button is displayed on the same horizontal level inside `.app-header` (mobile) and `.sidebar-top-bar` (desktop).

---

## 6. Verification Method

### 6.1 Independent Verification Commands
1. **Production Build Verification**:
   ```bash
   cd /Users/artstrelani/Documents/TaskerBot/frontend && npm run build
   ```
   *Expected outcome*: Vite compiles successfully in under 400ms without syntax or bundling errors.

2. **Linter Verification**:
   ```bash
   cd /Users/artstrelani/Documents/TaskerBot/frontend && npm run lint
   ```
   *Expected outcome*: oxlint reports 0 errors.

3. **Behavioral Invalidation Checks**:
   - If `isTelegramIos()` returns `true` on Android or desktop browsers, the condition is invalid.
   - If the active overlay allows tab switching or modal dismissal with unchecked items, the navigation lock is invalid.
   - If reloading the page with an active backend session drops the user back to the normal dashboard, session restoration is invalid.
