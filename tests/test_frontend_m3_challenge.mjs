import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const REPO_ROOT = path.resolve('.');
const API_PATH = path.join(REPO_ROOT, 'frontend/src/api.js');
const APP_PATH = path.join(REPO_ROOT, 'frontend/src/App.jsx');
const OVERLAY_PATH = path.join(REPO_ROOT, 'frontend/src/components/BeforeLeavingActiveOverlay.jsx');
const CSS_PATH = path.join(REPO_ROOT, 'frontend/src/index.css');

const apiSource = fs.readFileSync(API_PATH, 'utf8')
  .replace(/import\.meta\.env/g, '({ VITE_RENDER_BACKEND_URL: "" })');

function createSandbox(env = {}) {
  const defaultStorage = {};
  const mockLocation = {
    hostname: env.hostname ?? 'localhost',
    hash: env.hash ?? '',
    origin: 'https://taskerbot.local',
    ...env.location,
  };
  const mockFetch = env.fetch ?? (() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));

  const sandbox = {
    window: env.window ?? {
      location: mockLocation,
      fetch: mockFetch,
    },
    navigator: {
      userAgent: env.userAgent ?? '',
      platform: env.platform ?? 'ios',
      maxTouchPoints: env.maxTouchPoints ?? 0,
    },
    localStorage: {
      getItem: (k) => defaultStorage[k] ?? null,
      setItem: (k, v) => { defaultStorage[k] = String(v); },
      removeItem: (k) => { delete defaultStorage[k]; },
      clear: () => { Object.keys(defaultStorage).forEach(k => delete defaultStorage[k]); },
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    Headers: globalThis.Headers || class MockHeaders {
      constructor(init) { this.map = new Map(Object.entries(init || {})); }
      get(k) { return this.map.get(k); }
      set(k, v) { this.map.set(k, v); }
      has(k) { return this.map.has(k); }
    },
    location: mockLocation,
    fetch: mockFetch,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    URLSearchParams: globalThis.URLSearchParams,
  };

  if (env.window && !env.window.location) {
    env.window.location = mockLocation;
  }
  if (env.window && !env.window.fetch) {
    env.window.fetch = mockFetch;
  }

  if (env.windowTelegram) {
    sandbox.window.Telegram = env.windowTelegram;
  } else if (sandbox.window && !sandbox.window.Telegram) {
    sandbox.window.Telegram = {
      WebApp: {
        initData: '',
        initDataUnsafe: { user: { id: 777, first_name: 'TestUser' } },
        platform: 'ios',
        HapticFeedback: {
          impactOccurred: () => {},
          notificationOccurred: () => {},
          selectionChanged: () => {},
        },
        enableClosingConfirmation: () => {},
        disableClosingConfirmation: () => {},
        disableVerticalSwipes: () => {},
        enableVerticalSwipes: () => {},
        BackButton: { hide: () => {}, show: () => {} },
      },
    };
  }

  return sandbox;
}

async function getApiModule(sandbox) {
  const context = vm.createContext(sandbox);
  const mod = new vm.SourceTextModule(apiSource, { context });
  await mod.link(() => {});
  await mod.evaluate();
  return mod.namespace;
}

// =============================================================================
// Test Suite 1: Synchronous LocalStorage Caching & 0ms Boot Recovery
// =============================================================================
describe('M3 Suite 1: Synchronous LocalStorage Caching & 0ms Boot Recovery', () => {
  it('getCachedActiveBeforeLeavingSession, setCachedActiveBeforeLeavingSession, and clearCachedActiveBeforeLeavingSession handle session persistence', async () => {
    const sandbox = createSandbox();
    const api = await getApiModule(sandbox);

    const testUserId = 777;
    const sessionPayload = {
      id: 101,
      user_id: testUserId,
      is_active: true,
      total_count: 2,
      completed_count: 0,
      is_all_completed: false,
      items: [
        { id: 1, title: 'Ключи от квартиры', is_checked: false, order: 0 },
        { id: 2, title: 'Выключить утюг', is_checked: false, order: 1 },
      ],
    };

    // Initially null
    assert.strictEqual(api.getCachedActiveBeforeLeavingSession(testUserId), null);

    // Set cache
    api.setCachedActiveBeforeLeavingSession(sessionPayload, testUserId);
    const cached = api.getCachedActiveBeforeLeavingSession(testUserId);
    assert.deepEqual(cached, sessionPayload);
    assert.strictEqual(cached.is_active, true);

    // Setting inactive session cleans cache
    api.setCachedActiveBeforeLeavingSession({ ...sessionPayload, is_active: false }, testUserId);
    assert.strictEqual(api.getCachedActiveBeforeLeavingSession(testUserId), null);

    // Restore and clear explicitly
    api.setCachedActiveBeforeLeavingSession(sessionPayload, testUserId);
    assert.ok(api.getCachedActiveBeforeLeavingSession(testUserId));
    api.clearCachedActiveBeforeLeavingSession(testUserId);
    assert.strictEqual(api.getCachedActiveBeforeLeavingSession(testUserId), null);
  });

  it('fetchActiveBeforeLeavingSession caches active session on HTTP 200 and falls back to cache during cold start', async () => {
    let networkAvailable = true;
    const mockSession = {
      id: 202,
      user_id: 777,
      is_active: true,
      total_count: 1,
      completed_count: 0,
      is_all_completed: false,
      items: [{ id: 10, title: 'Проверить окна', is_checked: false, order: 0 }],
    };

    const sandbox = createSandbox({
      fetch: async (url) => {
        if (!networkAvailable) {
          throw new Error('Cold start network timeout');
        }
        if (url.includes('/before-leaving/session/active')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockSession,
          };
        }
        return { ok: false, status: 404 };
      },
    });

    const api = await getApiModule(sandbox);

    // 1. Initial successful fetch populates cache
    const res = await api.fetchActiveBeforeLeavingSession(777);
    assert.strictEqual(res.id, 202);
    assert.strictEqual(res.is_active, true);
    assert.deepEqual(api.getCachedActiveBeforeLeavingSession(777), mockSession);

    // 2. Network drops or cold start delay: returns cached session (0ms boot)
    networkAvailable = false;
    const fallbackRes = await api.fetchActiveBeforeLeavingSession(777);
    assert.deepEqual(fallbackRes, mockSession);
    assert.strictEqual(fallbackRes.id, 202);
  });

  it('fetchActiveBeforeLeavingSession clears cache when server reports no active session', async () => {
    const initialSession = {
      id: 303,
      user_id: 777,
      is_active: true,
      items: [],
    };

    const sandbox = createSandbox({
      fetch: async (url) => {
        if (url.includes('/before-leaving/session/active')) {
          // Server reports session is finished / null
          return {
            ok: true,
            status: 200,
            json: async () => null,
          };
        }
        return { ok: false };
      },
    });

    const api = await getApiModule(sandbox);
    // Pre-populate stale cache
    api.setCachedActiveBeforeLeavingSession(initialSession, 777);
    assert.ok(api.getCachedActiveBeforeLeavingSession(777));

    // Fetch confirms inactive -> cleans cache
    const res = await api.fetchActiveBeforeLeavingSession(777);
    assert.strictEqual(res, null);
    assert.strictEqual(api.getCachedActiveBeforeLeavingSession(777), null);
  });
});

// =============================================================================
// Test Suite 2: Checklist Lifecycle, Item Toggle & Completion Invariants
// =============================================================================
describe('M3 Suite 2: Checklist Lifecycle, Item Toggle & Completion Invariants', () => {
  it('startBeforeLeavingSession handles empty template HTTP 400 rejection', async () => {
    const sandbox = createSandbox({
      fetch: async (url) => {
        if (url.includes('/before-leaving/session/start')) {
          return {
            ok: false,
            status: 400,
            json: async () => ({ detail: 'No template items configured' }),
          };
        }
        return { ok: false };
      },
    });

    const api = await getApiModule(sandbox);
    const startRes = await api.startBeforeLeavingSession();

    assert.strictEqual(startRes.status, 400);
    assert.strictEqual(startRes.error, 'No template items configured');
    assert.strictEqual(startRes.id, undefined);
    assert.strictEqual(api.getCachedActiveBeforeLeavingSession(), null);
  });

  it('toggleBeforeLeavingCheckItem synchronizes item state and updates cache', async () => {
    let serverSession = {
      id: 505,
      user_id: 777,
      is_active: true,
      total_count: 2,
      completed_count: 0,
      is_all_completed: false,
      items: [
        { id: 1, title: 'Паспорт', is_checked: false, order: 0 },
        { id: 2, title: 'Кошелек', is_checked: false, order: 1 },
      ],
    };

    const sandbox = createSandbox({
      fetch: async (url, opts) => {
        if (url.includes('/items/1/toggle')) {
          const body = JSON.parse(opts.body);
          serverSession = {
            ...serverSession,
            completed_count: body.is_checked ? 1 : 0,
            is_all_completed: false,
            items: serverSession.items.map((i) =>
              i.id === 1 ? { ...i, is_checked: body.is_checked } : i
            ),
          };
          return {
            ok: true,
            status: 200,
            json: async () => serverSession,
          };
        }
        return { ok: false };
      },
    });

    const api = await getApiModule(sandbox);
    const toggled = await api.toggleBeforeLeavingCheckItem(1, true, 777);

    assert.strictEqual(toggled.id, 505);
    assert.strictEqual(toggled.completed_count, 1);
    assert.strictEqual(toggled.items.find((i) => i.id === 1).is_checked, true);
    assert.deepEqual(api.getCachedActiveBeforeLeavingSession(777), serverSession);
  });

  it('finishBeforeLeavingSession clears cache on HTTP 200 completion', async () => {
    const sandbox = createSandbox({
      fetch: async (url) => {
        if (url.includes('/before-leaving/session/finish')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 505,
              user_id: 777,
              is_active: false,
              completed_at: new Date().toISOString(),
              total_count: 2,
              completed_count: 2,
              is_all_completed: true,
              items: [],
            }),
          };
        }
        return { ok: false };
      },
    });

    const api = await getApiModule(sandbox);
    // Pre-populate cache
    api.setCachedActiveBeforeLeavingSession({ id: 505, is_active: true }, 777);
    assert.ok(api.getCachedActiveBeforeLeavingSession(777));

    const finishRes = await api.finishBeforeLeavingSession(777);
    assert.strictEqual(finishRes.is_active, false);
    assert.strictEqual(api.getCachedActiveBeforeLeavingSession(777), null);
  });
});

// =============================================================================
// Test Suite 3: BeforeLeavingActiveOverlay Component & Hard-Lock Architecture
// =============================================================================
describe('M3 Suite 3: BeforeLeavingActiveOverlay Component & Hard-Lock Architecture', () => {
  it('verifies BeforeLeavingActiveOverlay source code implements all required props, layout and accessibility', () => {
    assert.ok(fs.existsSync(OVERLAY_PATH), 'BeforeLeavingActiveOverlay.jsx must exist');
    const source = fs.readFileSync(OVERLAY_PATH, 'utf8');

    // Fullscreen blocking overlay
    assert.match(source, /className="[^"]*before-leaving-overlay[^"]*"/);
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /id="before-leaving-overlay-title"/);

    // Header counter and badge
    assert.match(source, /Режим блокировки/);
    assert.match(source, /Перед выходом/);
    assert.match(source, /before-leaving-counter/);

    // Progress bar
    assert.match(source, /role="progressbar"/);
    assert.match(source, /before-leaving-progress-fill/);

    // AnimatedCheckbox with size={22}
    assert.match(source, /AnimatedCheckbox/);
    assert.match(source, /size=\{22\}/);

    // Strikethrough / checked class on checklist row
    assert.match(source, /before-leaving-check-row/);
    assert.match(source, /checked/);

    // Celebration & Finish button
    assert.match(source, /before-leaving-celebration-card/);
    assert.match(source, /Все пункты проверены!/);
    assert.match(source, /Завершить и выйти/);
    assert.match(source, /before-leaving-finish-btn/);

    // Multi-layer hard lock traps:
    // 1. Escape key suppression
    assert.match(source, /(?:key|e\.key)\s*===\s*'Escape'/);
    assert.match(source, /e\.preventDefault\(\)/);
    assert.match(source, /e\.stopPropagation\(\)/);

    // 2. History popstate trap
    assert.match(source, /window\.history\.pushState/);
    assert.match(source, /popstate/);

    // 3. Telegram WebApp lock calls
    assert.match(source, /enableClosingConfirmation/);
    assert.match(source, /disableVerticalSwipes/);

    // 4. Zero close button while incomplete:
    // Verify that NO dismiss button with "sheet-close-btn" or close "X" is rendered unconditionally
    assert.ok(!source.includes('sheet-close-btn'), 'Active overlay must NOT have a sheet close button');
  });

  it('verifies App.jsx state integration, 0ms boot recovery, and multi-layer hard lock', () => {
    const source = fs.readFileSync(APP_PATH, 'utf8');

    // 1. Synchronous state initialization from cache
    assert.match(
      source,
      /const\s+\[activeBeforeLeavingSession,\s*setActiveBeforeLeavingSession\]\s*=\s*useState\(\s*\(\)\s*=>\s*getCachedActiveBeforeLeavingSession\(\)\s*\);/
    );
    assert.match(
      source,
      /const\s+\[isBeforeLeavingActive,\s*setIsBeforeLeavingActive\]\s*=\s*useState\(\s*\(\)\s*=>\s*Boolean\(getCachedActiveBeforeLeavingSession\(\)\?\.is_active\)\s*\);/
    );

    // 2. Boot synchronization inside loadData
    assert.match(source, /fetchActiveBeforeLeavingSession\(\)/);
    assert.match(source, /setCachedActiveBeforeLeavingSession\(session\)/);
    assert.match(source, /clearCachedActiveBeforeLeavingSession\(\)/);

    // 3. handleStartBeforeLeaving with empty template fallback
    assert.match(source, /const\s+handleStartBeforeLeaving\s*=\s*useCallback/);
    assert.match(source, /setIsBeforeLeavingConfigOpen\(true\)/);

    // 4. Granular optimistic toggle with rollback
    assert.match(source, /const\s+handleToggleBeforeLeavingItem\s*=\s*useCallback/);
    assert.match(source, /toggleBeforeLeavingCheckItem\(itemId/);

    // 5. Session finish handler and TDZ order guarantee (loadData must be initialized before handleFinishBeforeLeavingSession)
    assert.match(source, /const\s+handleFinishBeforeLeavingSession\s*=\s*useCallback/);
    assert.match(source, /finishBeforeLeavingSession\(\)/);
    const loadDataIndex = source.indexOf('const loadData = useCallback');
    const finishSessionIndex = source.indexOf('const handleFinishBeforeLeavingSession = useCallback');
    assert.ok(
      loadDataIndex !== -1 && finishSessionIndex !== -1 && loadDataIndex < finishSessionIndex,
      'loadData must be declared before handleFinishBeforeLeavingSession to prevent Temporal Dead Zone (TDZ) ReferenceError during initial render'
    );

    // 6. Hard-lock defenses:
    // Tab switch guard
    assert.match(source, /const\s+handleTabSwitch\s*=\s*\(tab\)\s*=>\s*\{\s*if\s*\(isBeforeLeavingActive\)\s*\{\s*return;\s*\}/);

    // Keyboard shortcut guard
    assert.match(source, /if\s*\(isBeforeLeavingActive\)\s*return;/);

    // App shell concealment class
    assert.match(source, /before-leaving-mode-active/);

    // Overlay component rendering
    assert.match(source, /<BeforeLeavingActiveOverlay/);
  });
});

// =============================================================================
// Test Suite 4: CSS Concealment & WCAG 2.1 Contrast Standards
// =============================================================================
describe('M3 Suite 4: CSS Concealment & WCAG 2.1 Contrast Standards', () => {
  it('verifies CSS concealment rules for .before-leaving-mode-active', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');

    // Concealment of navigation elements
    assert.match(css, /\.before-leaving-mode-active\s+\.desktop-sidebar/);
    assert.match(css, /\.before-leaving-mode-active\s+\.app-header/);
    assert.match(css, /\.before-leaving-mode-active\s+\.bottom-dock/);
    assert.match(css, /\.before-leaving-mode-active\s+\.app-fab/);
    assert.match(css, /display:\s*none\s*!important/);
    assert.match(css, /pointer-events:\s*none\s*!important/);
    assert.match(css, /visibility:\s*hidden\s*!important/);

    // Fullscreen overlay styling at z-index: 100
    assert.match(css, /\.before-leaving-overlay\s*\{[^}]*z-index:\s*100/);
    assert.match(css, /height:\s*100dvh/);
    assert.match(css, /overscroll-behavior:\s*contain/);

    // Responsive 360px viewport
    assert.match(css, /@media\s*\(max-width:\s*360px\)/);
  });

  // WCAG Contrast ratio calculator: (L1 + 0.05) / (L2 + 0.05)
  function getLuminance(r, g, b) {
    const a = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }

  function getContrastRatio(rgb1, rgb2) {
    const lum1 = getLuminance(...rgb1);
    const lum2 = getLuminance(...rgb2);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
  }

  it('validates WCAG 2.1 AA/AAA contrast ratios for Before Leaving active tokens', () => {
    // Dark Theme tokens
    const darkBg = [13, 13, 13]; // #0d0d0d
    const darkCard = [28, 28, 31]; // #1c1c1f
    const darkTextPrimary = [237, 237, 237]; // #ededed
    const darkTextSecondary = [161, 161, 170]; // #a1a1aa
    const darkBtnBg = [237, 237, 237]; // #ededed
    const darkBtnText = [13, 13, 13]; // #0d0d0d

    // Light Theme tokens
    const lightBg = [244, 244, 246]; // #f4f4f6
    const lightCard = [255, 255, 255]; // #ffffff
    const lightTextPrimary = [9, 9, 11]; // #09090b
    const lightTextSecondary = [82, 82, 91]; // #52525b
    const lightBtnBg = [9, 9, 11]; // #09090b
    const lightBtnText = [244, 244, 246]; // #f4f4f6

    // Dark Theme Contrast Asserts
    const darkTitleContrast = getContrastRatio(darkTextPrimary, darkBg);
    assert.ok(
      darkTitleContrast >= 7.0,
      `Dark title contrast ${darkTitleContrast.toFixed(2)} must meet WCAG AAA (>= 7.0)`
    );

    const darkCounterContrast = getContrastRatio(darkTextSecondary, darkBg);
    assert.ok(
      darkCounterContrast >= 4.5,
      `Dark counter contrast ${darkCounterContrast.toFixed(2)} must meet WCAG AA (>= 4.5)`
    );

    const darkBtnContrast = getContrastRatio(darkBtnText, darkBtnBg);
    assert.ok(
      darkBtnContrast >= 7.0,
      `Dark button contrast ${darkBtnContrast.toFixed(2)} must meet WCAG AAA (>= 7.0)`
    );

    // Light Theme Contrast Asserts
    const lightTitleContrast = getContrastRatio(lightTextPrimary, lightBg);
    assert.ok(
      lightTitleContrast >= 7.0,
      `Light title contrast ${lightTitleContrast.toFixed(2)} must meet WCAG AAA (>= 7.0)`
    );

    const lightCounterContrast = getContrastRatio(lightTextSecondary, lightBg);
    assert.ok(
      lightCounterContrast >= 4.5,
      `Light counter contrast ${lightCounterContrast.toFixed(2)} must meet WCAG AA (>= 4.5)`
    );

    const lightBtnContrast = getContrastRatio(lightBtnText, lightBtnBg);
    assert.ok(
      lightBtnContrast >= 7.0,
      `Light button contrast ${lightBtnContrast.toFixed(2)} must meet WCAG AAA (>= 7.0)`
    );
  });
});
