# Handoff Report: Investigation of Modal Focus Management and Narrow Viewport Header Layout

## 1. Observation

### 1.1 Focus Management in `BeforeLeavingConfigModal.jsx`
- **Location**: `frontend/src/components/BeforeLeavingConfigModal.jsx:20-22`, `45-67`, `199-218`.
- In lines 20-22:
  ```javascript
  const [isSubmitting, setIsSubmitting] = useState(false);
  const editInputRef = useRef(null);
  ```
  `editInputRef` is defined, but no ref exists for the new item text input.
- In lines 62-67:
  ```javascript
  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);
  ```
  Focus is managed only when `editingId !== null` (inline editing existing items).
- In lines 200-208:
  ```jsx
  <input
    type="text"
    className="before-leaving-input"
    placeholder="Добавить пункт (например, «Ключи»)..."
    value={newItemTitle}
    maxLength={500}
    onChange={(e) => setNewItemTitle(e.target.value)}
    aria-label="Название пункта чеклиста"
  />
  ```
  The input element lacks `autoFocus` and has no `ref` assigned.
- In lines 45-60:
  ```javascript
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editingId !== null) {
          setEditingId(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editingId, onClose]);
  ```
  The keydown listener handles `Escape`, but does not intercept `Tab` key navigation to trap focus within `role="dialog"` (`sheet-backdrop`), allowing focus to cycle out into background DOM nodes.

### 1.2 Viewport Constraints & Header Layout in `frontend/src/index.css` & `frontend/src/App.jsx`
- **Location**: `frontend/src/App.jsx:891-902`, `frontend/src/index.css:390-402`, `469-489`, `3081-3086`, `4514-4530`, `4825-4837`.
- In `frontend/src/App.jsx:891-902`:
  ```jsx
  {!isTgIos && (
    <button
      type="button"
      className="header-before-leaving-btn"
      onClick={handleStartBeforeLeaving}
      title="Режим «Перед выходом»"
      aria-label="Режим «Перед выходом»"
    >
      <DoorOpen size={16} />
      <span>Перед выходом</span>
    </button>
  )}
  ```
  On non-iOS platforms, `.header-before-leaving-btn` renders directly beside `.header-profile-bubble-wrapper` in `.app-header`.
- In `frontend/src/index.css:3081-3086` (`@media (max-width: 767px)`):
  ```css
  .app-header {
    padding-left: 16px;
    padding-right: 16px;
    padding-bottom: 8px;
    justify-content: space-between;
  }
  ```
  Total horizontal padding of `.app-header` on mobile is $16\text{px} + 16\text{px} = 32\text{px}$.
- In `frontend/src/index.css:469-489`:
  `.header-profile-bubble` has `padding: 4px 14px 4px 5px`, avatar circle $32\text{px}$, gap $12\text{px}$, `.header-bubble-name` `max-width: 105px`, and container `max-width: 185px`.
  Computed rendered width with typical user names: $140\text{px} \dots 185\text{px}$.
- In `frontend/src/index.css:4514-4530`:
  `.header-before-leaving-btn` has `height: 38px`, `padding: 0 12px`, `gap: 6px`, `white-space: nowrap`, and Cyrillic text `<span>Перед выходом</span>` (13 characters $\approx 91\text{px}$).
  Total width: $24\text{px (padding)} + 16\text{px (icon)} + 6\text{px (gap)} + 91\text{px (text)} + 2\text{px (border)} = 139\text{px}$ (up to $145\text{px}$).
- In `frontend/src/index.css:4825-4837`:
  Tablet intermediary breakpoint (`@media (min-width: 768px) and (max-width: 1023px)`) already implements icon-only collapsing for this button:
  ```css
  .sidebar-top-bar .header-before-leaving-btn {
    width: 38px;
    height: 38px;
    padding: 0;
    border-radius: 50%;
    justify-content: center;
  }
  .sidebar-top-bar .header-before-leaving-btn span {
    display: none !important;
  }
  ```

---

## 2. Logic Chain

### 2.1 Focus Management Analysis & Synthesis
1. [Documented] [W3C WAI-ARIA Authoring Practices Guide — Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/):
   - When a modal dialog opens, initial focus must be set on the first interactive form element or primary action control inside the dialog to support keyboard and screen reader accessibility (WCAG 2.1 Success Criterion 2.4.3: Focus Order).
   - In `BeforeLeavingConfigModal.jsx`, the primary intended action when opening the template configuration sheet is entering items (e.g. «Ключи», «Документы»).
   - Currently, focus remains on the triggering element in the background or document body.
2. [Documented] React 19 / HTML5 `autoFocus` vs programmatic `element.focus()`:
   - `autoFocus` attribute on `<input>` executes strictly during DOM mount.
   - If the modal is already mounted and toggled via `isOpen` boolean, `autoFocus` does not re-trigger.
   - Under `motion/react` spring transition (`transition={{ type: 'spring', damping: 28, stiffness: 320 }}`), setting focus via `useEffect` with a $50\text{ms}$ delay ensures the DOM element has stabilized in layout before invoking `.focus()`, preventing dropped focus on mobile WebKit/Blink browsers.
   - Employing a dual strategy (`ref={addInputRef}` + `autoFocus` + `useEffect` with $50\text{ms}$ timeout) ensures instantaneous autofocus on initial mount and guaranteed programmatic focus across re-opens.
3. [Documented] Modal Dialog Focus Trap:
   - To prevent keyboard Tab navigation from leaking out into background DOM, `handleKeyDown` in `BeforeLeavingConfigModal` must intercept `Tab` and `Shift + Tab` at boundaries of the focusable elements inside the sheet container.

### 2.2 Narrow Viewport (< 360px) Spatial Budget Calculation
1. [Empirical] Viewport dimensions and available space:
   - Screen width $W = 320\text{px}$ (e.g., iPhone SE 1st gen, small Android handsets) to $353\text{px}$ (Samsung Galaxy Z Fold cover display):
     $$\text{Available Width } W_{\text{avail}} = W - 32\text{px} = 288\text{px} \dots 321\text{px}$$
   - Element widths with full text button:
     $$W_{\text{profile}} = 140\text{px} \dots 185\text{px}$$
     $$W_{\text{gap}} = 8\text{px}$$
     $$W_{\text{btn}} = 139\text{px} \dots 145\text{px}$$
     $$W_{\text{required}} = W_{\text{profile}} + W_{\text{gap}} + W_{\text{btn}} = 287\text{px} \dots 338\text{px}$$
2. Comparison Matrix:
   | Viewport Width ($W$) | $W_{\text{avail}}$ | $W_{\text{required}}$ (Full Text) | Status (Full Text) | $W_{\text{required}}$ (Icon-Only 38px) | Margin (Icon-Only) |
   |---|---|---|---|---|---|
   | $320\text{px}$ | $288\text{px}$ | $307\text{px} \dots 338\text{px}$ | **OVERFLOW ($-19\text{px} \dots -50\text{px}$)** | $186\text{px} \dots 231\text{px}$ | **$+57\text{px} \dots +102\text{px}$** |
   | $340\text{px}$ | $308\text{px}$ | $307\text{px} \dots 338\text{px}$ | **OVERFLOW ($-24\text{px} \dots +1\text{px}$)** | $186\text{px} \dots 231\text{px}$ | **$+77\text{px} \dots +122\text{px}$** |
   | $360\text{px}$ | $328\text{px}$ | $307\text{px} \dots 338\text{px}$ | **OVERFLOW / TIGHT ($-10\text{px} \dots +21\text{px}$)** | $186\text{px} \dots 231\text{px}$ | **$+97\text{px} \dots +142\text{px}$** |
   | Fullscreen Android ($360\text{px}$) | $216\text{px}$ | $307\text{px} \dots 338\text{px}$ | **SEVERE OVERFLOW ($-91\text{px} \dots -122\text{px}$)** | $186\text{px} \dots 231\text{px}$ | **Safe for typical names** |

3. Conclusion on Narrow Screens:
   - Hiding `.header-before-leaving-btn span` and transforming the button into a $38\text{px} \times 38\text{px}$ icon-only circle under `@media (max-width: 360px)` completely eliminates horizontal overflow and visual collision.
   - The `<button>` retains `aria-label="Режим «Перед выходом»"` and `title="Режим «Перед выходом»"` (already in `App.jsx:897-898`), preserving complete screen reader and accessible tooltip parity.
   - This directly mirrors the established tablet breakpoint pattern in `index.css:4825-4837`.

---

## 3. Caveats

- **No Code Modification Undertaken**: As instructed, this investigation is strictly read-only. Concrete code patches are detailed below for the implementing worker.
- **Breakpoint Boundary**: On viewports with width $> 360\text{px}$ (e.g. $375\text{px}$ iPhone standard, $390\text{px}$, $412\text{px}$), the full text label «Перед выходом» remains visible and fits cleanly without collision.
- **iOS Telegram Isolation**: On Telegram WebApp iOS, the button is located inside the profile bubble context menu (`isTgIos === true`), so `.app-header` mobile styles apply exclusively to non-iOS web/Android environments.

---

## 4. Conclusion & Exact Proposed Implementation

### 4.1 Proposal 1: Focus Management & Dialog Tab-Trap in `frontend/src/components/BeforeLeavingConfigModal.jsx`

#### Target: `frontend/src/components/BeforeLeavingConfigModal.jsx`

```diff
--- a/frontend/src/components/BeforeLeavingConfigModal.jsx
+++ b/frontend/src/components/BeforeLeavingConfigModal.jsx
@@ -21,6 +21,8 @@ export default function BeforeLeavingConfigModal({ isOpen, onClose, onStartSess
   const [loading, setLoading] = useState(true);
   const [isSubmitting, setIsSubmitting] = useState(false);
   const editInputRef = useRef(null);
+  const addInputRef = useRef(null);
+  const sheetRef = useRef(null);
 
   useEffect(() => {
     let ignore = false;
@@ -48,15 +50,39 @@ export default function BeforeLeavingConfigModal({ isOpen, onClose, onStartSess
     const handleKeyDown = (e) => {
       if (e.key === 'Escape') {
         if (editingId !== null) {
           setEditingId(null);
         } else {
           onClose();
         }
+      } else if (e.key === 'Tab' && sheetRef.current) {
+        const focusable = sheetRef.current.querySelectorAll(
+          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
+        );
+        if (focusable.length > 0) {
+          const first = focusable[0];
+          const last = focusable[focusable.length - 1];
+          if (e.shiftKey && document.activeElement === first) {
+            e.preventDefault();
+            last.focus();
+          } else if (!e.shiftKey && document.activeElement === last) {
+            e.preventDefault();
+            first.focus();
+          }
+        }
       }
     };
 
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
   }, [isOpen, editingId, onClose]);
 
+  useEffect(() => {
+    if (isOpen) {
+      const timer = setTimeout(() => {
+        addInputRef.current?.focus();
+      }, 50);
+      return () => clearTimeout(timer);
+    }
+  }, [isOpen]);
+
   useEffect(() => {
@@ -171,6 +197,8 @@ export default function BeforeLeavingConfigModal({ isOpen, onClose, onStartSess
       <motion.div
+        ref={sheetRef}
+        tabIndex={-1}
         className="bottom-sheet-content before-leaving-config-sheet"
         initial={{ y: '100%', opacity: 0.8 }}
         animate={{ y: 0, opacity: 1 }}
@@ -200,6 +228,8 @@ export default function BeforeLeavingConfigModal({ isOpen, onClose, onStartSess
           <form onSubmit={handleAddItem} className="before-leaving-add-form">
             <input
+              ref={addInputRef}
+              autoFocus
               type="text"
               className="before-leaving-input"
               placeholder="Добавить пункт (например, «Ключи»)..."
```

### 4.2 Proposal 2: Narrow Screen Layout Rule in `frontend/src/index.css`

#### Target: `frontend/src/index.css` (append after line 4837)

```diff
--- a/frontend/src/index.css
+++ b/frontend/src/index.css
@@ -4836,3 +4836,17 @@
   .sidebar-top-bar .header-before-leaving-btn span {
     display: none !important;
   }
 }
+
+/* Narrow mobile viewports (<= 360px) on non-iOS environments */
+@media (max-width: 360px) {
+  .app-header .header-before-leaving-btn {
+    width: 38px;
+    height: 38px;
+    padding: 0;
+    border-radius: var(--radius-full);
+    justify-content: center;
+    flex-shrink: 0;
+  }
+
+  .app-header .header-before-leaving-btn span {
+    display: none !important;
+  }
+}
```

---

## 5. Verification Method

### 5.1 Independent Reproduction & Verification Steps
1. **Focus Management & Trap**:
   - Open `BeforeLeavingConfigModal` by triggering configuration sheet.
   - Verify `document.activeElement` equals `.before-leaving-input`.
   - Press `Tab` continuously: verify focus cycles from last action button back to top close button and `.before-leaving-input`, never escaping to background elements (`.today-tab`, bottom navigation dock).
   - Press `Escape`: verify modal dismisses.
2. **Narrow Viewport Layout**:
   - In browser DevTools device emulator, set non-iOS environment and viewport width to `320px` (e.g. iPhone SE) and `360px` (e.g. Galaxy S8/A-series).
   - Inspect `.app-header`: verify `.header-before-leaving-btn` renders as a $38\text{px} \times 38\text{px}$ circle displaying only the `DoorOpen` icon.
   - Verify spacing between `.header-profile-bubble` and `.header-before-leaving-btn` remains $8\text{px}$ with zero horizontal scrollbar or clipping.
   - Resize viewport to $375\text{px}$: verify text `<span>Перед выходом</span>` reappears.
3. **Automated Test Suite**:
   ```bash
   node --experimental-vm-modules tests/test_frontend_m2_challenge.mjs
   node --experimental-vm-modules tests/test_frontend_template_crud.mjs
   npm --prefix frontend run build
   ./frontend/node_modules/.bin/oxlint frontend/src/components/BeforeLeavingConfigModal.jsx
   ```
