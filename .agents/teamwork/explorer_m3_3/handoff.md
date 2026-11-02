# Handoff Report: Milestone 3 (Requirement R2) Session Sync, API Client & Boot Recovery Architecture

## 1. Observation

### 1.1. Backend API & Contract Specifications
- **`backend/api/routes.py`**:
  - Line 1011: `GET /api/before-leaving/session/active?telegram_id={id}` returns `Optional[BeforeLeavingSessionRead]` (HTTP 200 with JSON session or `null`).
  - Line 1020: `POST /api/before-leaving/session/start?telegram_id={id}` accepts `{"reset": bool = False}`. Returns `BeforeLeavingSessionRead` (HTTP 200) or raises `HTTPException(status_code=400, detail="No template items configured")` if template items are absent.
  - Line 1034: `PATCH /api/before-leaving/session/items/{item_id}/toggle?telegram_id={id}` accepts `{"is_checked": Optional[bool] = None}`. Returns `BeforeLeavingSessionRead` (HTTP 200 with full session snapshot) or raises `HTTPException(status_code=404, detail="Check item or active session not found")`.
  - Line 1051: `POST /api/before-leaving/session/finish?telegram_id={id}` finishes the session. Returns `BeforeLeavingSessionRead` (HTTP 200 with `is_active: false`, `completed_at: str`). If checklist is incomplete (`is_all_completed == False`), raises `HTTPException(status_code=400, detail="Cannot finish session: unfinished items remain")`. If no active session, raises `HTTPException(status_code=404, detail="No active session found")`.

- **`backend/schemas.py`**:
  - Lines 619–630: `BeforeLeavingCheckItemRead`: `{ id: int, session_id: int, template_item_id: Optional[int], title: str, order: int, is_checked: bool, checked_at: Optional[datetime] }`.
  - Lines 640–653: `BeforeLeavingSessionRead`: `{ id: int, user_id: int, is_active: bool, started_at: datetime, completed_at: Optional[datetime], items: List[BeforeLeavingCheckItemRead], total_count: int, completed_count: int, is_all_completed: bool }`.

- **`backend/crud.py`**:
  - Lines 1422–1436: `get_active_before_leaving_session` queries active session where `is_active == True` ordered by `id desc`.
  - Lines 1439–1515: `start_before_leaving_session` acquires `_get_before_leaving_lock(user_id)`. If an active session already exists and `reset == False`, it returns the existing session without modifying checked states. If `reset == True`, it archives previous and snapshots template items.
  - Lines 1517–1548: `toggle_before_leaving_check_item` inverts or sets `is_checked`, updates `checked_at`, commits, and returns full `BeforeLeavingSessionRead`.
  - Lines 1550–1580: `finish_before_leaving_session` validates that all items are checked (`is_all_completed == True`), sets `is_active = False`, sets `completed_at`, and commits.

### 1.2. Frontend State & Existing Methods
- **`frontend/src/api.js`**:
  - Lines 3517–3527: `fetchActiveBeforeLeavingSession(userId)` invokes `GET /api/before-leaving/session/active`. Returns parsed JSON or `null`. Currently lacks local SWR caching.
  - Lines 3529–3558: `startBeforeLeavingSession(resetOrOpts, maybeUserId)` invokes `POST /api/before-leaving/session/start`. Returns session object on success, or `{ error: detail, status: status }` on failure.
  - Lines 3560–3575: `toggleBeforeLeavingCheckItem(itemId, isChecked, userId)` invokes `PATCH /api/before-leaving/session/items/{itemId}/toggle`. Currently returns `null` on failure without status error payload.
  - Lines 3577–3593: `finishBeforeLeavingSession(userId)` invokes `POST /api/before-leaving/session/finish`. Returns session object on success, or `{ error: detail, status: status }` on failure.

- **`frontend/src/App.jsx`**:
  - Lines 140–146: State declarations:
    ```javascript
    const [isTgIos, setIsTgIos] = useState(() => isTelegramIos());
    const [isBeforeLeavingConfigOpen, setIsBeforeLeavingConfigOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [activeBeforeLeavingSession, setActiveBeforeLeavingSession] = useState(null);
    const [isBeforeLeavingActive, setIsBeforeLeavingActive] = useState(false);
    ```
  - Lines 147–160: `handleStartBeforeLeaving`: Calls `startBeforeLeavingSession()`. If `res && res.id`, sets `activeBeforeLeavingSession(res)` and `setIsBeforeLeavingActive(true)`. If error (e.g. empty template HTTP 400), opens `isBeforeLeavingConfigOpen(true)`.
  - Lines 395–403: `loadData()` boot check:
    ```javascript
    fetchActiveBeforeLeavingSession()
      .then((session) => {
        if (session && session.is_active) {
          setActiveBeforeLeavingSession(session);
          setIsBeforeLeavingActive(true);
        }
      })
      .catch(() => {});
    ```
  - Lines 1118–1120: Overlay placeholder:
    ```javascript
    {isBeforeLeavingActive && (
      <div style={{ display: 'none' }} data-before-leaving-active={isBeforeLeavingActive} />
    )}
    ```

- **`tests/test_frontend_m2_challenge.mjs`**:
  - Lines 335–410: Verified contracts where `startBeforeLeavingSession` returning HTTP 400 opens `BeforeLeavingConfigModal`, and returning HTTP 200 engages active mode.

---

## 2. Logic Chain

### 2.1. 0ms Boot Recovery & Flash-of-Unprotected-Content (FUC) Prevention
1. **Observation**: On page reload or app restart, `fetchActiveBeforeLeavingSession()` in `loadData()` is asynchronous. When connecting over mobile networks or Render cold starts (latency: 1.5s–12s), `activeBeforeLeavingSession` starts as `null` and `isBeforeLeavingActive` starts as `false`.
2. **Vulnerability**: For up to several seconds after refresh, the standard UI (tabs, quick-add bar, tasks) is rendered and interactive before the network call completes, violating the R2 requirement: *"в активном состоянии режим перекрывает навигационные элементы и запрещает выход или переход между вкладками"*.
3. **Remediation**:
   - Implement synchronous SWR persistence helpers in `frontend/src/api.js`:
     - `getCachedActiveBeforeLeavingSession(userId)`
     - `setCachedActiveBeforeLeavingSession(session, userId)`
     - `clearCachedActiveBeforeLeavingSession(userId)`
   - Initialize React state in `App.jsx` lazily from localStorage cache:
     ```javascript
     const [activeBeforeLeavingSession, setActiveBeforeLeavingSession] = useState(() => getCachedActiveBeforeLeavingSession());
     const [isBeforeLeavingActive, setIsBeforeLeavingActive] = useState(() => Boolean(getCachedActiveBeforeLeavingSession()?.is_active));
     ```
   - On the very first DOM render (0ms), `isBeforeLeavingActive` is immediately `true`, mounting `BeforeLeavingActiveOverlay` and engaging navigation lock before user interactions occur.
   - When `loadData()` completes:
     - If the server confirms active session: updates state and cache with authoritative server snapshot.
     - If the server reports session is finished (`null` or `!is_active`): cleans state and cache, safely unlocking the interface.

### 2.2. Granular Optimistic Checkbox Toggle & Rollback
1. **Observation**: In active mode, items must be toggled with immediate visual feedback (`AnimatedCheckbox` checked/unchecked, progress counter updated, progress bar updated).
2. **Risk**: If the user rapidly toggles item A, then item B, rolling back an entire session snapshot on item A's network error would wipe item B's pending or successful state.
3. **Remediation**:
   - Use granular per-item optimistic updates and targeted per-item rollbacks:
     - On toggle click: Save the specific item's previous `is_checked` status.
     - Optimistically mutate only the target item inside functional state updater `setActiveBeforeLeavingSession((prev) => ...)`, recalculating `completed_count` and `is_all_completed`.
     - Update localStorage cache synchronously.
     - Fire API request `toggleBeforeLeavingCheckItem(itemId, nextChecked)`.
     - On success: Reconcile with server response. If `res.is_all_completed` is reached, trigger success haptic.
     - On failure (HTTP 4xx/5xx or network disconnect): Roll back ONLY the affected item's state to its original status, recalculate counts, update cache, and trigger error haptic (`hapticFeedback('error')`).

### 2.3. Empty Template Launch Prevention (HTTP 400)
1. **Observation**: If a user attempts to launch «Перед выходом» without configuring template items, the backend returns HTTP 400 with `{"detail": "No template items configured"}`.
2. **Remediation**:
   - `startBeforeLeavingSession` parses error details and returns `{ error: "No template items configured", status: 400 }`.
   - `handleStartBeforeLeaving` checks `if (res && res.id && res.is_active)`. When `res.id` is absent, it bypasses active overlay activation and immediately opens `BeforeLeavingConfigModal` (`setIsBeforeLeavingConfigOpen(true)`), guiding the user to configure items first.

### 2.4. Finish Session & Lock Disengagement
1. **Observation**: Session completion requires all items to be checked (`is_all_completed === true`).
2. **Remediation**:
   - When `is_all_completed === true`, `BeforeLeavingActiveOverlay` enables the primary action button «Завершить и выйти».
   - Button calls `handleFinishBeforeLeavingSession()`:
     - Calls `finishBeforeLeavingSession()`.
     - On success (`res && !res.is_active`):
       - Sets `activeBeforeLeavingSession(null)`
       - Sets `isBeforeLeavingActive(false)`
       - Calls `clearCachedActiveBeforeLeavingSession()`
       - Releases Telegram closing confirmation: `window.Telegram?.WebApp?.disableClosingConfirmation?.()`
       - Restores vertical swipes: `window.Telegram?.WebApp?.enableVerticalSwipes?.()`
       - Triggers celebratory mood: `setMascotMood('done')`
       - Calls `loadData(false, true)` to refresh background statistics.
     - On failure (e.g. HTTP 400 if server-side items remain unfinished): Keeps session active, aborts unlock, triggers error haptic.

---

## 3. Caveats

1. **Telegram WebApp SDK Availability**:
   - [Documented] `window.Telegram?.WebApp` methods (`enableClosingConfirmation`, `disableVerticalSwipes`, `BackButton`) are only available inside Telegram clients. Defensive optional chaining (`?.`) must guard every WebApp API call to ensure zero crashes in standard web browsers.
2. **User Identification in Offline / Demo Mode**:
   - When running offline or in demo mode (`isDemoMode() === true`), session CRUD relies on `localStorage` / `getLocalDb()`. Both real network calls and mock fallbacks must maintain identical object schema contracts (`BeforeLeavingSessionRead`).
3. **Multi-Tab / Multi-Device Concurrency**:
   - Backend enforces concurrency serialization via `_get_before_leaving_lock(user_id)`. If a user completes a session on another device, the local client's next `loadData()` or toggle response detects session inactivation and cleans local state.

---

## 4. Conclusion & Implementation Blueprint

### 4.1. Blueprint: `frontend/src/api.js` Modifications

```javascript
// ==============================================================================
// Before Leaving Active Session Local Cache Helpers (0ms Boot Recovery)
// ==============================================================================

export const getCachedActiveBeforeLeavingSession = (userId) => {
  if (typeof window === 'undefined') return null;
  const effectiveUserId = userId || getEffectiveUserId();
  try {
    const raw = localStorage.getItem(`tasker_cache_before_leaving_session_${effectiveUserId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

export const setCachedActiveBeforeLeavingSession = (session, userId) => {
  if (typeof window === 'undefined') return;
  const effectiveUserId = userId || getEffectiveUserId();
  const cacheKey = `tasker_cache_before_leaving_session_${effectiveUserId}`;
  try {
    if (session && session.is_active) {
      localStorage.setItem(cacheKey, JSON.stringify(session));
    } else {
      localStorage.removeItem(cacheKey);
    }
  } catch {}
};

export const clearCachedActiveBeforeLeavingSession = (userId) => {
  if (typeof window === 'undefined') return;
  const effectiveUserId = userId || getEffectiveUserId();
  try {
    localStorage.removeItem(`tasker_cache_before_leaving_session_${effectiveUserId}`);
  } catch {}
};

// ==============================================================================
// Before Leaving Active Session API Client Methods
// ==============================================================================

export const fetchActiveBeforeLeavingSession = async (userId) => {
  const effectiveUserId = userId || getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/before-leaving/session/active?telegram_id=${effectiveUserId}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.is_active) {
        setCachedActiveBeforeLeavingSession(data, effectiveUserId);
      } else {
        clearCachedActiveBeforeLeavingSession(effectiveUserId);
      }
      return data;
    }
  } catch {}

  // Fallback to cached session during cold start / offline
  const cached = getCachedActiveBeforeLeavingSession(effectiveUserId);
  if (cached && cached.is_active) {
    return cached;
  }

  // Demo mode fallback
  if (isDemoMode()) {
    const db = getLocalDb();
    return db.active_before_leaving_session || null;
  }

  return null;
};

export const startBeforeLeavingSession = async (resetOrOpts = false, maybeUserId) => {
  hapticFeedback('medium');
  let reset = false;
  let userId = null;
  if (typeof resetOrOpts === 'object' && resetOrOpts !== null) {
    reset = Boolean(resetOrOpts.reset);
    userId = maybeUserId;
  } else if (typeof resetOrOpts === 'boolean') {
    reset = resetOrOpts;
    userId = maybeUserId;
  } else {
    userId = resetOrOpts;
  }
  const effectiveUserId = userId || getEffectiveUserId();

  try {
    const res = await fetch(`${API_BASE}/before-leaving/session/start?telegram_id=${effectiveUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset }),
    });
    if (res.ok) {
      const data = await res.json();
      setCachedActiveBeforeLeavingSession(data, effectiveUserId);
      return data;
    }
    const errData = await res.json().catch(() => ({}));
    return { error: errData.detail || 'Failed to start session', status: res.status };
  } catch {
    // Demo mode fallback
    if (isDemoMode()) {
      const db = getLocalDb();
      const tplItems = db.before_leaving_items || [];
      if (!tplItems.length) {
        return { error: 'No template items configured', status: 400 };
      }
      const mockSession = {
        id: Date.now(),
        user_id: effectiveUserId,
        is_active: true,
        started_at: new Date().toISOString(),
        completed_at: null,
        items: tplItems.map((item, idx) => ({
          id: Date.now() + idx,
          session_id: Date.now(),
          template_item_id: item.id,
          title: item.title,
          order: item.order ?? idx,
          is_checked: false,
          checked_at: null,
        })),
        total_count: tplItems.length,
        completed_count: 0,
        is_all_completed: false,
      };
      db.active_before_leaving_session = mockSession;
      saveLocalDb(db);
      setCachedActiveBeforeLeavingSession(mockSession, effectiveUserId);
      return mockSession;
    }
    return { error: 'Network error', status: 0 };
  }
};

export const toggleBeforeLeavingCheckItem = async (itemId, isChecked, userId) => {
  hapticFeedback('selection');
  const effectiveUserId = userId || getEffectiveUserId();
  try {
    const payload = isChecked !== undefined ? { is_checked: isChecked } : {};
    const res = await fetch(`${API_BASE}/before-leaving/session/items/${itemId}/toggle?telegram_id=${effectiveUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updatedSession = await res.json();
      setCachedActiveBeforeLeavingSession(updatedSession, effectiveUserId);
      return updatedSession;
    }
    const errData = await res.json().catch(() => ({}));
    return { error: errData.detail || 'Failed to toggle check item', status: res.status };
  } catch {
    // Demo mode fallback
    if (isDemoMode()) {
      const db = getLocalDb();
      const session = db.active_before_leaving_session;
      if (session && session.items) {
        session.items = session.items.map((item) => {
          if (item.id === itemId) {
            const nextChecked = isChecked !== undefined ? isChecked : !item.is_checked;
            return {
              ...item,
              is_checked: nextChecked,
              checked_at: nextChecked ? new Date().toISOString() : null,
            };
          }
          return item;
        });
        session.completed_count = session.items.filter((i) => i.is_checked).length;
        session.is_all_completed = session.items.length > 0 && session.completed_count === session.items.length;
        saveLocalDb(db);
        setCachedActiveBeforeLeavingSession(session, effectiveUserId);
        return session;
      }
    }
    return { error: 'Network error', status: 0 };
  }
};

export const finishBeforeLeavingSession = async (userId) => {
  hapticFeedback('success');
  const effectiveUserId = userId || getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/before-leaving/session/finish?telegram_id=${effectiveUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const finishedSession = await res.json();
      clearCachedActiveBeforeLeavingSession(effectiveUserId);
      return finishedSession;
    }
    const errData = await res.json().catch(() => ({}));
    return { error: errData.detail || 'Failed to finish session', status: res.status };
  } catch {
    // Demo mode fallback
    if (isDemoMode()) {
      const db = getLocalDb();
      const session = db.active_before_leaving_session;
      if (!session || !session.is_active) {
        return { error: 'No active session found', status: 404 };
      }
      if (!session.is_all_completed) {
        return { error: 'Cannot finish session: unfinished items remain', status: 400 };
      }
      session.is_active = false;
      session.completed_at = new Date().toISOString();
      delete db.active_before_leaving_session;
      saveLocalDb(db);
      clearCachedActiveBeforeLeavingSession(effectiveUserId);
      return session;
    }
    return { error: 'Network error', status: 0 };
  }
};
```

---

### 4.2. Blueprint: `frontend/src/App.jsx` State Integration

```jsx
// 1. Imports
import {
  fetchActiveBeforeLeavingSession,
  startBeforeLeavingSession,
  toggleBeforeLeavingCheckItem,
  finishBeforeLeavingSession,
  getCachedActiveBeforeLeavingSession,
  setCachedActiveBeforeLeavingSession,
  clearCachedActiveBeforeLeavingSession,
} from './api';
import BeforeLeavingActiveOverlay from './components/BeforeLeavingActiveOverlay';

// 2. Synchronous Initial State (0ms Boot Lock)
const [activeBeforeLeavingSession, setActiveBeforeLeavingSession] = useState(() => getCachedActiveBeforeLeavingSession());
const [isBeforeLeavingActive, setIsBeforeLeavingActive] = useState(() => Boolean(getCachedActiveBeforeLeavingSession()?.is_active));

// 3. Boot Synchronization inside loadData()
fetchActiveBeforeLeavingSession()
  .then((session) => {
    if (session && session.is_active) {
      setActiveBeforeLeavingSession(session);
      setIsBeforeLeavingActive(true);
      setCachedActiveBeforeLeavingSession(session);
    } else {
      setActiveBeforeLeavingSession(null);
      setIsBeforeLeavingActive(false);
      clearCachedActiveBeforeLeavingSession();
    }
  })
  .catch(() => {});

// 4. Start Session Trigger
const handleStartBeforeLeaving = useCallback(async () => {
  hapticFeedback('medium');
  if (activeBeforeLeavingSession && activeBeforeLeavingSession.is_active) {
    setIsBeforeLeavingActive(true);
    return;
  }
  const res = await startBeforeLeavingSession();
  if (res && res.id && res.is_active) {
    setActiveBeforeLeavingSession(res);
    setIsBeforeLeavingActive(true);
    setCachedActiveBeforeLeavingSession(res);
  } else {
    // Empty template (HTTP 400) or error -> route to config modal
    setIsBeforeLeavingConfigOpen(true);
  }
}, [activeBeforeLeavingSession]);

// 5. Granular Optimistic Toggle with Target Rollback
const handleToggleBeforeLeavingItem = useCallback(async (itemId, isChecked) => {
  hapticFeedback('selection');
  let originalChecked = false;
  let targetChecked = false;

  // Optimistic local update
  setActiveBeforeLeavingSession((prev) => {
    if (!prev || !prev.items) return prev;
    const item = prev.items.find((i) => i.id === itemId);
    if (!item) return prev;
    originalChecked = item.is_checked;
    targetChecked = isChecked !== undefined ? isChecked : !item.is_checked;

    const newItems = prev.items.map((i) =>
      i.id === itemId
        ? { ...i, is_checked: targetChecked, checked_at: targetChecked ? new Date().toISOString() : null }
        : i
    );
    const newCompleted = newItems.filter((i) => i.is_checked).length;
    const optimistic = {
      ...prev,
      items: newItems,
      completed_count: newCompleted,
      is_all_completed: newItems.length > 0 && newCompleted === newItems.length,
    };
    setCachedActiveBeforeLeavingSession(optimistic);
    return optimistic;
  });

  // Background API persistence
  try {
    const res = await toggleBeforeLeavingCheckItem(itemId, targetChecked);
    if (res && res.id) {
      setActiveBeforeLeavingSession((prev) => {
        if (!prev) return res;
        const serverItemMap = new Map(res.items.map((i) => [i.id, i]));
        const mergedItems = prev.items.map((localItem) => {
          if (localItem.id === itemId) {
            return serverItemMap.get(itemId) || localItem;
          }
          return localItem;
        });
        const completedCount = mergedItems.filter((i) => i.is_checked).length;
        const merged = {
          ...res,
          items: mergedItems,
          completed_count: completedCount,
          is_all_completed: mergedItems.length > 0 && completedCount === mergedItems.length,
        };
        setCachedActiveBeforeLeavingSession(merged);
        return merged;
      });
      if (res.is_all_completed) {
        hapticFeedback('success');
      }
    } else {
      throw new Error(res?.error || 'Failed to toggle check item');
    }
  } catch (err) {
    console.error('Error toggling check item:', err);
    hapticFeedback('error');
    // Granular Rollback: revert ONLY target itemId
    setActiveBeforeLeavingSession((prev) => {
      if (!prev || !prev.items) return prev;
      const rolledBackItems = prev.items.map((i) =>
        i.id === itemId
          ? { ...i, is_checked: originalChecked, checked_at: originalChecked ? i.checked_at : null }
          : i
      );
      const rolledBackCompleted = rolledBackItems.filter((i) => i.is_checked).length;
      const rolledBack = {
        ...prev,
        items: rolledBackItems,
        completed_count: rolledBackCompleted,
        is_all_completed: rolledBackItems.length > 0 && rolledBackCompleted === rolledBackItems.length,
      };
      setCachedActiveBeforeLeavingSession(rolledBack);
      return rolledBack;
    });
  }
}, []);

// 6. Finish Session & Disengage Lock
const handleFinishBeforeLeavingSession = useCallback(async () => {
  hapticFeedback('success');
  try {
    const res = await finishBeforeLeavingSession();
    if (res && (!res.is_active || !res.error)) {
      setActiveBeforeLeavingSession(null);
      setIsBeforeLeavingActive(false);
      clearCachedActiveBeforeLeavingSession();

      if (window.Telegram?.WebApp) {
        try {
          window.Telegram.WebApp.disableClosingConfirmation?.();
          window.Telegram.WebApp.enableVerticalSwipes?.();
        } catch (_) {}
      }

      setMascotMood('done');
      setTimeout(() => setMascotMood('idle'), 3500);
      loadData(false, true);
    } else {
      throw new Error(res?.error || 'Failed to finish session');
    }
  } catch (err) {
    console.error('Error finishing before-leaving session:', err);
    hapticFeedback('error');
  }
}, [loadData]);

// 7. Component Rendering inside App.jsx
<AnimatePresence>
  {isBeforeLeavingActive && activeBeforeLeavingSession && (
    <BeforeLeavingActiveOverlay
      session={activeBeforeLeavingSession}
      onToggleItem={handleToggleBeforeLeavingItem}
      onFinishSession={handleFinishBeforeLeavingSession}
    />
  )}
</AnimatePresence>
```

---

## 5. Verification Method

### 5.1. Automated Test Commands
1. **Backend Integration & Regression**:
   ```bash
   pytest tests/test_before_leaving_backend.py -v
   pytest tests/test_numeric_challenge_stress.py -v
   ```
2. **Frontend M2 & M3 Baseline Challenge**:
   ```bash
   node --test tests/test_frontend_m2_challenge.mjs
   node --test tests/test_challenger_frontend_m2_empirical.mjs
   ```

### 5.2. Concrete Verification Scenarios
| # | Scenario | Steps | Expected Result | Invalidation Condition |
|---|---|---|---|---|
| 1 | **Boot Reload Recovery** | Start session, check 1 of 3 items, trigger hard refresh (`F5` or `window.location.reload()`). | Overlay renders synchronously on render #1 with item 1 checked, items 2-3 unchecked. Navigation elements remain concealed. | Dashboard or tab dock briefly visible before overlay pops up. |
| 2 | **Empty Template Prevention** | Delete all template items, click «Перед выходом». | `startBeforeLeavingSession` receives HTTP 400; `App.jsx` opens `BeforeLeavingConfigModal`. Active overlay does not mount. | Blank or crashing overlay opens with 0 items. |
| 3 | **Network Failure Rollback** | Disconnect network or mock fetch failure during toggle of item #2. | Item #2 checks optimistically, fails network sync, reverts to unchecked. Haptic error fires. Item #1 remains intact. | Item #2 stays checked despite failed network sync, or concurrent items lose state. |
| 4 | **Premature Finish Rejection** | Attempt calling `finishBeforeLeavingSession()` when `completed_count < total_count`. | Backend returns HTTP 400 (`detail: "Cannot finish session: unfinished items remain"`). Session stays active, lock remains engaged. | Session deactivates with unchecked items remaining. |
| 5 | **Clean Session Finish** | Check 100% of items, click «Завершить и выйти». | Backend returns HTTP 200 (`is_active: false`), overlay unmounts, localStorage cache cleared, Telegram closing confirmation disabled, standard navigation restored. | Overlay unmounts but Telegram closing confirmation lock lingers, or navigation remains blocked. |
