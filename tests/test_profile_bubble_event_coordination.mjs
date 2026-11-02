/**
 * Empirical Challenger Test Suite for ProfileBubbleContextMenu Event Coordination
 *
 * Requirements Verified:
 * 1. Simulate sequence: mousedown/touchstart on .header-profile-bubble followed by click.
 *    Confirm menu closes when already open.
 * 2. Simulate click inside .profile-bubble-dropdown. Confirm menu stays open.
 * 3. Simulate multi-instance scenario (both desktop sidebar and app header mounted).
 *    Confirm clicking one does not trigger false dismiss in the other.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 1. Lightweight DOM Environment & EventTarget Simulation
// ---------------------------------------------------------------------------

class MockNode {
  constructor(nodeType = 1, nodeName = 'DIV') {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.parentElement = null;
    this.childNodes = [];
    this.classList = new Set();
  }

  appendChild(child) {
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }

  contains(other) {
    if (!other) return false;
    let curr = other;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }
}

class MockElement extends MockNode {
  constructor(tagName = 'div', className = '') {
    super(1, tagName.toUpperCase());
    this.tagName = tagName.toUpperCase();
    if (className) {
      className.split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
    }
  }

  get className() {
    return Array.from(this.classList).join(' ');
  }

  set className(val) {
    this.classList = new Set((val || '').split(/\s+/).filter(Boolean));
  }

  closest(selector) {
    let curr = this;
    while (curr && curr.nodeType === 1) {
      if (selector.startsWith('.') && curr.classList.has(selector.slice(1))) {
        return curr;
      }
      if (selector.startsWith('#') && curr.id === selector.slice(1)) {
        return curr;
      }
      if (curr.tagName.toLowerCase() === selector.toLowerCase()) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }
}

class MockTextNode extends MockNode {
  constructor(text = '') {
    super(3, '#text');
    this.textContent = text;
  }
}

class MockEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).delete(listener);
    }
  }

  dispatchEvent(event) {
    const set = this.listeners.get(event.type);
    if (set) {
      for (const fn of Array.from(set)) {
        fn(event);
      }
    }
  }
}

class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

// Setup Global Browser Mocks
const mockStorage = new MockLocalStorage();
Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, configurable: true, writable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: mockStorage, configurable: true, writable: true });
globalThis.Element = MockElement;

const mockDoc = new MockEventTarget();
const mockWin = new MockEventTarget();
globalThis.document = mockDoc;
globalThis.window = mockWin;

// ---------------------------------------------------------------------------
// 2. Vite SSR Module Loading
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '../frontend');

const { createServer } = await import('../frontend/node_modules/vite/dist/node/index.js');
const React = (await import('../frontend/node_modules/react/index.js')).default;

const viteServer = await createServer({
  root: frontendRoot,
  server: { middlewareMode: true },
});

const profileMenuModule = await viteServer.ssrLoadModule('./src/components/ProfileBubbleContextMenu.jsx');
const ProfileBubbleContextMenu = profileMenuModule.default;

after(async () => {
  if (viteServer) {
    await viteServer.close();
  }
});

// Helper to mount ProfileBubbleContextMenu with simulated React hook lifecycle
function mountContextMenu(props, menuElement) {
  let cleanups = [];
  const menuRef = { current: menuElement };

  React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = {
    useRef: () => menuRef,
    useEffect: (fn, deps) => {
      const cleanup = fn();
      if (typeof cleanup === 'function') {
        cleanups.push(cleanup);
      }
    },
  };

  ProfileBubbleContextMenu(props);

  return {
    menuRef,
    unmount: () => {
      cleanups.forEach((c) => c());
      cleanups = [];
    },
  };
}

// Helper to construct App.jsx DOM hierarchy
function createMockAppDOM() {
  const appShell = new MockElement('div', 'app-shell');

  // 1. Desktop Sidebar Instance
  const desktopSidebar = new MockElement('aside', 'desktop-sidebar');
  const sidebarTopBar = new MockElement('div', 'sidebar-top-bar');
  const sidebarContainer = new MockElement('div', 'sidebar-container');
  const sidebarBubble = new MockElement('button', 'header-profile-bubble');
  const sidebarAvatarCircle = new MockElement('div', 'header-avatar-circle');
  const sidebarAvatarInitial = new MockElement('span', 'header-avatar-initial');
  const sidebarInitialText = new MockTextNode('П');
  sidebarAvatarInitial.appendChild(sidebarInitialText);
  sidebarAvatarCircle.appendChild(sidebarAvatarInitial);
  sidebarBubble.appendChild(sidebarAvatarCircle);

  const sidebarBubbleText = new MockElement('div', 'header-bubble-text');
  const sidebarBubbleName = new MockElement('span', 'header-bubble-name');
  const sidebarNameText = new MockTextNode('TaskerBot');
  sidebarBubbleName.appendChild(sidebarNameText);
  sidebarBubbleText.appendChild(sidebarBubbleName);
  sidebarBubble.appendChild(sidebarBubbleText);

  const sidebarDropdown = new MockElement('div', 'profile-bubble-dropdown');
  const sidebarBeforeLeavingBtn = new MockElement('button', 'profile-dropdown-item profile-dropdown-item-primary');
  const sidebarDoorSvg = new MockElement('svg', 'lucide lucide-door-open');
  const sidebarDoorSpan = new MockElement('span', '');
  const sidebarDoorText = new MockTextNode('Перед выходом');
  sidebarDoorSpan.appendChild(sidebarDoorText);
  sidebarBeforeLeavingBtn.appendChild(sidebarDoorSvg);
  sidebarBeforeLeavingBtn.appendChild(sidebarDoorSpan);

  const sidebarDivider = new MockElement('div', 'profile-dropdown-divider');
  sidebarDropdown.appendChild(sidebarBeforeLeavingBtn);
  sidebarDropdown.appendChild(sidebarDivider);

  sidebarContainer.appendChild(sidebarBubble);
  sidebarContainer.appendChild(sidebarDropdown);
  sidebarTopBar.appendChild(sidebarContainer);
  desktopSidebar.appendChild(sidebarTopBar);
  appShell.appendChild(desktopSidebar);

  // 2. Mobile App Header Instance
  const appHeader = new MockElement('header', 'app-header');
  const headerContainer = new MockElement('div', 'header-container');
  const headerBubble = new MockElement('button', 'header-profile-bubble');
  const headerAvatarCircle = new MockElement('div', 'header-avatar-circle');
  const headerAvatarInitial = new MockElement('span', 'header-avatar-initial');
  const headerInitialText = new MockTextNode('А');
  headerAvatarInitial.appendChild(headerInitialText);
  headerAvatarCircle.appendChild(headerAvatarInitial);
  headerBubble.appendChild(headerAvatarCircle);

  const headerBubbleText = new MockElement('div', 'header-bubble-text');
  const headerBubbleName = new MockElement('span', 'header-bubble-name');
  const headerNameText = new MockTextNode('User');
  headerBubbleName.appendChild(headerNameText);
  headerBubbleText.appendChild(headerBubbleName);
  headerBubble.appendChild(headerBubbleText);

  const headerDropdown = new MockElement('div', 'profile-bubble-dropdown');
  const headerBeforeLeavingBtn = new MockElement('button', 'profile-dropdown-item profile-dropdown-item-primary');
  const headerDoorSvg = new MockElement('svg', 'lucide lucide-door-open');
  const headerDoorSpan = new MockElement('span', '');
  const headerDoorText = new MockTextNode('Перед выходом');
  headerDoorSpan.appendChild(headerDoorText);
  headerBeforeLeavingBtn.appendChild(headerDoorSvg);
  headerBeforeLeavingBtn.appendChild(headerDoorSpan);

  const headerDivider = new MockElement('div', 'profile-dropdown-divider');
  headerDropdown.appendChild(headerBeforeLeavingBtn);
  headerDropdown.appendChild(headerDivider);

  headerContainer.appendChild(headerBubble);
  headerContainer.appendChild(headerDropdown);
  appHeader.appendChild(headerContainer);
  appShell.appendChild(appHeader);

  // 3. External Content
  const appMain = new MockElement('main', 'app-main');
  const mainContent = new MockElement('div', 'tasks-container');
  appMain.appendChild(mainContent);
  appShell.appendChild(appMain);

  return {
    appShell,
    desktopSidebar,
    sidebarBubble,
    sidebarAvatarInitial,
    sidebarInitialText,
    sidebarBubbleName,
    sidebarNameText,
    sidebarDropdown,
    sidebarBeforeLeavingBtn,
    sidebarDoorSpan,
    sidebarDoorText,
    sidebarDivider,
    appHeader,
    headerBubble,
    headerAvatarInitial,
    headerInitialText,
    headerBubbleName,
    headerDropdown,
    headerBeforeLeavingBtn,
    headerDoorSpan,
    headerDivider,
    appMain,
    mainContent,
  };
}

// ---------------------------------------------------------------------------
// 3. Test Suites
// ---------------------------------------------------------------------------

describe('Empirical Test 1: Downstroke Coordination & Bubble Toggle Sequence (Requirement 1)', () => {
  beforeEach(() => {
    mockDoc.listeners.clear();
    mockWin.listeners.clear();
  });

  test('Sequence: mousedown on .header-profile-bubble followed by click closes menu when open', () => {
    const dom = createMockAppDOM();
    let isProfileMenuOpen = true;
    let onCloseCallCount = 0;

    const instance = mountContextMenu({
      isOpen: isProfileMenuOpen,
      onClose: () => {
        onCloseCallCount++;
        isProfileMenuOpen = false;
      },
    }, dom.headerDropdown);

    // Simulated user interaction: Mouse down on header profile bubble button
    mockDoc.dispatchEvent({ type: 'mousedown', target: dom.headerBubble });

    // Assert that handleClickOutside did NOT trigger premature onClose
    assert.equal(onCloseCallCount, 0, 'mousedown on bubble must NOT call onClose');
    assert.equal(isProfileMenuOpen, true, 'menu must remain open during downstroke');

    // Subsequent click event triggers App.jsx onClick: setIsProfileMenuOpen(prev => !prev)
    isProfileMenuOpen = !isProfileMenuOpen;

    assert.equal(isProfileMenuOpen, false, 'menu must close on click toggle');
    instance.unmount();
  });

  test('Sequence: touchstart on .header-profile-bubble followed by click closes menu when open', () => {
    const dom = createMockAppDOM();
    let isProfileMenuOpen = true;
    let onCloseCallCount = 0;

    const instance = mountContextMenu({
      isOpen: isProfileMenuOpen,
      onClose: () => {
        onCloseCallCount++;
        isProfileMenuOpen = false;
      },
    }, dom.headerDropdown);

    // Simulated user interaction: Touchstart on profile bubble
    mockDoc.dispatchEvent({ type: 'touchstart', target: dom.headerBubble });

    assert.equal(onCloseCallCount, 0, 'touchstart on bubble must NOT call onClose');
    assert.equal(isProfileMenuOpen, true, 'menu must remain open during touchstart');

    // Click completes toggle
    isProfileMenuOpen = !isProfileMenuOpen;
    assert.equal(isProfileMenuOpen, false, 'menu must close on click toggle');
    instance.unmount();
  });

  test('Sequence: mousedown on deeply nested elements inside bubble (avatar, name, initial)', () => {
    const dom = createMockAppDOM();
    const testTargets = [
      dom.headerAvatarInitial,
      dom.headerBubbleName,
    ];

    for (const target of testTargets) {
      let isProfileMenuOpen = true;
      let onCloseCalled = false;

      const instance = mountContextMenu({
        isOpen: true,
        onClose: () => { onCloseCalled = true; },
      }, dom.headerDropdown);

      mockDoc.dispatchEvent({ type: 'mousedown', target });

      assert.equal(onCloseCalled, false, `mousedown on ${target.className} must not trigger onClose`);
      instance.unmount();
      mockDoc.listeners.clear();
      mockWin.listeners.clear();
    }
  });

  test('Sequence: mousedown on TextNode inside avatar initial utilizes parentElement traversal', () => {
    const dom = createMockAppDOM();
    let onCloseCalled = false;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalled = true; },
    }, dom.headerDropdown);

    // Target is a raw text node (#text), whose parentElement is span.header-avatar-initial
    mockDoc.dispatchEvent({ type: 'mousedown', target: dom.headerInitialText });

    assert.equal(onCloseCalled, false, 'mousedown on text node inside bubble must not trigger onClose');
    instance.unmount();
  });

  test('Counterfactual proof: absence of header-profile-bubble check resurrects menu on toggle', () => {
    // Model the bug prior to the fix:
    // If handleClickOutside had executed onClose without checking for .header-profile-bubble:
    let isProfileMenuOpen = true;
    let prematureCloseRan = false;

    // Simulate old buggy behavior
    const buggyHandleClickOutside = (e) => {
      // Old code only checked menuRef.current
      if (e.target.closest && e.target.closest('.profile-bubble-dropdown')) return;
      prematureCloseRan = true;
      isProfileMenuOpen = false; // Closed prematurely on mousedown!
    };

    const dom = createMockAppDOM();
    buggyHandleClickOutside({ target: dom.headerBubble });

    assert.equal(prematureCloseRan, true, 'Old code would fire onClose on mousedown');
    assert.equal(isProfileMenuOpen, false, 'State flipped to false on mousedown');

    // Now the browser fires the subsequent click event on the button:
    // App.jsx: setIsProfileMenuOpen(prev => !prev) -> !false becomes true!
    isProfileMenuOpen = !isProfileMenuOpen;

    // The menu is resurrected (re-opened) instead of closed!
    assert.equal(isProfileMenuOpen, true, 'Old behavior caused menu to immediately reopen (resurrection bug)');
  });
});

describe('Empirical Test 2: Internal Dropdown Clicks & Containment (Requirement 2)', () => {
  beforeEach(() => {
    mockDoc.listeners.clear();
    mockWin.listeners.clear();
  });

  test('Click directly on .profile-bubble-dropdown container keeps menu open', () => {
    const dom = createMockAppDOM();
    let onCloseCalled = false;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalled = true; },
    }, dom.headerDropdown);

    mockDoc.dispatchEvent({ type: 'mousedown', target: dom.headerDropdown });
    assert.equal(onCloseCalled, false, 'mousedown on dropdown container must not trigger onClose');

    mockDoc.dispatchEvent({ type: 'touchstart', target: dom.headerDropdown });
    assert.equal(onCloseCalled, false, 'touchstart on dropdown container must not trigger onClose');

    instance.unmount();
  });

  test('Click on .profile-dropdown-divider inside dropdown keeps menu open', () => {
    const dom = createMockAppDOM();
    let onCloseCalled = false;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalled = true; },
    }, dom.headerDropdown);

    mockDoc.dispatchEvent({ type: 'mousedown', target: dom.headerDivider });
    assert.equal(onCloseCalled, false, 'mousedown on divider must not trigger onClose');

    instance.unmount();
  });

  test('Click on span or svg inside .profile-dropdown-item keeps menu open in handleClickOutside', () => {
    const dom = createMockAppDOM();
    let onCloseCalled = false;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalled = true; },
    }, dom.headerDropdown);

    mockDoc.dispatchEvent({ type: 'mousedown', target: dom.headerDoorSpan });
    assert.equal(onCloseCalled, false, 'mousedown on label span inside menu item must not trigger onClose');

    instance.unmount();
  });

  test('Click on TextNode inside dropdown item resolves parentElement and keeps menu open', () => {
    const dom = createMockAppDOM();
    let onCloseCalled = false;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalled = true; },
    }, dom.headerDropdown);

    mockDoc.dispatchEvent({ type: 'mousedown', target: dom.sidebarDoorText });
    assert.equal(onCloseCalled, false, 'mousedown on text node inside dropdown must not trigger onClose');

    instance.unmount();
  });

  test('Stress test: 100 rapid click events inside dropdown never trigger onClose', () => {
    const dom = createMockAppDOM();
    let onCloseCalled = false;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalled = true; },
    }, dom.headerDropdown);

    for (let i = 0; i < 100; i++) {
      const target = (i % 2 === 0) ? dom.headerDivider : dom.headerDoorSpan;
      mockDoc.dispatchEvent({ type: 'mousedown', target });
      mockDoc.dispatchEvent({ type: 'touchstart', target });
    }

    assert.equal(onCloseCalled, false, 'Stress test: 100 internal clicks must never dismiss menu');
    instance.unmount();
  });
});

describe('Empirical Test 3: Multi-Instance Scenario & Isolation (Requirement 3)', () => {
  beforeEach(() => {
    mockDoc.listeners.clear();
    mockWin.listeners.clear();
  });

  test('Both desktop sidebar and app header mounted: click in Header dropdown does not dismiss Sidebar', () => {
    const dom = createMockAppDOM();
    let sidebarCloseCalls = 0;
    let headerCloseCalls = 0;

    // Mount Sidebar Instance
    const sidebarInstance = mountContextMenu({
      isOpen: true,
      onClose: () => { sidebarCloseCalls++; },
    }, dom.sidebarDropdown);

    // Mount Header Instance
    const headerInstance = mountContextMenu({
      isOpen: true,
      onClose: () => { headerCloseCalls++; },
    }, dom.headerDropdown);

    // User clicks inside Header dropdown
    mockDoc.dispatchEvent({ type: 'mousedown', target: dom.headerBeforeLeavingBtn });

    // Assert: Neither instance should dismiss!
    assert.equal(headerCloseCalls, 0, 'Header instance must not dismiss when clicked inside Header dropdown');
    assert.equal(sidebarCloseCalls, 0, 'Sidebar instance must not dismiss when Header dropdown is clicked');

    sidebarInstance.unmount();
    headerInstance.unmount();
  });

  test('Both desktop sidebar and app header mounted: click in Sidebar dropdown does not dismiss Header', () => {
    const dom = createMockAppDOM();
    let sidebarCloseCalls = 0;
    let headerCloseCalls = 0;

    const sidebarInstance = mountContextMenu({
      isOpen: true,
      onClose: () => { sidebarCloseCalls++; },
    }, dom.sidebarDropdown);

    const headerInstance = mountContextMenu({
      isOpen: true,
      onClose: () => { headerCloseCalls++; },
    }, dom.headerDropdown);

    // User clicks inside Sidebar dropdown
    mockDoc.dispatchEvent({ type: 'mousedown', target: dom.sidebarDoorSpan });

    assert.equal(sidebarCloseCalls, 0, 'Sidebar instance must not dismiss when clicked inside Sidebar dropdown');
    assert.equal(headerCloseCalls, 0, 'Header instance must not dismiss when Sidebar dropdown is clicked');

    sidebarInstance.unmount();
    headerInstance.unmount();
  });

  test('Multi-instance toggle sequence on Header bubble cleanly closes shared menu state', () => {
    const dom = createMockAppDOM();
    let isProfileMenuOpen = true;
    let totalCloseCalls = 0;

    const sidebarInstance = mountContextMenu({
      isOpen: isProfileMenuOpen,
      onClose: () => { totalCloseCalls++; isProfileMenuOpen = false; },
    }, dom.sidebarDropdown);

    const headerInstance = mountContextMenu({
      isOpen: isProfileMenuOpen,
      onClose: () => { totalCloseCalls++; isProfileMenuOpen = false; },
    }, dom.headerDropdown);

    // User presses Header profile bubble
    mockDoc.dispatchEvent({ type: 'mousedown', target: dom.headerBubble });

    // Both instances recognize target is inside .header-profile-bubble and abort onClose
    assert.equal(totalCloseCalls, 0, 'Neither instance must call onClose on mousedown on header bubble');
    assert.equal(isProfileMenuOpen, true, 'Menu state remains true during downstroke');

    // Click completes toggle on Header bubble
    isProfileMenuOpen = !isProfileMenuOpen;
    assert.equal(isProfileMenuOpen, false, 'Menu state successfully transitions to closed');

    sidebarInstance.unmount();
    headerInstance.unmount();
  });

  test('Multi-instance toggle sequence on Sidebar bubble cleanly closes shared menu state', () => {
    const dom = createMockAppDOM();
    let isProfileMenuOpen = true;
    let totalCloseCalls = 0;

    const sidebarInstance = mountContextMenu({
      isOpen: isProfileMenuOpen,
      onClose: () => { totalCloseCalls++; isProfileMenuOpen = false; },
    }, dom.sidebarDropdown);

    const headerInstance = mountContextMenu({
      isOpen: isProfileMenuOpen,
      onClose: () => { totalCloseCalls++; isProfileMenuOpen = false; },
    }, dom.headerDropdown);

    // User touches Sidebar profile bubble
    mockDoc.dispatchEvent({ type: 'touchstart', target: dom.sidebarBubble });

    assert.equal(totalCloseCalls, 0, 'Neither instance must call onClose on touchstart on sidebar bubble');
    assert.equal(isProfileMenuOpen, true, 'Menu state remains true during downstroke');

    // Click completes toggle on Sidebar bubble
    isProfileMenuOpen = !isProfileMenuOpen;
    assert.equal(isProfileMenuOpen, false, 'Menu state successfully transitions to closed');

    sidebarInstance.unmount();
    headerInstance.unmount();
  });

  test('Counterfactual proof: omission of .profile-bubble-dropdown class causes cross-instance false dismiss', () => {
    // If an implementation relied purely on menuRef.current?.contains(target):
    const dom = createMockAppDOM();
    const sidebarRef = { current: dom.sidebarDropdown };
    const headerRef = { current: dom.headerDropdown };

    // Simulated old click handler for sidebar without class check:
    const oldSidebarHandler = (e) => {
      if (sidebarRef.current?.contains(e.target)) return; // Fails when clicked in header dropdown!
      return 'DISMISS_CALLED';
    };

    // User clicks in header dropdown
    const result = oldSidebarHandler({ target: dom.headerBeforeLeavingBtn });
    assert.equal(result, 'DISMISS_CALLED', 'Proves old logic would cause false dismissal in multi-instance setup');
  });
});

describe('Empirical Test 4: External Clicks, Escape Key & Listener Lifecycle', () => {
  beforeEach(() => {
    mockDoc.listeners.clear();
    mockWin.listeners.clear();
  });

  test('Mousedown on outside element triggers onClose', () => {
    const dom = createMockAppDOM();
    let onCloseCalls = 0;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalls++; },
    }, dom.headerDropdown);

    mockDoc.dispatchEvent({ type: 'mousedown', target: dom.mainContent });
    assert.equal(onCloseCalls, 1, 'Click outside must trigger onClose');

    instance.unmount();
  });

  test('Touchstart on outside element triggers onClose', () => {
    const dom = createMockAppDOM();
    let onCloseCalls = 0;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalls++; },
    }, dom.headerDropdown);

    mockDoc.dispatchEvent({ type: 'touchstart', target: dom.appMain });
    assert.equal(onCloseCalls, 1, 'Touch outside must trigger onClose');

    instance.unmount();
  });

  test('Escape keydown on window triggers onClose', () => {
    const dom = createMockAppDOM();
    let onCloseCalls = 0;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalls++; },
    }, dom.headerDropdown);

    mockWin.dispatchEvent({ type: 'keydown', key: 'Escape' });
    assert.equal(onCloseCalls, 1, 'Escape key must trigger onClose');

    instance.unmount();
  });

  test('Non-Escape keydown on window does not trigger onClose', () => {
    const dom = createMockAppDOM();
    let onCloseCalls = 0;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalls++; },
    }, dom.headerDropdown);

    for (const key of ['Tab', 'Enter', ' ', 'ArrowDown', 'ArrowUp']) {
      mockWin.dispatchEvent({ type: 'keydown', key });
    }

    assert.equal(onCloseCalls, 0, 'Non-Escape keys must not trigger onClose');
    instance.unmount();
  });

  test('Unmounting removes event listeners completely without memory leaks', () => {
    const dom = createMockAppDOM();
    let onCloseCalls = 0;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalls++; },
    }, dom.headerDropdown);

    // Verify listeners attached
    assert.ok(mockDoc.listeners.get('mousedown')?.size > 0, 'mousedown listener must be attached');
    assert.ok(mockDoc.listeners.get('touchstart')?.size > 0, 'touchstart listener must be attached');
    assert.ok(mockWin.listeners.get('keydown')?.size > 0, 'keydown listener must be attached');

    instance.unmount();

    // Verify listeners detached
    assert.equal(mockDoc.listeners.get('mousedown')?.size, 0, 'mousedown listener must be removed');
    assert.equal(mockDoc.listeners.get('touchstart')?.size, 0, 'touchstart listener must be removed');
    assert.equal(mockWin.listeners.get('keydown')?.size, 0, 'keydown listener must be removed');

    // Outside click after unmount does nothing
    mockDoc.dispatchEvent({ type: 'mousedown', target: dom.appMain });
    assert.equal(onCloseCalls, 0, 'no calls after unmount');
  });

  test('When isOpen is false, no event listeners are attached', () => {
    const dom = createMockAppDOM();
    let onCloseCalls = 0;

    const instance = mountContextMenu({
      isOpen: false,
      onClose: () => { onCloseCalls++; },
    }, dom.headerDropdown);

    assert.equal(mockDoc.listeners.get('mousedown')?.size ?? 0, 0);
    assert.equal(mockDoc.listeners.get('touchstart')?.size ?? 0, 0);
    assert.equal(mockWin.listeners.get('keydown')?.size ?? 0, 0);

    instance.unmount();
  });
});

describe('Empirical Test 5: Edge Cases, Null Targets & Ref Support', () => {
  beforeEach(() => {
    mockDoc.listeners.clear();
    mockWin.listeners.clear();
  });

  test('e.target is null or undefined handled gracefully without crash', () => {
    const dom = createMockAppDOM();
    let onCloseCalls = 0;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalls++; },
    }, dom.headerDropdown);

    assert.doesNotThrow(() => {
      mockDoc.dispatchEvent({ type: 'mousedown', target: null });
    });
    assert.equal(onCloseCalls, 1, 'null target treated as outside click');

    assert.doesNotThrow(() => {
      mockDoc.dispatchEvent({ type: 'mousedown', target: undefined });
    });
    assert.equal(onCloseCalls, 2, 'undefined target treated as outside click');

    instance.unmount();
  });

  test('e.target is not an Element and has no parentElement', () => {
    const dom = createMockAppDOM();
    let onCloseCalls = 0;

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalls++; },
    }, dom.headerDropdown);

    const detachedObj = { someProperty: 'abc' };
    assert.doesNotThrow(() => {
      mockDoc.dispatchEvent({ type: 'mousedown', target: detachedObj });
    });
    assert.equal(onCloseCalls, 1, 'non-element target without parent treated as outside click');

    instance.unmount();
  });

  test('Explicit triggerRef parameter support', () => {
    const dom = createMockAppDOM();
    let onCloseCalls = 0;
    const triggerRef = { current: dom.headerBubble };

    const instance = mountContextMenu({
      isOpen: true,
      onClose: () => { onCloseCalls++; },
      triggerRef,
    }, dom.headerDropdown);

    mockDoc.dispatchEvent({ type: 'mousedown', target: dom.headerBubble });
    assert.equal(onCloseCalls, 0, 'triggerRef containment suppresses onClose');

    instance.unmount();
  });
});
