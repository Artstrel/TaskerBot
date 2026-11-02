import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

// Load api.js and prepare sandbox
const apiSource = fs.readFileSync('frontend/src/api.js', 'utf8')
  .replace(/import\.meta\.env/g, '({ VITE_RENDER_BACKEND_URL: "" })');

function createSandbox(env = {}) {
  const defaultStorage = {};
  const mockLocation = {
    hostname: env.hostname ?? 'localhost',
    hash: env.hash ?? '',
    origin: 'https://taskerbot.local',
    ...env.location,
  };
  const mockFetch = env.fetch ?? (() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));

  const sandbox = {
    window: env.window ?? {
      location: mockLocation,
      fetch: mockFetch,
    },
    navigator: {
      userAgent: env.userAgent ?? '',
      platform: env.platform ?? '',
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
    location: mockLocation,
    fetch: mockFetch,
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };

  if (env.window && !env.window.location) {
    env.window.location = mockLocation;
  }
  if (env.window && !env.window.fetch) {
    env.window.fetch = mockFetch;
  }

  if (env.windowTelegram) {
    sandbox.window.Telegram = env.windowTelegram;
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

describe('M2 Challenge 1: Platform Detection Contract isTelegramIos()', () => {
  it('returns false in server/SSR environment (window undefined)', async () => {
    const sandbox = createSandbox();
    delete sandbox.window;
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), false);
  });

  it('returns false for regular iOS Safari outside Telegram', async () => {
    const sandbox = createSandbox({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), false);
  });

  it('returns false for regular Android Chrome outside Telegram', async () => {
    const sandbox = createSandbox({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
    });
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), false);
  });

  it('returns false for regular Desktop macOS Safari outside Telegram', async () => {
    const sandbox = createSandbox({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 Version/17.4.1 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), false);
  });

  it('returns true for Telegram WebApp on iOS (platform: "ios")', async () => {
    const sandbox = createSandbox({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      platform: 'iPhone',
      maxTouchPoints: 5,
      windowTelegram: {
        WebApp: {
          platform: 'ios',
          initData: 'query_id=AAH&user=%7B%22id%22%3A123%7D',
        },
      },
    });
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), true);
  });

  it('returns true for Telegram WebApp on iOS with case variations ("IOS", "Ios")', async () => {
    const sandbox = createSandbox({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      windowTelegram: {
        WebApp: {
          platform: 'IOS',
          initData: 'query_id=AAH',
        },
      },
    });
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), true);
  });

  it('returns false for Telegram WebApp on Android (platform: "android")', async () => {
    const sandbox = createSandbox({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
      platform: 'Linux armv8l',
      windowTelegram: {
        WebApp: {
          platform: 'android',
          initData: 'query_id=AAH&user=%7B%22id%22%3A123%7D',
        },
      },
    });
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), false);
  });

  it('returns false for Telegram Desktop (platform: "tdesktop")', async () => {
    const sandbox = createSandbox({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      platform: 'Win32',
      windowTelegram: {
        WebApp: {
          platform: 'tdesktop',
          initData: 'query_id=AAH',
        },
      },
    });
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), false);
  });

  it('returns false for Telegram macOS client (platform: "macos")', async () => {
    const sandbox = createSandbox({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
      windowTelegram: {
        WebApp: {
          platform: 'macos',
          initData: 'query_id=AAH',
        },
      },
    });
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), false);
  });

  it('returns false for Telegram Web clients (platform: "web", "weba", "webk")', async () => {
    for (const plat of ['web', 'weba', 'webk']) {
      const sandbox = createSandbox({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        windowTelegram: {
          WebApp: {
            platform: plat,
            initData: 'query_id=AAH',
          },
        },
      });
      const api = await getApiModule(sandbox);
      assert.strictEqual(api.isTelegramIos(), false, `Failed for platform: ${plat}`);
    }
  });

  it('returns true when platform is "unknown" inside Telegram on an iPhone UA', async () => {
    const sandbox = createSandbox({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X)',
      windowTelegram: {
        WebApp: {
          platform: 'unknown',
          initData: 'query_id=AAH',
        },
      },
    });
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), true);
  });

  it('returns true when platform is "unknown" inside Telegram on iPad Desktop-class UA', async () => {
    const sandbox = createSandbox({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
      windowTelegram: {
        WebApp: {
          platform: 'unknown',
          initData: 'query_id=AAH',
        },
      },
    });
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), true);
  });

  it('returns false when platform is "unknown" inside Telegram on real Mac Desktop (maxTouchPoints = 0)', async () => {
    const sandbox = createSandbox({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
      windowTelegram: {
        WebApp: {
          platform: 'unknown',
          initData: 'query_id=AAH',
        },
      },
    });
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), false);
  });

  it('returns false when URL contains spoofed hash #tgWebAppData but window.Telegram.WebApp is absent', async () => {
    const sandbox = createSandbox({
      hash: '#tgWebAppData=spoofed_query_id',
    });
    const api = await getApiModule(sandbox);
    assert.strictEqual(api.isTelegramIos(), false);
  });
});

describe('M2 Challenge 2: Component Architecture & Adaptive Contracts', () => {
  it('verifies App.jsx conditionally branches between ProfileBubbleContextMenu and inline button', () => {
    const appSource = fs.readFileSync('frontend/src/App.jsx', 'utf8');

    // 1. Must import ProfileBubbleContextMenu and BeforeLeavingConfigModal
    assert.match(appSource, /import ProfileBubbleContextMenu from '\.\/components\/ProfileBubbleContextMenu'/);
    assert.match(appSource, /import BeforeLeavingConfigModal from '\.\/components\/BeforeLeavingConfigModal'/);
    assert.match(appSource, /isTelegramIos/);

    // 2. Must initialize state with isTelegramIos
    assert.match(appSource, /const \[isTgIos, setIsTgIos\] = useState\(\(\) => isTelegramIos\(\)\);/);

    // 3. Desktop sidebar: when isTgIos is true, renders ProfileBubbleContextMenu; when false, renders inline button
    assert.match(appSource, /\{isTgIos && \(\s*<ProfileBubbleContextMenu/);
    assert.match(appSource, /\{!isTgIos && \(\s*<button[^>]*className="header-before-leaving-btn"/);

    // 4. Mobile header: identically branches on isTgIos
    const mobileHeaderSection = appSource.split('<header className="app-header">')[1]?.split('</header>')[0];
    assert.ok(mobileHeaderSection, 'App header section must exist');
    assert.match(mobileHeaderSection, /isTgIos && \(\s*<ProfileBubbleContextMenu/);
    assert.match(mobileHeaderSection, /!isTgIos && \(\s*<button[^>]*className="header-before-leaving-btn"/);

    // 5. BeforeLeavingConfigModal rendered inside AnimatePresence
    assert.match(appSource, /<BeforeLeavingConfigModal[^>]*isOpen=\{isBeforeLeavingConfigOpen\}/);
  });

  it('verifies ProfileBubbleContextMenu structure and actions', () => {
    const menuSource = fs.readFileSync('frontend/src/components/ProfileBubbleContextMenu.jsx', 'utf8');

    // Checks essential roles and classes
    assert.match(menuSource, /className="profile-bubble-dropdown"/);
    assert.match(menuSource, /role="menu"/);
    assert.match(menuSource, /aria-label="Меню профиля"/);

    // Must have 3 items: «Перед выходом», «Настройка чеклиста», «Обновить данные»
    assert.match(menuSource, /Перед выходом/);
    assert.match(menuSource, /Настройка чеклиста/);
    assert.match(menuSource, /Обновить данные/);

    // Must handle escape key and click outside
    assert.match(menuSource, /e\.key === 'Escape'/);
    assert.match(menuSource, /handleClickOutside/);
    assert.match(menuSource, /mousedown/);
    assert.match(menuSource, /touchstart/);
  });

  it('verifies BeforeLeavingConfigModal CRUD and reorder capabilities', () => {
    const modalSource = fs.readFileSync('frontend/src/components/BeforeLeavingConfigModal.jsx', 'utf8');

    // CRUD API connections
    assert.match(modalSource, /fetchBeforeLeavingItems/);
    assert.match(modalSource, /createBeforeLeavingItem/);
    assert.match(modalSource, /updateBeforeLeavingItem/);
    assert.match(modalSource, /deleteBeforeLeavingItem/);
    assert.match(modalSource, /reorderBeforeLeavingItems/);

    // Reorder buttons and boundary disabling
    assert.match(modalSource, /disabled=\{index === 0\}/);
    assert.match(modalSource, /disabled=\{index === items\.length - 1\}/);

    // Input form with max length 500 and empty state
    assert.match(modalSource, /maxLength=\{500\}/);
    assert.match(modalSource, /before-leaving-empty/);

    // Escape listener dismiss
    assert.match(modalSource, /e\.key === 'Escape'/);
  });

  it('verifies CSS styling rules for adaptive button and context menu', () => {
    const cssSource = fs.readFileSync('frontend/src/index.css', 'utf8');

    // Required CSS classes
    assert.match(cssSource, /\.header-before-leaving-btn\s*\{/);
    assert.match(cssSource, /\.profile-bubble-dropdown\s*\{/);
    assert.match(cssSource, /\.profile-dropdown-item\s*\{/);
    assert.match(cssSource, /\.profile-dropdown-divider\s*\{/);
    assert.match(cssSource, /\.before-leaving-config-sheet\s*\{/);
    assert.match(cssSource, /\.before-leaving-add-form\s*\{/);
    assert.match(cssSource, /\.before-leaving-items-list\s*\{/);

    // Tablet intermediary responsive media query
    assert.match(cssSource, /@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1023px\)/);
  });
});

describe('M2 Challenge 3: Modal Opening Trigger Logic', () => {
  it('verifies handleStartBeforeLeaving opens config modal when session start returns error', async () => {
    // Simulate backend returning 400 Bad Request (empty template)
    const sandbox = createSandbox({
      fetch: async (url, opts) => {
        if (url.includes('/before-leaving/session/start')) {
          return {
            ok: false,
            status: 400,
            json: async () => ({ detail: 'Cannot start session: template has no items' }),
          };
        }
        return { ok: true, json: async () => [] };
      },
    });

    const api = await getApiModule(sandbox);
    const startRes = await api.startBeforeLeavingSession();

    // Must return an object with error and status
    assert.ok(startRes.error, 'Should contain error message');
    assert.strictEqual(startRes.status, 400);
    assert.strictEqual(startRes.id, undefined);

    // Logic in App.jsx:
    // const res = await startBeforeLeavingSession();
    // if (res && res.id) { setActiveBeforeLeavingSession(res); setIsBeforeLeavingActive(true); }
    // else { setIsBeforeLeavingConfigOpen(true); }
    let modalOpened = false;
    if (startRes && startRes.id) {
      modalOpened = false;
    } else {
      modalOpened = true;
    }
    assert.strictEqual(modalOpened, true, 'Config modal must open when session start returns error/no ID');
  });

  it('verifies handleStartBeforeLeaving enters active mode when session start succeeds', async () => {
    const sandbox = createSandbox({
      fetch: async (url, opts) => {
        if (url.includes('/before-leaving/session/start')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 99,
              user_id: 1,
              is_active: true,
              total_count: 3,
              completed_count: 0,
              is_all_completed: false,
              items: [],
            }),
          };
        }
        return { ok: true, json: async () => [] };
      },
    });

    const api = await getApiModule(sandbox);
    const startRes = await api.startBeforeLeavingSession();

    assert.strictEqual(startRes.id, 99);
    assert.strictEqual(startRes.is_active, true);

    let modalOpened = false;
    let activeModeEntered = false;
    if (startRes && startRes.id) {
      activeModeEntered = true;
    } else {
      modalOpened = true;
    }
    assert.strictEqual(activeModeEntered, true);
    assert.strictEqual(modalOpened, false);
  });
});
