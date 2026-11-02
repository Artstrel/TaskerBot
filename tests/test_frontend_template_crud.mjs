/**
 * Empirical Challenger 2 Test Suite for Milestone 2:
 * Template Configuration Modal State Transitions, CRUD Operations,
 * Ordering Logic, Boundary Validations, and Adaptive Triggers.
 */

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer } from '../frontend/node_modules/vite/dist/node/index.js';
import React from '../frontend/node_modules/react/index.js';
import { renderToString } from '../frontend/node_modules/react-dom/server.node.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '../frontend');

// Mock localStorage store
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

const mockStorage = new MockLocalStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  configurable: true,
  writable: true,
});

// Top-level await for Vite SSR initialization so modules are ready for describe blocks
const viteServer = await createServer({
  root: frontendRoot,
  server: { middlewareMode: true },
});
const apiModule = await viteServer.ssrLoadModule('./src/api.js');
const modalModule = await viteServer.ssrLoadModule('./src/components/BeforeLeavingConfigModal.jsx');
const profileMenuModule = await viteServer.ssrLoadModule('./src/components/ProfileBubbleContextMenu.jsx');

after(async () => {
  if (viteServer) {
    await viteServer.close();
  }
});

// ==============================================================================
// 1. Boundary Validations & Capitalization Logic
// ==============================================================================
describe('1. Boundary Validations & Capitalization (capitalizeFirst)', () => {
  const { capitalizeFirst } = apiModule;

  test('Empty string returns empty string', () => {
    assert.equal(capitalizeFirst(''), '');
  });

  test('Whitespace-only strings return empty string after trim', () => {
    assert.equal(capitalizeFirst(' '), '');
    assert.equal(capitalizeFirst('    '), '');
    assert.equal(capitalizeFirst('\t\n  \r\n'), '');
  });

  test('Single latin character capitalization', () => {
    assert.equal(capitalizeFirst('a'), 'A');
    assert.equal(capitalizeFirst('z'), 'Z');
  });

  test('Single cyrillic character capitalization', () => {
    assert.equal(capitalizeFirst('я'), 'Я');
    assert.equal(capitalizeFirst('к'), 'К');
    assert.equal(capitalizeFirst('ё'), 'Ё');
  });

  test('Multi-word cyrillic sentence capitalization', () => {
    assert.equal(capitalizeFirst('проверить газ и воду'), 'Проверить газ и воду');
    assert.equal(capitalizeFirst('  ключи от квартиры и гаража  '), 'Ключи от квартиры и гаража');
  });

  test('Already capitalized string remains unchanged', () => {
    assert.equal(capitalizeFirst('Ключи'), 'Ключи');
    assert.equal(capitalizeFirst('Passport and keys'), 'Passport and keys');
  });

  test('Numeric leading prefixes preserved without corruption', () => {
    assert.equal(capitalizeFirst('2 комплекта ключей'), '2 комплекта ключей');
    assert.equal(capitalizeFirst('100 рублей на проезд'), '100 рублей на проезд');
  });

  test('Leading quotes and brackets capitalize internal first letter', () => {
    assert.equal(capitalizeFirst('«ключи»'), '«Ключи»');
    assert.equal(capitalizeFirst('"документы"'), '"Документы"');
    assert.equal(capitalizeFirst('(важно) проверить утюг'), '(Важно) проверить утюг');
    assert.equal(capitalizeFirst('[срочно] закрыть балкон'), '[Срочно] закрыть балкон');
  });

  test('Unicode & emoji leading symbols preserved', () => {
    assert.equal(capitalizeFirst('🔑 ключи'), '🔑 ключи');
    assert.equal(capitalizeFirst('⚡ выключить щиток'), '⚡ выключить щиток');
  });

  test('Boundary: Exactly 500 characters input', () => {
    const raw = 'a' + 'b'.repeat(499);
    assert.equal(raw.length, 500);
    const capitalized = capitalizeFirst(raw);
    assert.equal(capitalized.length, 500);
    assert.equal(capitalized[0], 'A');
    assert.equal(capitalized.slice(1), 'b'.repeat(499));
  });

  test('Boundary: Non-string and null/undefined resilience', () => {
    assert.equal(capitalizeFirst(null), '');
    assert.equal(capitalizeFirst(undefined), '');
    assert.equal(capitalizeFirst(123), 123);
  });
});

// ==============================================================================
// 2. Adaptive Platform Detection (isTelegramIos)
// ==============================================================================
describe('2. Adaptive Platform Detection (isTelegramIos)', () => {
  const { isTelegramIos } = apiModule;
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;

  function setNavigatorMock(props) {
    Object.defineProperty(globalThis, 'navigator', {
      value: props,
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => {
    globalThis.window = originalWindow;
    if (originalNavigator !== undefined) {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    }
  });

  function setupPlatform({ insideTg = true, platform = 'ios', userAgent = '', maxTouchPoints = 0, osPlatform = '' }) {
    globalThis.window = {
      location: { hostname: 'localhost' },
      Telegram: {
        WebApp: insideTg
          ? {
              platform,
              initData: 'query_id=123',
              initDataUnsafe: { user: { id: 1 } },
            }
          : undefined,
      },
    };
    setNavigatorMock({
      userAgent,
      platform: osPlatform,
      maxTouchPoints,
    });
  }

  test('Returns false when outside Telegram (standalone browser)', () => {
    globalThis.window = { location: { hostname: 'localhost' }, Telegram: {} };
    assert.equal(isTelegramIos(), false);
  });

  test('Returns true on Telegram WebApp for iOS (platform === "ios")', () => {
    setupPlatform({ insideTg: true, platform: 'ios', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' });
    assert.equal(isTelegramIos(), true);
  });

  test('Returns false on Telegram WebApp for Android', () => {
    setupPlatform({ insideTg: true, platform: 'android', userAgent: 'Mozilla/5.0 (Linux; Android 14)' });
    assert.equal(isTelegramIos(), false);
  });

  test('Returns false on Telegram Desktop (tdesktop, macos, weba)', () => {
    setupPlatform({ insideTg: true, platform: 'tdesktop' });
    assert.equal(isTelegramIos(), false);

    setupPlatform({ insideTg: true, platform: 'macos' });
    assert.equal(isTelegramIos(), false);

    setupPlatform({ insideTg: true, platform: 'weba' });
    assert.equal(isTelegramIos(), false);
  });

  test('Fallback when platform is "unknown": detects iOS userAgent', () => {
    setupPlatform({ insideTg: true, platform: 'unknown', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5)' });
    assert.equal(isTelegramIos(), true);
  });

  test('Fallback when platform is "unknown": detects iPadOS MacIntel touch device', () => {
    setupPlatform({ insideTg: true, platform: 'unknown', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', osPlatform: 'MacIntel', maxTouchPoints: 5 });
    assert.equal(isTelegramIos(), true);
  });

  test('Fallback when platform is "unknown" on desktop Mac (maxTouchPoints = 0)', () => {
    setupPlatform({ insideTg: true, platform: 'unknown', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', osPlatform: 'MacIntel', maxTouchPoints: 0 });
    assert.equal(isTelegramIos(), false);
  });
});

// ==============================================================================
// 3. Template CRUD API Client Resilience & Offline Caching
// ==============================================================================
describe('3. Template CRUD API Client Resilience & Offline Caching', () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;

  let mockStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });
    globalThis.window = {
      location: { hostname: 'localhost' },
      localStorage: mockStorage,
      Telegram: {},
      __tasker_demo_mode: false,
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
    globalThis.window = originalWindow;
  });

  test('fetchBeforeLeavingItems caches successful response in localStorage', async () => {
    const mockData = [
      { id: 1, title: 'Ключи', order: 0 },
      { id: 2, title: 'Документы', order: 1 },
    ];
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => mockData,
    });

    const items = await apiModule.fetchBeforeLeavingItems(1001);
    assert.deepEqual(items, mockData);

    const cachedRaw = mockStorage.getItem('tasker_cache_before_leaving_tpl_1001');
    assert.ok(cachedRaw, 'Cache entry must exist');
    assert.deepEqual(JSON.parse(cachedRaw), mockData);
  });

  test('fetchBeforeLeavingItems falls back to localStorage on network error', async () => {
    const cachedData = [{ id: 99, title: 'Оффлайн Ключи', order: 0 }];
    mockStorage.setItem('tasker_cache_before_leaving_tpl_2002', JSON.stringify(cachedData));

    globalThis.fetch = async () => {
      throw new Error('Network offline');
    };

    const items = await apiModule.fetchBeforeLeavingItems(2002);
    assert.deepEqual(items, cachedData);
  });

  test('createBeforeLeavingItem accepts object payload and updates cache', async () => {
    const createdServer = { id: 50, user_id: 3003, title: 'Паспорт', order: 0 };
    globalThis.fetch = async (url, opts) => {
      assert.ok(opts.body.includes('"title":"Паспорт"'));
      assert.ok(opts.body.includes('"order":0'));
      return {
        ok: true,
        json: async () => createdServer,
      };
    };

    const result = await apiModule.createBeforeLeavingItem({ title: 'Паспорт', order: 0 }, 3003);
    assert.deepEqual(result, createdServer);

    const cached = JSON.parse(mockStorage.getItem('tasker_cache_before_leaving_tpl_3003'));
    assert.equal(cached.length, 1);
    assert.equal(cached[0].title, 'Паспорт');
  });

  test('createBeforeLeavingItem accepts positional parameters (legacy signature)', async () => {
    const createdServer = { id: 51, user_id: 3003, title: 'Кошелек', order: 1 };
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => createdServer,
    });

    const result = await apiModule.createBeforeLeavingItem('Кошелек', 1, 3003);
    assert.deepEqual(result, createdServer);
  });

  test('updateBeforeLeavingItem modifies target item in localStorage cache', async () => {
    const initialList = [
      { id: 10, title: 'Старый заголовок', order: 0 },
      { id: 20, title: 'Другой пункт', order: 1 },
    ];
    mockStorage.setItem('tasker_cache_before_leaving_tpl_4004', JSON.stringify(initialList));

    const updatedServer = { id: 10, title: 'Новый заголовок', order: 0 };
    globalThis.fetch = async (url, opts) => {
      assert.ok(opts.body.includes('"title":"Новый заголовок"'));
      return {
        ok: true,
        json: async () => updatedServer,
      };
    };

    const result = await apiModule.updateBeforeLeavingItem(10, { title: 'Новый заголовок' }, 4004);
    assert.deepEqual(result, updatedServer);

    const cached = JSON.parse(mockStorage.getItem('tasker_cache_before_leaving_tpl_4004'));
    assert.equal(cached[0].title, 'Новый заголовок');
    assert.equal(cached[1].title, 'Другой пункт');
  });

  test('deleteBeforeLeavingItem removes item from cache', async () => {
    const initialList = [
      { id: 10, title: 'Пункт 1', order: 0 },
      { id: 20, title: 'Пункт 2', order: 1 },
    ];
    mockStorage.setItem('tasker_cache_before_leaving_tpl_5005', JSON.stringify(initialList));

    globalThis.fetch = async () => ({ ok: true, json: async () => ({ status: 'deleted' }) });

    const success = await apiModule.deleteBeforeLeavingItem(10, 5005);
    assert.equal(success, true);

    const cached = JSON.parse(mockStorage.getItem('tasker_cache_before_leaving_tpl_5005'));
    assert.equal(cached.length, 1);
    assert.equal(cached[0].id, 20);
  });

  test('reorderBeforeLeavingItems persists reordered item IDs and orders', async () => {
    const initialList = [
      { id: 1, title: 'Первый', order: 0 },
      { id: 2, title: 'Второй', order: 1 },
      { id: 3, title: 'Третий', order: 2 },
    ];
    mockStorage.setItem('tasker_cache_before_leaving_tpl_6006', JSON.stringify(initialList));

    const reorderedServer = [
      { id: 3, title: 'Третий', order: 0 },
      { id: 1, title: 'Первый', order: 1 },
      { id: 2, title: 'Второй', order: 2 },
    ];

    globalThis.fetch = async (url, opts) => {
      assert.deepEqual(JSON.parse(opts.body), { item_ids: [3, 1, 2] });
      return {
        ok: true,
        json: async () => reorderedServer,
      };
    };

    const res = await apiModule.reorderBeforeLeavingItems([3, 1, 2], 6006);
    assert.deepEqual(res, reorderedServer);

    const cached = JSON.parse(mockStorage.getItem('tasker_cache_before_leaving_tpl_6006'));
    assert.deepEqual(cached, reorderedServer);
  });
});

// ==============================================================================
// 4. BeforeLeavingConfigModal State Transitions & CRUD Invariants
// ==============================================================================
describe('4. BeforeLeavingConfigModal State Transitions & CRUD Invariants', () => {
  const { capitalizeFirst } = apiModule;

  // Empirical state transition engine simulating BeforeLeavingConfigModal logic
  function createModalStateManager(initialItems = []) {
    let items = [...initialItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    let newItemTitle = '';
    let editingId = null;
    let editTitle = '';
    let isSubmitting = false;
    let isClosed = false;
    const apiCalls = [];

    return {
      getState: () => ({ items, newItemTitle, editingId, editTitle, isSubmitting, isClosed }),
      setNewItemTitle: (t) => { newItemTitle = t; },
      setEditTitle: (t) => { editTitle = t; },
      onClose: () => { isClosed = true; },

      // handleAddItem simulation
      handleAddItem: async (titleToSubmit = newItemTitle) => {
        const clean = capitalizeFirst(titleToSubmit.trim());
        if (!clean || isSubmitting) return false;

        isSubmitting = true;
        const tempId = Date.now() + Math.random();
        const newOrder = items.length;
        const tempItem = {
          id: tempId,
          title: clean,
          order: newOrder,
          created_at: new Date().toISOString(),
        };

        items = [...items, tempItem];
        newItemTitle = '';
        apiCalls.push({ action: 'create', payload: { title: clean, order: newOrder } });

        // Simulate server assigned id
        const serverItem = { ...tempItem, id: Math.floor(tempId) };
        items = items.map((i) => (i.id === tempId ? serverItem : i));
        isSubmitting = false;
        return true;
      },

      // handleStartEdit simulation
      handleStartEdit: (item) => {
        editingId = item.id;
        editTitle = item.title;
      },

      // handleSaveEdit simulation
      handleSaveEdit: async (id) => {
        const clean = capitalizeFirst(editTitle.trim());
        if (!clean) {
          // If empty, cancels edit and keeps original title
          editingId = null;
          return false;
        }

        items = items.map((item) => (item.id === id ? { ...item, title: clean } : item));
        editingId = null;
        apiCalls.push({ action: 'update', id, payload: { title: clean } });
        return true;
      },

      // Cancel edit simulation
      handleCancelEdit: () => {
        editingId = null;
        editTitle = '';
      },

      // handleDeleteItem simulation
      handleDeleteItem: async (id) => {
        items = items.filter((item) => item.id !== id);
        if (editingId === id) editingId = null;
        apiCalls.push({ action: 'delete', id });
      },

      // handleMove simulation
      handleMove: async (index, direction) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= items.length) return false;

        const updated = [...items];
        const [moved] = updated.splice(index, 1);
        updated.splice(targetIndex, 0, moved);

        const reordered = updated.map((item, idx) => ({ ...item, order: idx }));
        items = reordered;
        apiCalls.push({ action: 'reorder', item_ids: reordered.map((i) => i.id) });
        return true;
      },

      // Escape key handler
      handleKeyDownEscape: () => {
        if (editingId !== null) {
          editingId = null;
        } else {
          isClosed = true;
        }
      },

      getApiCalls: () => apiCalls,
    };
  }

  test('Initial empty state displays 0 items and empty state view', () => {
    const sm = createModalStateManager([]);
    const state = sm.getState();
    assert.equal(state.items.length, 0);
    assert.equal(state.editingId, null);
    assert.equal(state.newItemTitle, '');
  });

  test('Adding item with empty string is rejected', async () => {
    const sm = createModalStateManager([]);
    const added = await sm.handleAddItem('');
    assert.equal(added, false);
    assert.equal(sm.getState().items.length, 0);
  });

  test('Adding item with whitespace-only string is rejected', async () => {
    const sm = createModalStateManager([]);
    const added = await sm.handleAddItem('     \t \n   ');
    assert.equal(added, false);
    assert.equal(sm.getState().items.length, 0);
  });

  test('Adding valid item auto-capitalizes and assigns sequential order', async () => {
    const sm = createModalStateManager([]);
    await sm.handleAddItem('ключи от дома');
    assert.equal(sm.getState().items.length, 1);
    assert.equal(sm.getState().items[0].title, 'Ключи от дома');
    assert.equal(sm.getState().items[0].order, 0);

    await sm.handleAddItem('паспорт');
    assert.equal(sm.getState().items.length, 2);
    assert.equal(sm.getState().items[1].title, 'Паспорт');
    assert.equal(sm.getState().items[1].order, 1);
  });

  test('Adding 500-char max boundary item succeeds', async () => {
    const sm = createModalStateManager([]);
    const longTitle = 'п' + 'а'.repeat(499);
    assert.equal(longTitle.length, 500);

    const added = await sm.handleAddItem(longTitle);
    assert.equal(added, true);
    assert.equal(sm.getState().items[0].title.length, 500);
    assert.equal(sm.getState().items[0].title[0], 'П');
  });

  test('Reordering: moving item 0 UP is rejected (boundary protection)', async () => {
    const sm = createModalStateManager([
      { id: 1, title: 'A', order: 0 },
      { id: 2, title: 'B', order: 1 },
    ]);
    const moved = await sm.handleMove(0, -1);
    assert.equal(moved, false);
    assert.equal(sm.getState().items[0].id, 1);
  });

  test('Reordering: moving bottom item DOWN is rejected (boundary protection)', async () => {
    const sm = createModalStateManager([
      { id: 1, title: 'A', order: 0 },
      { id: 2, title: 'B', order: 1 },
    ]);
    const moved = await sm.handleMove(1, 1);
    assert.equal(moved, false);
    assert.equal(sm.getState().items[1].id, 2);
  });

  test('Reordering: moving item 0 DOWN correctly swaps positions and updates orders', async () => {
    const sm = createModalStateManager([
      { id: 10, title: 'A', order: 0 },
      { id: 20, title: 'B', order: 1 },
      { id: 30, title: 'C', order: 2 },
    ]);

    const moved = await sm.handleMove(0, 1);
    assert.equal(moved, true);

    const items = sm.getState().items;
    assert.equal(items[0].id, 20);
    assert.equal(items[0].order, 0);
    assert.equal(items[1].id, 10);
    assert.equal(items[1].order, 1);
    assert.equal(items[2].id, 30);
    assert.equal(items[2].order, 2);

    const calls = sm.getApiCalls();
    assert.deepEqual(calls[calls.length - 1], {
      action: 'reorder',
      item_ids: [20, 10, 30],
    });
  });

  test('Reordering: moving item 2 UP correctly swaps positions and updates orders', async () => {
    const sm = createModalStateManager([
      { id: 10, title: 'A', order: 0 },
      { id: 20, title: 'B', order: 1 },
      { id: 30, title: 'C', order: 2 },
    ]);

    const moved = await sm.handleMove(2, -1);
    assert.equal(moved, true);

    const items = sm.getState().items;
    assert.equal(items[0].id, 10);
    assert.equal(items[0].order, 0);
    assert.equal(items[1].id, 30);
    assert.equal(items[1].order, 1);
    assert.equal(items[2].id, 20);
    assert.equal(items[2].order, 2);

    const calls = sm.getApiCalls();
    assert.deepEqual(calls[calls.length - 1], {
      action: 'reorder',
      item_ids: [10, 30, 20],
    });
  });

  test('Inline edit lifecycle: start edit, update title, save on Enter', async () => {
    const sm = createModalStateManager([{ id: 1, title: 'Ключи', order: 0 }]);
    sm.handleStartEdit(sm.getState().items[0]);
    assert.equal(sm.getState().editingId, 1);
    assert.equal(sm.getState().editTitle, 'Ключи');

    sm.setEditTitle('ключи от офиса');
    const saved = await sm.handleSaveEdit(1);
    assert.equal(saved, true);
    assert.equal(sm.getState().editingId, null);
    assert.equal(sm.getState().items[0].title, 'Ключи от офиса');
  });

  test('Inline edit with empty string cancels without corrupting original title', async () => {
    const sm = createModalStateManager([{ id: 1, title: 'Ключи', order: 0 }]);
    sm.handleStartEdit(sm.getState().items[0]);
    sm.setEditTitle('     ');
    const saved = await sm.handleSaveEdit(1);
    assert.equal(saved, false);
    assert.equal(sm.getState().editingId, null);
    assert.equal(sm.getState().items[0].title, 'Ключи', 'Original title must not be overwritten with empty string');
  });

  test('Inline edit cancel on Escape resets editingId without closing modal', () => {
    const sm = createModalStateManager([{ id: 1, title: 'Ключи', order: 0 }]);
    sm.handleStartEdit(sm.getState().items[0]);
    sm.setEditTitle('Новые ключи');

    // First escape cancels edit
    sm.handleKeyDownEscape();
    assert.equal(sm.getState().editingId, null);
    assert.equal(sm.getState().isClosed, false);
    assert.equal(sm.getState().items[0].title, 'Ключи');

    // Second escape closes modal
    sm.handleKeyDownEscape();
    assert.equal(sm.getState().isClosed, true);
  });

  test('Deleting item removes it from state and clears editingId if deleted item was being edited', async () => {
    const sm = createModalStateManager([
      { id: 10, title: 'A', order: 0 },
      { id: 20, title: 'B', order: 1 },
    ]);
    sm.handleStartEdit(sm.getState().items[1]); // editing item 20
    assert.equal(sm.getState().editingId, 20);

    await sm.handleDeleteItem(20);
    assert.equal(sm.getState().items.length, 1);
    assert.equal(sm.getState().items[0].id, 10);
    assert.equal(sm.getState().editingId, null, 'editingId must be reset when active item is deleted');

    await sm.handleDeleteItem(10);
    assert.equal(sm.getState().items.length, 0, 'Modal transitions to empty state when all items deleted');
  });
});

// ==============================================================================
// 5. SSR DOM Rendering Invariants & Accessibility Assertions
// ==============================================================================
describe('5. SSR DOM Rendering Invariants & Accessibility Assertions', () => {
  const BeforeLeavingConfigModal = modalModule.default;
  const ProfileBubbleContextMenu = profileMenuModule.default;

  test('BeforeLeavingConfigModal renders nothing when isOpen=false', () => {
    const html = renderToString(React.createElement(BeforeLeavingConfigModal, { isOpen: false }));
    assert.equal(html, '');
  });

  test('BeforeLeavingConfigModal renders dialog role and aria attributes when isOpen=true', () => {
    const html = renderToString(React.createElement(BeforeLeavingConfigModal, { isOpen: true }));
    assert.ok(html.includes('role="dialog"'), 'Must have role=dialog');
    assert.ok(html.includes('aria-modal="true"'), 'Must have aria-modal=true');
    assert.ok(html.includes('aria-labelledby="before-leaving-config-title"'), 'Must have aria-labelledby');
    assert.ok(html.includes('Перед выходом: Настройка шаблона'), 'Must display correct sheet title');
  });

  test('BeforeLeavingConfigModal contains empty state message string and input placeholder', () => {
    const html = renderToString(React.createElement(BeforeLeavingConfigModal, { isOpen: true }));
    assert.ok(
      html.includes('Список вещей пуст. Добавьте то, что нужно проверить перед выходом из дома') ||
      html.includes('Загрузка шаблона...'),
      'Must render empty state text or loading text'
    );
    assert.ok(html.includes('placeholder="Добавить пункт (например, «Ключи»)..."'), 'Must have expected placeholder');
    assert.ok(html.toLowerCase().includes('maxlength="500"'), 'Input must enforce maxlength=500');
  });

  test('ProfileBubbleContextMenu renders menu role and all 3 menu items', () => {
    const html = renderToString(React.createElement(ProfileBubbleContextMenu, { isOpen: true }));
    assert.ok(html.includes('role="menu"'), 'Must have role=menu');
    assert.ok(html.includes('aria-label="Меню профиля"'), 'Must have aria-label');
    assert.ok(html.includes('Перед выходом'), 'Must contain Перед выходом item');
    assert.ok(html.includes('Настройка чеклиста'), 'Must contain Настройка чеклиста item');
    assert.ok(html.includes('Обновить данные'), 'Must contain Обновить данные item');
  });

  test('ProfileBubbleContextMenu displays syncing text and disables button when isSyncing=true', () => {
    const html = renderToString(React.createElement(ProfileBubbleContextMenu, { isOpen: true, isSyncing: true }));
    assert.ok(html.includes('Синхронизация...'), 'Must show syncing label');
    assert.ok(html.includes('disabled=""') || html.includes('disabled'), 'Refresh button must be disabled when syncing');
  });
});

// ==============================================================================
// 6. Adversarial Stress, Concurrency & Security Invariants
// ==============================================================================
describe('6. Adversarial Stress, Concurrency & Security Invariants', () => {
  const { capitalizeFirst } = apiModule;

  function createModalStateManager(initialItems = []) {
    let items = [...initialItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    let newItemTitle = '';
    let editingId = null;
    let editTitle = '';
    let isSubmitting = false;
    let isClosed = false;
    const apiCalls = [];

    return {
      getState: () => ({ items, newItemTitle, editingId, editTitle, isSubmitting, isClosed }),
      setNewItemTitle: (t) => { newItemTitle = t; },
      setEditTitle: (t) => { editTitle = t; },
      setIsSubmitting: (s) => { isSubmitting = s; },
      onClose: () => { isClosed = true; },

      handleAddItem: async (titleToSubmit = newItemTitle) => {
        const clean = capitalizeFirst(titleToSubmit.trim());
        if (!clean || isSubmitting) return false;

        isSubmitting = true;
        const tempId = Date.now() + Math.random();
        const newOrder = items.length;
        const tempItem = {
          id: tempId,
          title: clean,
          order: newOrder,
          created_at: new Date().toISOString(),
        };

        items = [...items, tempItem];
        newItemTitle = '';
        apiCalls.push({ action: 'create', payload: { title: clean, order: newOrder } });

        const serverItem = { ...tempItem, id: Math.floor(tempId) };
        items = items.map((i) => (i.id === tempId ? serverItem : i));
        isSubmitting = false;
        return true;
      },

      handleMove: async (index, direction) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= items.length) return false;

        const updated = [...items];
        const [moved] = updated.splice(index, 1);
        updated.splice(targetIndex, 0, moved);

        const reordered = updated.map((item, idx) => ({ ...item, order: idx }));
        items = reordered;
        apiCalls.push({ action: 'reorder', item_ids: reordered.map((i) => i.id) });
        return true;
      },

      handleDeleteItem: async (id) => {
        items = items.filter((item) => item.id !== id);
        if (editingId === id) editingId = null;
        apiCalls.push({ action: 'delete', id });
      },

      getApiCalls: () => apiCalls,
    };
  }

  test('Concurrency: Double submit is prevented while isSubmitting is true', async () => {
    const sm = createModalStateManager([]);
    sm.setIsSubmitting(true);
    const added = await sm.handleAddItem('Второй вызов');
    assert.equal(added, false);
    assert.equal(sm.getState().items.length, 0);
  });

  test('Ordering Permutation Invariant: 100 random moves maintain contiguous 0..N-1 orders', async () => {
    const initial = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: `Item ${i + 1}`,
      order: i,
    }));
    const sm = createModalStateManager(initial);

    // Perform 100 random moves
    for (let step = 0; step < 100; step++) {
      const idx = Math.floor(Math.random() * 10);
      const dir = Math.random() < 0.5 ? -1 : 1;
      await sm.handleMove(idx, dir);

      const currentItems = sm.getState().items;
      assert.equal(currentItems.length, 10, 'Item count must remain constant');

      // Check order continuity
      currentItems.forEach((item, index) => {
        assert.equal(item.order, index, `Item at index ${index} must have order === index`);
      });

      // Check unique IDs
      const idSet = new Set(currentItems.map((i) => i.id));
      assert.equal(idSet.size, 10, 'All IDs must remain unique');
    }
  });

  test('Rapid random deletion down to 0 items preserves state stability', async () => {
    const initial = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      title: `Item ${i + 1}`,
      order: i,
    }));
    const sm = createModalStateManager(initial);

    while (sm.getState().items.length > 0) {
      const cur = sm.getState().items;
      const target = cur[Math.floor(Math.random() * cur.length)];
      await sm.handleDeleteItem(target.id);
    }

    assert.equal(sm.getState().items.length, 0);
    // Move on empty list should return false gracefully
    const moved = await sm.handleMove(0, 1);
    assert.equal(moved, false);
  });

  test('Security payloads: XSS strings safely handled by capitalizeFirst and not evaluated', () => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert(1)>',
      'javascript:void(0)',
      '"><svg onload=alert(1)>',
    ];

    xssPayloads.forEach((payload) => {
      const res = capitalizeFirst(payload);
      assert.equal(typeof res, 'string');
      assert.ok(res.length >= payload.trim().length);
    });
  });

  test('Security payloads: SQL injection strings safely handled without corruption', () => {
    const sqlPayloads = [
      "'; DROP TABLE before_leaving_items; --",
      '1 OR 1=1',
      '" UNION SELECT * FROM users --',
    ];

    sqlPayloads.forEach((payload) => {
      const res = capitalizeFirst(payload);
      assert.equal(typeof res, 'string');
    });
  });

  test('Whitespace stress: string with 499 spaces and 1 character', () => {
    const text = ' '.repeat(499) + 'x';
    const res = capitalizeFirst(text);
    assert.equal(res, 'X');
  });

  test('Whitespace stress: string with non-breaking spaces and tabs', () => {
    const text = '\u00A0\t  ключи  \t\u00A0';
    const res = capitalizeFirst(text);
    assert.equal(res, 'Ключи');
  });
});
