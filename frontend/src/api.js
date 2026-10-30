export const isInsideTelegram = () => {
  if (typeof window === 'undefined') return false;
  if (window.Telegram?.WebApp) {
    if (window.Telegram.WebApp.initData && window.Telegram.WebApp.initData.length > 0) return true;
    if (window.Telegram.WebApp.initDataUnsafe?.user) return true;
    if (window.Telegram.WebApp.platform && window.Telegram.WebApp.platform !== 'unknown') return true;
  }
  if (typeof window.location !== 'undefined' && window.location.hash && window.location.hash.includes('tgWebAppData')) {
    return true;
  }
  return false;
};

export const getAuthToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('tasker_auth_token') || '';
  }
  return '';
};

export const getStoredUser = () => {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('tasker_user_profile');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
  }
  return null;
};

export const isDemoMode = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('tasker_demo_mode') === 'true' || !!window.__tasker_is_demo;
  }
  return false;
};

export const setDemoMode = (enabled) => {
  if (typeof window !== 'undefined') {
    if (enabled) {
      localStorage.setItem('tasker_demo_mode', 'true');
      window.__tasker_is_demo = true;
      if (currentUser) {
        currentUser.id = 123456789;
        currentUser.first_name = 'Демо-Пользователь';
        currentUser.username = 'demo_user';
        currentUser.isDemo = true;
        currentUser.isGuest = false;
      }
    } else {
      localStorage.removeItem('tasker_demo_mode');
      window.__tasker_is_demo = false;
    }
  }
};

export const isAuthenticated = () => {
  if (isInsideTelegram()) return true;
  if (isDemoMode()) return true;
  const token = getAuthToken();
  return Boolean(token);
};

export const extractTelegramUser = () => {
  if (typeof window === 'undefined') return null;

  // 1. Direct Telegram WebApp user object
  if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
    const u = window.Telegram.WebApp.initDataUnsafe.user;
    if (u && u.id && Number(u.id) > 0) {
      return {
        id: Number(u.id),
        telegram_id: Number(u.id),
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        username: u.username || '',
        photo_url: u.photo_url || null,
        isGuest: false,
        isDemo: false,
      };
    }
  }

  // 2. Parse user from initData string if available
  if (window.Telegram?.WebApp?.initData) {
    try {
      const params = new URLSearchParams(window.Telegram.WebApp.initData);
      const rawUser = params.get('user');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u && u.id && Number(u.id) > 0) {
          return {
            id: Number(u.id),
            telegram_id: Number(u.id),
            first_name: u.first_name || '',
            last_name: u.last_name || '',
            username: u.username || '',
            photo_url: u.photo_url || null,
            isGuest: false,
            isDemo: false,
          };
        }
      }
    } catch (_) {}
  }

  // 3. Parse user from window.location.hash (#tgWebAppData=...)
  if (typeof window.location !== 'undefined' && window.location.hash) {
    try {
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      const tgWebAppData = hashParams.get('tgWebAppData');
      if (tgWebAppData) {
        const dataParams = new URLSearchParams(tgWebAppData);
        const rawUser = dataParams.get('user');
        if (rawUser) {
          const u = JSON.parse(rawUser);
          if (u && u.id && Number(u.id) > 0) {
            return {
              id: Number(u.id),
              telegram_id: Number(u.id),
              first_name: u.first_name || '',
              last_name: u.last_name || '',
              username: u.username || '',
              photo_url: u.photo_url || null,
              isGuest: false,
              isDemo: false,
            };
          }
        }
      }
    } catch (_) {}
  }

  // 4. Parse user from window.location.search (?tgWebAppData=...)
  if (typeof window.location !== 'undefined' && window.location.search) {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const tgWebAppData = searchParams.get('tgWebAppData');
      if (tgWebAppData) {
        const dataParams = new URLSearchParams(tgWebAppData);
        const rawUser = dataParams.get('user');
        if (rawUser) {
          const u = JSON.parse(rawUser);
          if (u && u.id && Number(u.id) > 0) {
            return {
              id: Number(u.id),
              telegram_id: Number(u.id),
              first_name: u.first_name || '',
              last_name: u.last_name || '',
              username: u.username || '',
              photo_url: u.photo_url || null,
              isGuest: false,
              isDemo: false,
            };
          }
        }
      }
    } catch (_) {}
  }

  // 5. Stored profile in localStorage (if not guest)
  const stored = getStoredUser();
  if (stored && (stored.id || stored.telegram_id) && Number(stored.id || stored.telegram_id) > 0 && !stored.isGuest) {
    return {
      id: Number(stored.id || stored.telegram_id),
      telegram_id: Number(stored.telegram_id || stored.id),
      first_name: stored.first_name || '',
      last_name: stored.last_name || '',
      username: stored.username || '',
      photo_url: stored.photo_url || null,
      isGuest: false,
      isDemo: Boolean(stored.isDemo),
    };
  }

  return null;
};

export const syncTelegramUser = () => {
  const extracted = extractTelegramUser();
  if (extracted && extracted.id > 0) {
    Object.assign(currentUser, extracted);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tasker_user_profile', JSON.stringify(currentUser));
      } catch (_) {}
    }
  }
  return currentUser;
};

const resolveInitialUser = () => {
  const tgUser = extractTelegramUser();
  if (tgUser) {
    return tgUser;
  }
  if (isDemoMode()) {
    return {
      id: 123456789,
      telegram_id: 123456789,
      first_name: 'Демо-Пользователь',
      username: 'demo_user',
      photo_url: null,
      isDemo: true,
      isGuest: false,
    };
  }
  return {
    id: 0,
    telegram_id: 0,
    first_name: 'Гость',
    username: 'guest',
    photo_url: null,
    isGuest: true,
    isDemo: false,
  };
};

export const currentUser = resolveInitialUser();

export const getEffectiveUserId = () => {
  if (currentUser && currentUser.id > 0) return currentUser.id;
  if (currentUser && currentUser.telegram_id > 0) return currentUser.telegram_id;
  const tgUser = extractTelegramUser();
  if (tgUser && tgUser.id > 0) return tgUser.id;
  return 0;
};

export const setAuthSession = (token, user) => {
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('tasker_auth_token', token);
    if (user) {
      const normalizedUser = {
        id: user.telegram_id || user.id,
        telegram_id: user.telegram_id || user.id,
        first_name: user.first_name || '',
        username: user.username || '',
        photo_url: user.photo_url || null,
        isGuest: false,
        isDemo: false,
      };
      localStorage.setItem('tasker_user_profile', JSON.stringify(normalizedUser));
      Object.assign(currentUser, normalizedUser);
    }
    localStorage.removeItem('tasker_demo_mode');
    window.__tasker_is_demo = false;
  }
};

export const clearAuthSession = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('tasker_auth_token');
    if (isInsideTelegram()) {
      const tgUser = extractTelegramUser();
      if (tgUser && tgUser.id > 0) {
        Object.assign(currentUser, tgUser);
        localStorage.setItem('tasker_user_profile', JSON.stringify(currentUser));
        return;
      }
    }
    localStorage.removeItem('tasker_user_profile');
    localStorage.removeItem('tasker_demo_mode');
    window.__tasker_is_demo = false;
    currentUser.id = 0;
    currentUser.telegram_id = 0;
    currentUser.first_name = 'Гость';
    currentUser.username = 'guest';
    currentUser.photo_url = null;
    currentUser.isGuest = true;
    currentUser.isDemo = false;
  }
};

// Automatic Authorization Header injection & 401 handling for all /api calls
if (typeof window !== 'undefined' && window.fetch) {
  const _origFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const urlStr = typeof input === 'string' ? input : input?.url || '';
      if (urlStr.includes('/api')) {
        const token = localStorage.getItem('tasker_auth_token');
        const headers = new Headers(init.headers || (typeof input === 'object' && input.headers ? input.headers : {}));
        if (token && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        const tgInitData = window.Telegram?.WebApp?.initData ||
          (typeof window.location !== 'undefined' && window.location.hash.includes('tgWebAppData') ?
            new URLSearchParams(window.location.hash.slice(1)).get('tgWebAppData') : null);
        if (tgInitData && !headers.has('X-Telegram-Init-Data')) {
          headers.set('X-Telegram-Init-Data', tgInitData);
        }
        const reqInit = { ...init, headers };
        if (!reqInit.credentials) {
          reqInit.credentials = 'include';
        }
        const res = await _origFetch(input, reqInit);
        if (res.status === 401 && !urlStr.includes('/auth/')) {
          console.warn('API returned 401 Unauthorized, clearing stale token');
          clearAuthSession();
          if (tgInitData) {
            authenticateWithTelegramWebApp(tgInitData).catch(() => {});
          }
        }
        return res;
      }
    } catch (_) {}
    return _origFetch(input, init);
  };
}

export const DEFAULT_RENDER_BACKEND =
  import.meta.env.VITE_RENDER_BACKEND_URL || 'https://taskerbot-plp5.onrender.com';

export const getTelegramClientId = () => {
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem('tasker_tg_client_id');
    if (cached && /^\d+$/.test(cached)) return cached;
  }
  return import.meta.env.VITE_TELEGRAM_CLIENT_ID || '8987055615';
};

export const getAppBasePath = () => {
  if (typeof window !== 'undefined') {
    const base = import.meta.env.BASE_URL || '/';
    if (base && base !== '/' && base.length > 1) {
      return base.replace(/\/+$/, '');
    }
    if (window.location.pathname.startsWith('/TaskerBot')) {
      return '/TaskerBot';
    }
  }
  return '';
};

export const getAppHomeUrl = () => {
  const base = getAppBasePath();
  return base ? `${base}/` : '/';
};

export const getDefaultRedirectUri = () => {
  if (typeof window === 'undefined') return '';
  const base = getAppBasePath();
  return `${window.location.origin}${base}/auth/callback`;
};

const toBase64Url = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const buildClientTelegramAuthUrl = async (redirectUri) => {
  const uri = (redirectUri || getDefaultRedirectUri()).trim().replace(/\/+$/, '');
  const verifierBytes = new Uint8Array(48);
  const stateBytes = new Uint8Array(24);
  window.crypto.getRandomValues(verifierBytes);
  window.crypto.getRandomValues(stateBytes);

  const codeVerifier = toBase64Url(verifierBytes);
  const state = toBase64Url(stateBytes);

  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier)
  );
  const codeChallenge = toBase64Url(new Uint8Array(digest));
  const clientId = getTelegramClientId();

  if (typeof window !== 'undefined') {
    sessionStorage.setItem('tg_code_verifier', codeVerifier);
    localStorage.setItem('tg_code_verifier', codeVerifier);
    localStorage.setItem('tg_code_verifier_time', Date.now().toString());
    sessionStorage.setItem('tg_oauth_state', state);
    localStorage.setItem('tg_oauth_state', state);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: uri,
    response_type: 'code',
    scope: 'openid profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    auth_url: `https://oauth.telegram.org/auth?${params.toString()}`,
    state,
    code_verifier: codeVerifier,
    source: 'client_pkce',
  };
};

let _wakePromise = null;

export const wakeBackend = () => {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (_wakePromise) return _wakePromise;

  _wakePromise = (async () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${API_BASE}/health`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store',
        });
        clearTimeout(timer);
        if (res.ok) {
          window.__tasker_server_connected = true;
          const data = await res.json().catch(() => null);
          if (data?.client_id) {
            localStorage.setItem('tasker_tg_client_id', String(data.client_id));
          }
          _wakePromise = null;
          return true;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 3000));
    }
    _wakePromise = null;
    return false;
  })();

  return _wakePromise;
};

export const waitForBackendReady = async ({ maxWaitMs = 55000, onWarmingUp } = {}) => {
  if (typeof window === 'undefined') return true;
  const start = Date.now();
  let notifiedWarming = false;

  while (Date.now() - start < maxWaitMs) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(`${API_BASE}/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        window.__tasker_server_connected = true;
        const data = await res.json().catch(() => null);
        if (data?.client_id) {
          localStorage.setItem('tasker_tg_client_id', String(data.client_id));
        }
        return true;
      }
    } catch (_) {}

    if (!notifiedWarming) {
      notifiedWarming = true;
      if (typeof onWarmingUp === 'function') {
        try {
          onWarmingUp();
        } catch (_) {}
      }
    }
    await new Promise((r) => setTimeout(r, 2200));
  }
  return false;
};

export const getTelegramAuthUrl = async (redirectUri) => {
  const uri = (redirectUri || getDefaultRedirectUri()).trim().replace(/\/+$/, '');
  const url = `${API_BASE}/auth/telegram/url?redirect_uri=${encodeURIComponent(uri)}`;

  // Trigger non-blocking background wake-up immediately
  wakeBackend().catch(() => {});

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2200);
    const res = await fetch(url, {
      credentials: 'include',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (typeof window !== 'undefined') {
        if (data?.code_verifier) {
          sessionStorage.setItem('tg_code_verifier', data.code_verifier);
          localStorage.setItem('tg_code_verifier', data.code_verifier);
          localStorage.setItem('tg_code_verifier_time', Date.now().toString());
        }
        if (data?.state) {
          sessionStorage.setItem('tg_oauth_state', data.state);
          localStorage.setItem('tg_oauth_state', data.state);
        }
      }
      return data;
    }
  } catch (_) {
    // Backend is in cold start — fall back to instant 0ms client-side RFC 7636 PKCE generation
    // while wakeBackend() continues spinning up Render in the background
  }

  return await buildClientTelegramAuthUrl(uri);
};

export const exchangeTelegramAuthCode = async (
  code,
  state,
  redirectUri,
  explicitVerifier,
  onStatusChange
) => {
  const uri = (redirectUri || getDefaultRedirectUri()).trim().replace(/\/+$/, '');
  const url = `${API_BASE}/auth/telegram/exchange`;
  let codeVerifier = explicitVerifier;
  if (!codeVerifier && typeof window !== 'undefined') {
    codeVerifier =
      localStorage.getItem('tg_code_verifier') || sessionStorage.getItem('tg_code_verifier');
  }

  // Gate single-use OAuth authorization code until /api/health confirms container is awake
  await waitForBackendReady({
    maxWaitMs: 60000,
    onWarmingUp: () => {
      if (typeof onStatusChange === 'function') onStatusChange('warming_up');
    },
  });

  if (typeof onStatusChange === 'function') onStatusChange('exchanging');

  let res;
  let lastNetErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          code,
          state,
          redirect_uri: uri,
          code_verifier: codeVerifier || undefined,
        }),
      });
      if (res.status !== 502 && res.status !== 503 && res.status !== 504) {
        break;
      }
    } catch (netErr) {
      lastNetErr = netErr;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }

  if (!res) {
    throw new Error(
      `Не удалось связаться с сервером для обмена токенов: ${lastNetErr?.message || 'сеть недоступна'}`
    );
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Ошибка авторизации через Telegram (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('tg_code_verifier');
    sessionStorage.removeItem('tg_oauth_state');
    localStorage.removeItem('tg_code_verifier');
    localStorage.removeItem('tg_code_verifier_time');
    localStorage.removeItem('tg_oauth_state');
  }
  setAuthSession(data.access_token, data.user);
  return data;
};

export const authenticateWithTelegramWebApp = async (initData) => {
  if (!initData) return null;
  const url = `${API_BASE}/auth/telegram/webapp`;

  await waitForBackendReady({ maxWaitMs: 55000 });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ init_data: initData }),
      });
      if (res.ok) {
        const data = await res.json();
        setAuthSession(data.access_token, data.user);
        return data;
      }
      if (res.status < 500) {
        console.warn(`Telegram WebApp auth returned HTTP ${res.status}`);
        return null;
      }
    } catch (netErr) {
      console.warn('Telegram WebApp auth network error:', netErr);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return null;
};

export const exchangeTelegramWidgetAuth = async (userData) => {
  const url = `${API_BASE}/auth/telegram/widget`;
  await waitForBackendReady({ maxWaitMs: 55000 });
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
  } catch (netErr) {
    throw new Error(`Не удалось связаться с сервером для авторизации: ${netErr.message || 'сеть недоступна'}`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Ошибка авторизации Telegram (HTTP ${res.status})`);
  }
  const data = await res.json();
  setAuthSession(data.access_token, data.user);
  return data;
};

export const authenticateWithTelegramIdToken = async (idToken) => {
  const url = `${API_BASE}/auth/telegram/id-token`;
  await waitForBackendReady({ maxWaitMs: 55000 });
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    });
  } catch (netErr) {
    throw new Error(`Не удалось связаться с сервером для проверки токена: ${netErr.message || 'сеть недоступна'}`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Ошибка верификации токена Telegram (HTTP ${res.status})`);
  }
  const data = await res.json();
  setAuthSession(data.access_token, data.user);
  return data;
};

export const devLogin = async (customId, firstName, username) => {
  const url = `${API_BASE}/auth/dev-login?telegram_id=${customId || 123456789}&first_name=${encodeURIComponent(firstName || 'Разработчик')}&username=${encodeURIComponent(username || 'dev_user')}`;
  await waitForBackendReady({ maxWaitMs: 55000 });
  let res;
  try {
    res = await fetch(url, { method: 'POST' });
  } catch (netErr) {
    throw new Error(`Не удалось связаться с бэкендом для dev-входа: ${netErr.message || 'сеть недоступна'}`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Ошибка dev-входа (HTTP ${res.status})`);
  }
  const data = await res.json();
  setAuthSession(data.access_token, data.user);
  return data;
};

export const getCustomBackendUrl = () => {
  if (typeof window !== 'undefined') {
    // Check URL query param ?api=https://...
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const apiParam = urlParams.get('api') || urlParams.get('backend');
      if (apiParam) {
        localStorage.setItem('tasker_custom_backend', apiParam.trim());
        return apiParam.trim();
      }
    } catch (e) {}
    return localStorage.getItem('tasker_custom_backend') || '';
  }
  return '';
};

export const setCustomBackendUrl = (url) => {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('tasker_custom_backend', url.trim());
    } else {
      localStorage.removeItem('tasker_custom_backend');
    }
  }
};
export const getApiBase = () => {
  if (typeof window !== 'undefined') {
    const custom = getCustomBackendUrl();
    if (custom) {
      return custom.replace(/\/+$/, '') + '/api';
    }
    if (import.meta.env.VITE_API_BASE) {
      return import.meta.env.VITE_API_BASE.replace(/\/+$/, '');
    }
    if (window.location.hostname.endsWith('.github.io')) {
      return `${DEFAULT_RENDER_BACKEND.replace(/\/+$/, '')}/api`;
    }
  }
  return '/api';
};

export const API_BASE = {
  toString() {
    return getApiBase();
  },
};

export const hapticFeedback = (style = 'medium') => {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
    try {
      if (style === 'error' || style === 'success' || style === 'warning') {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred(style);
      } else if (style === 'selection') {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
      } else {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
      }
    } catch (e) {
      // Ignore if not supported in client
    }
  }
};

// ==============================================================================
// SWR (Stale-While-Revalidate) Cache for Instant Loading (0ms UI startup)
// ==============================================================================
export const getCachedDashboard = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`tasker_cache_dashboard_${getEffectiveUserId()}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
};

export const setCachedDashboard = (data) => {
  if (typeof window === 'undefined' || !data) return;
  try {
    localStorage.setItem(`tasker_cache_dashboard_${getEffectiveUserId()}`, JSON.stringify(data));
  } catch (e) {}
};

export const getCachedGoals = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`tasker_cache_goals_${getEffectiveUserId()}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
};

export const setCachedGoals = (data) => {
  if (typeof window === 'undefined' || !data) return;
  try {
    localStorage.setItem(`tasker_cache_goals_${getEffectiveUserId()}`, JSON.stringify(data));
  } catch (e) {}
};

export const getCachedGroceries = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`tasker_cache_groceries_${getEffectiveUserId()}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
};

export const setCachedGroceries = (data) => {
  if (typeof window === 'undefined' || !data) return;
  try {
    localStorage.setItem(`tasker_cache_groceries_${getEffectiveUserId()}`, JSON.stringify(data));
  } catch (e) {}
};

export const getCachedUserSettings = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`tasker_cache_settings_${getEffectiveUserId()}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
};

export const setCachedUserSettings = (data) => {
  if (typeof window === 'undefined' || !data) return;
  try {
    localStorage.setItem(`tasker_cache_settings_${getEffectiveUserId()}`, JSON.stringify(data));
  } catch (e) {}
};

// ==============================================================================
// Pending Sync Queue & Optimistic Mutations Reconciliation Layer
// ==============================================================================
export const getPendingSyncKey = () => `tasker_pending_sync_${getEffectiveUserId()}`;
let lastUserActionTimestamp = 0;
const recentCompletedMutations = new Map(); // key -> { mutation, completedAt }
const RECENT_MUTATION_TTL = 5000; // 5 seconds grace period to prevent stale backend reads

export const recordUserAction = () => {
  lastUserActionTimestamp = Date.now();
};

export const getLastUserActionTime = () => lastUserActionTimestamp;

export const hasActivePendingMutations = () => {
  const queue = getPendingSyncQueue();
  if (queue.length > 0) return true;
  const now = Date.now();
  for (const [key, item] of recentCompletedMutations.entries()) {
    if (now - item.completedAt < RECENT_MUTATION_TTL) {
      return true;
    } else {
      recentCompletedMutations.delete(key);
    }
  }
  return false;
};

export const getPendingSyncQueue = () => {
  if (typeof window === 'undefined') return [];
  try {
    const key = getPendingSyncKey();
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const now = Date.now();
        // Prune pending entries older than 30s to avoid indefinite sync locks
        const valid = parsed.filter((m) => m && m.created_at && (now - m.created_at < 30000));
        if (valid.length !== parsed.length) {
          if (valid.length > 0) {
            localStorage.setItem(key, JSON.stringify(valid));
          } else {
            localStorage.removeItem(key);
          }
        }
        return valid;
      }
    }
  } catch (e) {}
  return [];
};

export const addPendingMutation = (mutation) => {
  if (typeof window === 'undefined' || !mutation) return;
  recordUserAction();
  try {
    const key = getPendingSyncKey();
    const queue = getPendingSyncQueue();
    queue.push({ ...mutation, created_at: Date.now() });
    localStorage.setItem(key, JSON.stringify(queue));
  } catch (e) {}
};

export const removePendingMutation = (mutationId) => {
  if (typeof window === 'undefined' || !mutationId) return;
  try {
    const key = getPendingSyncKey();
    const queue = getPendingSyncQueue();
    const removed = queue.find((m) => m.id === mutationId);
    if (removed) {
      const entityKey = `${removed.type}_${removed.routineId || removed.taskId || removed.itemId || removed.goalId || removed.subtaskId || removed.tempId || removed.id}`;
      recentCompletedMutations.set(entityKey, {
        mutation: removed,
        completedAt: Date.now(),
      });
    }
    const filtered = queue.filter((m) => m.id !== mutationId);
    if (filtered.length > 0) {
      localStorage.setItem(key, JSON.stringify(filtered));
    } else {
      localStorage.removeItem(key);
    }
  } catch (e) {}
};

export const clearPendingSyncQueue = () => {
  if (typeof window === 'undefined') return;
  recentCompletedMutations.clear();
  try {
    localStorage.removeItem(getPendingSyncKey());
  } catch (e) {}
};

export const getAllActiveMutations = () => {
  const now = Date.now();
  for (const [key, item] of recentCompletedMutations.entries()) {
    if (now - item.completedAt >= RECENT_MUTATION_TTL) {
      recentCompletedMutations.delete(key);
    }
  }
  const pending = getPendingSyncQueue();
  const recent = Array.from(recentCompletedMutations.values()).map((item) => item.mutation);
  return [...recent, ...pending];
};

export const reconcileDashboardWithPending = (dash) => {
  if (!dash) return dash;
  const mutations = getAllActiveMutations();
  if (mutations.length === 0) return dash;

  let todayTasks = dash.today_tasks ? [...dash.today_tasks] : [];
  let overdueTasks = dash.overdue_tasks ? [...dash.overdue_tasks] : [];
  let upcomingTasks = dash.upcoming_tasks ? [...dash.upcoming_tasks] : [];
  let routineTasks = dash.routine_tasks ? [...dash.routine_tasks] : [];

  for (const m of mutations) {
    if (m.type === 'toggle_routine') {
      routineTasks = routineTasks.map((r) => {
        if (r.id === m.routineId) {
          const target = r.target_value;
          const nextVal = target ? (m.nextStatus ? target : 0) : r.current_value;
          const currentStreak = r.current_streak || 0;
          let newStreak = currentStreak;
          if (m.nextStatus && !r.is_completed_today) {
            newStreak = currentStreak + 1;
          } else if (!m.nextStatus && r.is_completed_today) {
            newStreak = Math.max(0, currentStreak - 1);
          }
          return {
            ...r,
            is_completed_today: m.nextStatus,
            current_value: nextVal,
            current_streak: newStreak,
            best_streak: Math.max(r.best_streak || 0, newStreak),
          };
        }
        return r;
      });
    } else if (m.type === 'edit_routine') {
      routineTasks = routineTasks.map((r) => (r.id === m.routineId ? { ...r, title: m.title } : r));
    } else if (m.type === 'delete_routine') {
      routineTasks = routineTasks.filter((r) => r.id !== m.routineId);
    } else if (m.type === 'toggle_task') {
      const applyToggle = (t) => {
        if (t.id === m.taskId) {
          const target = t.target_value;
          const nextVal = target ? (m.nextStatus ? target : 0) : t.current_value;
          return {
            ...t,
            is_completed: m.nextStatus,
            current_value: nextVal,
          };
        }
        return t;
      };
      todayTasks = todayTasks.map(applyToggle);
      overdueTasks = overdueTasks.map(applyToggle);
      upcomingTasks = upcomingTasks.map(applyToggle);
    } else if (m.type === 'edit_task') {
      const applyEdit = (t) => (t.id === m.taskId ? { ...t, title: m.title, ...(m.updates || {}) } : t);
      todayTasks = todayTasks.map(applyEdit);
      overdueTasks = overdueTasks.map(applyEdit);
      upcomingTasks = upcomingTasks.map(applyEdit);
    } else if (m.type === 'delete_task') {
      todayTasks = todayTasks.filter((t) => t.id !== m.taskId);
      overdueTasks = overdueTasks.filter((t) => t.id !== m.taskId);
      upcomingTasks = upcomingTasks.filter((t) => t.id !== m.taskId);
    } else if (m.type === 'progress_task') {
      const applyProgress = (t) => {
        if (t.id === m.taskId) {
          const target = t.target_value;
          const val = m.current_value;
          const isDone = target ? val >= target : t.is_completed;
          return {
            ...t,
            current_value: val,
            is_completed: isDone,
          };
        }
        return t;
      };
      todayTasks = todayTasks.map(applyProgress);
      overdueTasks = overdueTasks.map(applyProgress);
      upcomingTasks = upcomingTasks.map(applyProgress);
    } else if (m.type === 'progress_routine') {
      routineTasks = routineTasks.map((r) => {
        if (r.id === m.routineId) {
          const target = r.target_value;
          const val = m.current_value;
          const isDone = target ? val >= target : r.is_completed_today;
          return {
            ...r,
            current_value: val,
            is_completed_today: isDone,
          };
        }
        return r;
      });
    } else if (m.type === 'postpone_task') {
      const moved =
        todayTasks.find((t) => t.id === m.taskId) || overdueTasks.find((t) => t.id === m.taskId);
      todayTasks = todayTasks.filter((t) => t.id !== m.taskId);
      overdueTasks = overdueTasks.filter((t) => t.id !== m.taskId);
      if (moved && m.newDate && !upcomingTasks.some((t) => t.id === m.taskId)) {
        upcomingTasks.push({
          ...moved,
          scheduled_date: m.newDate,
          is_overdue: false,
          overdue_days: 0,
        });
      }
    }
  }

  const completedToday =
    overdueTasks.filter((t) => t.is_completed).length +
    todayTasks.filter((t) => t.is_completed).length +
    routineTasks.filter((r) => r.is_completed_today).length;
  const totalToday = overdueTasks.length + todayTasks.length + routineTasks.length;

  return {
    ...dash,
    today_tasks: todayTasks,
    overdue_tasks: overdueTasks,
    upcoming_tasks: upcomingTasks,
    routine_tasks: routineTasks,
    completed_count: completedToday,
    total_count: totalToday,
  };
};

export const reconcileGoalsWithPending = (goals) => {
  if (!goals || !Array.isArray(goals)) return goals;
  const mutations = getAllActiveMutations();
  if (mutations.length === 0) return goals;

  let updatedGoals = [...goals];

  for (const m of mutations) {
    if (m.type === 'delete_goal') {
      updatedGoals = updatedGoals.filter((g) => g.id !== m.goalId);
    } else if (m.type === 'toggle_goal') {
      updatedGoals = updatedGoals.map((g) => {
        if (g.id === m.goalId) {
          return {
            ...g,
            is_completed: m.nextStatus,
            completed_at: m.nextStatus ? (g.completed_at || new Date().toISOString()) : null,
          };
        }
        return g;
      });
    } else if (m.type === 'toggle_subtask' || m.type === 'toggle_task') {
      const subtaskId = m.subtaskId || m.taskId;
      updatedGoals = updatedGoals.map((g) => {
        const hasSubtask = (g.subtasks || []).some((st) => st.id === subtaskId);
        if (!hasSubtask) return g;
        const newSubtasks = (g.subtasks || []).map((st) =>
          st.id === subtaskId ? { ...st, is_completed: m.nextStatus } : st
        );
        const total = newSubtasks.length;
        const completed = newSubtasks.filter((st) => st.is_completed).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const isDone = total > 0 && completed === total;
        return {
          ...g,
          subtasks: newSubtasks,
          total_subtasks: total,
          completed_subtasks: completed,
          progress_percentage: pct,
          is_completed: isDone,
        };
      });
    } else if (m.type === 'progress_task') {
      const subtaskId = m.taskId;
      updatedGoals = updatedGoals.map((g) => {
        const hasSubtask = (g.subtasks || []).some((st) => st.id === subtaskId);
        if (!hasSubtask) return g;
        const newSubtasks = (g.subtasks || []).map((st) => {
          if (st.id === subtaskId) {
            const target = st.target_value;
            const val = m.current_value;
            const isDone = target ? val >= target : st.is_completed;
            return { ...st, current_value: val, is_completed: isDone };
          }
          return st;
        });
        const total = newSubtasks.length;
        const completed = newSubtasks.filter((st) => st.is_completed).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const isDone = total > 0 && completed === total;
        return {
          ...g,
          subtasks: newSubtasks,
          total_subtasks: total,
          completed_subtasks: completed,
          progress_percentage: pct,
          is_completed: isDone,
        };
      });
    } else if (m.type === 'delete_task' || m.type === 'delete_subtask') {
      const subtaskId = m.subtaskId || m.taskId;
      updatedGoals = updatedGoals.map((g) => {
        const hasSubtask = (g.subtasks || []).some((st) => st.id === subtaskId);
        if (!hasSubtask) return g;
        const newSubtasks = (g.subtasks || []).filter((st) => st.id !== subtaskId);
        const total = newSubtasks.length;
        const completed = newSubtasks.filter((st) => st.is_completed).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const isDone = total > 0 && completed === total;
        return {
          ...g,
          subtasks: newSubtasks,
          total_subtasks: total,
          completed_subtasks: completed,
          progress_percentage: pct,
          is_completed: isDone,
        };
      });
    }
  }

  return updatedGoals;
};

export const reconcileGroceriesWithPending = (groceries) => {
  if (!groceries) return groceries;
  const mutations = getAllActiveMutations();
  if (mutations.length === 0) return groceries;

  let active = groceries.active_items ? [...groceries.active_items] : [];
  let completed = groceries.completed_items ? [...groceries.completed_items] : [];

  for (const m of mutations) {
    if (m.type === 'toggle_grocery') {
      if (m.is_completed) {
        const idx = active.findIndex((i) => i.id === m.itemId);
        if (idx !== -1) {
          const item = { ...active[idx], is_completed: true, completed_at: new Date().toISOString() };
          active.splice(idx, 1);
          if (!completed.some((i) => i.id === m.itemId)) {
            completed.unshift(item);
          }
        }
      } else {
        const idx = completed.findIndex((i) => i.id === m.itemId);
        if (idx !== -1) {
          const item = { ...completed[idx], is_completed: false, completed_at: null };
          completed.splice(idx, 1);
          if (!active.some((i) => i.id === m.itemId)) {
            active.unshift(item);
          }
        }
      }
    } else if (m.type === 'edit_grocery') {
      active = active.map((i) => (i.id === m.itemId ? { ...i, title: m.title } : i));
      completed = completed.map((i) => (i.id === m.itemId ? { ...i, title: m.title } : i));
    } else if (m.type === 'delete_grocery') {
      active = active.filter((i) => i.id !== m.itemId);
      completed = completed.filter((i) => i.id !== m.itemId);
    }
  }

  return {
    ...groceries,
    active_items: active,
    completed_items: completed,
    completed_count: completed.length,
    total_count: active.length + completed.length,
  };
};

// ==============================================================================
// Local Fallback Storage (Enables 100% functional Demo Mode on GitHub Pages)
// ==============================================================================
const LOCAL_STORAGE_KEY = 'tasker_local_db_v2';

const getLocalDb = () => {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
  }
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  return {
    tasks: [
      {
        id: 1,
        title: 'Запустить личного ассистента в Telegram',
        category: 'one_time',
        priority: 'high',
        is_completed: false,
        scheduled_date: yesterday,
        created_at: new Date().toISOString(),
      },
      {
        id: 2,
        title: 'Протестировать добавление задач и целей',
        category: 'one_time',
        priority: 'medium',
        is_completed: false,
        scheduled_date: todayStr,
        created_at: new Date().toISOString(),
      },
    ],
    routines: [
      {
        id: 101,
        title: 'Утренняя зарядка и стакан воды',
        is_completed_today: true,
        current_streak: 5,
        best_streak: 14,
      },
      {
        id: 102,
        title: 'Чтение профильной литературы 20 мин',
        is_completed_today: false,
        current_streak: 3,
        best_streak: 8,
      },
    ],
    goals: [
      {
        id: 201,
        title: 'Запуск TaskerBot в продакшн',
        description: 'Развернуть бэкенд на сервере и подключить к Telegram',
        target_date: '2026-11-01',
        progress: 67,
        subtasks: [
          { id: 301, title: 'Опубликовать WebApp на GitHub Pages', is_completed: true },
          { id: 302, title: 'Развернуть бэкенд на Render / VPS', is_completed: false },
          { id: 303, title: 'Привязать кнопку к боту @BotFather', is_completed: false },
        ],
      },
    ],
    settings: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
      day_end_time: '00:00',
      reminder_6h_enabled: true,
      reminder_3h_enabled: true,
      reminder_1h_enabled: true,
      praise_notifications_enabled: true,
      morning_digest_enabled: true,
      morning_digest_time: '09:00',
      evening_digest_enabled: true,
      ai_provider: 'groq',
      theme_mode: 'auto',
      theme_schedule_enabled: false,
      theme_schedule_start: '07:00',
      theme_schedule_end: '20:00',
    },
  };
};

const saveLocalDb = (db) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
    } catch (e) {}
  }
};

export const isDemoModeActive = () => {
  if (typeof window !== 'undefined') {
    return Boolean(window.__tasker_is_demo);
  }
  return false;
};

// ==============================================================================
// API Methods with seamless Offline/Demo Fallback
// ==============================================================================

export const syncUserTimezone = async () => {
  try {
    const effectiveUserId = getEffectiveUserId();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
    await fetch(
      `${API_BASE}/user/sync?telegram_id=${effectiveUserId}&timezone=${encodeURIComponent(
        tz
      )}&first_name=${encodeURIComponent(currentUser.first_name || '')}&username=${encodeURIComponent(
        currentUser.username || ''
      )}`,
      { method: 'POST' }
    );
  } catch (e) {
    // Ignore timezone sync errors on static demo
  }
};

export const calculateDayEndAndUrgency = (dayEndTimeStr = '00:00') => {
  const now = new Date();
  let [endHour, endMinute] = (dayEndTimeStr || '00:00').split(':').map((s) => parseInt(s, 10));
  if (isNaN(endHour)) endHour = 0;
  if (isNaN(endMinute)) endMinute = 0;

  let target = new Date(now);
  if (endHour === 0 && endMinute === 0) {
    target.setHours(23, 59, 59, 999);
  } else {
    target.setHours(endHour, endMinute, 0, 0);
    if (now >= target) {
      target.setDate(target.getDate() + 1);
    }
  }

  const diffMs = Math.max(0, target.getTime() - now.getTime());
  const hoursLeft = diffMs / (1000 * 60 * 60);

  let urgency = 'normal';
  if (hoursLeft <= 1) urgency = 'critical_1h';
  else if (hoursLeft <= 3) urgency = 'warning_3h';
  else if (hoursLeft <= 6) urgency = 'warning_6h';

  return { hours_left_in_day: hoursLeft, urgency_level: urgency };
};

export const fetchDashboard = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const effectiveUserId = getEffectiveUserId();
    const headers = {};
    const tgInitData =
      (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) ||
      (typeof window !== 'undefined' && window.location.hash.includes('tgWebAppData')
        ? new URLSearchParams(window.location.hash.slice(1)).get('tgWebAppData')
        : null);
    if (tgInitData) {
      headers['X-Telegram-Init-Data'] = tgInitData;
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('tasker_auth_token') : null;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(
      `${API_BASE}/dashboard/today?telegram_id=${effectiveUserId}&first_name=${encodeURIComponent(
        currentUser.first_name || ''
      )}`,
      { signal: controller.signal, headers }
    );
    clearTimeout(timeoutId);
    if (res.ok) {
      if (typeof window !== 'undefined') {
        window.__tasker_is_demo = false;
        window.__tasker_server_connected = true;
      }
      const data = await res.json();
      if (data?.day_end_time) {
        const cachedSettings = getCachedUserSettings() || {};
        if (cachedSettings.day_end_time !== data.day_end_time) {
          setCachedUserSettings({ ...cachedSettings, day_end_time: data.day_end_time });
        }
      }
      const reconciled = reconcileDashboardWithPending(data);
      setCachedDashboard(reconciled);
      return reconciled;
    }
  } catch (e) {
    // Backend may be waking up or offline
  }

  // Preserve user cache if available! Never overwrite with mock demo tasks on network error
  const cached = getCachedDashboard();
  if (cached) {
    return cached;
  }

  if (typeof window !== 'undefined') window.__tasker_is_demo = true;
  const db = getLocalDb();
  const todayStr = new Date().toISOString().split('T')[0];

  const overdue = db.tasks.filter((t) => !t.is_completed && t.scheduled_date && t.scheduled_date < todayStr);
  const today = db.tasks.filter((t) => t.scheduled_date === todayStr || (!t.scheduled_date && !t.is_completed));
  const upcoming = db.tasks.filter((t) => !t.is_completed && t.scheduled_date && t.scheduled_date > todayStr);
  const completedToday =
    today.filter((t) => t.is_completed).length + db.routines.filter((r) => r.is_completed_today).length;
  const totalToday = today.length + db.routines.length;

  const dayEndTime = db.settings?.day_end_time || '00:00';
  const { hours_left_in_day, urgency_level } = calculateDayEndAndUrgency(dayEndTime);
  const hours = Math.floor(hours_left_in_day);
  const mins = Math.round((hours_left_in_day % 1) * 60);

  const fallbackData = {
    today_formatted: new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date()),
    day_end_time: dayEndTime,
    hours_left_in_day,
    urgency_level,
    time_remaining_str: `${hours} ч ${mins} м до сброса`,
    overdue_tasks: overdue,
    routine_tasks: db.routines,
    today_tasks: today,
    upcoming_tasks: upcoming,
    completed_count: completedToday,
    total_count: totalToday,
    current_streak: 5,
    is_demo: true,
  };
  const reconciledFallback = reconcileDashboardWithPending(fallbackData);
  if (isDemoModeActive()) {
    setCachedDashboard(reconciledFallback);
  }
  return reconciledFallback;
};

export const fetchGoals = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const effectiveUserId = getEffectiveUserId();
    const res = await fetch(`${API_BASE}/goals?telegram_id=${effectiveUserId}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      if (typeof window !== 'undefined') window.__tasker_server_connected = true;
      const data = await res.json();
      const reconciled = reconcileGoalsWithPending(data);
      setCachedGoals(reconciled);
      return reconciled;
    }
  } catch (e) {}

  const cached = getCachedGoals();
  if (cached) {
    return cached;
  }

  const db = getLocalDb();
  const goals = db.goals || [];
  const reconciled = reconcileGoalsWithPending(goals);
  if (isDemoModeActive()) {
    setCachedGoals(reconciled);
  }
  return reconciled;
};

export const fetchGroceries = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const effectiveUserId = getEffectiveUserId();
    const res = await fetch(`${API_BASE}/groceries?telegram_id=${effectiveUserId}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      if (typeof window !== 'undefined') window.__tasker_server_connected = true;
      const data = await res.json();
      const reconciled = reconcileGroceriesWithPending(data);
      setCachedGroceries(reconciled);
      return reconciled;
    }
  } catch (e) {}

  const cached = getCachedGroceries();
  if (cached) {
    return cached;
  }

  const db = getLocalDb();
  const groceries = db.groceries || { active_items: [], completed_items: [], total_count: 0, completed_count: 0 };
  const reconciled = reconcileGroceriesWithPending(groceries);
  if (isDemoModeActive()) {
    setCachedGroceries(reconciled);
  }
  return reconciled;
};

export const createGroceryItem = async (groceryData) => {
  hapticFeedback('light');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/groceries?telegram_id=${effectiveUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(groceryData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  if (!db.groceries) db.groceries = { active_items: [], completed_items: [], total_count: 0, completed_count: 0 };
  const newItem = {
    id: Date.now(),
    user_id: effectiveUserId,
    title: groceryData.title,
    target_value: groceryData.target_value || null,
    current_value: 0,
    step: groceryData.step || 1.0,
    unit: groceryData.unit || null,
    is_completed: false,
    created_at: new Date().toISOString(),
  };
  db.groceries.active_items.unshift(newItem);
  db.groceries.total_count += 1;
  saveLocalDb(db);
  setCachedGroceries(db.groceries);
  return newItem;
};

export const updateGroceryItem = async (itemId, updateData) => {
  hapticFeedback('light');
  recordUserAction();
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/groceries/${itemId}?telegram_id=${effectiveUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    });
    if (res.ok) return await res.json();
    if (res.status >= 400 && typeof window !== 'undefined' && window.__tasker_is_demo === false) {
      throw new Error(`Failed to update grocery item: HTTP ${res.status}`);
    }
  } catch (e) {
    if (typeof window !== 'undefined' && window.__tasker_is_demo === false) {
      throw e;
    }
  }

  const db = getLocalDb();
  if (!db.groceries) db.groceries = { active_items: [], completed_items: [], total_count: 0, completed_count: 0 };
  let found = db.groceries.active_items.find((i) => i.id === itemId);
  if (!found) found = db.groceries.completed_items.find((i) => i.id === itemId);
  if (found) {
    Object.assign(found, updateData);
    if (updateData.is_completed !== undefined) {
      if (updateData.is_completed) {
        db.groceries.active_items = db.groceries.active_items.filter((i) => i.id !== itemId);
        if (!db.groceries.completed_items.some((i) => i.id === itemId)) {
          db.groceries.completed_items.unshift(found);
        }
      } else {
        db.groceries.completed_items = db.groceries.completed_items.filter((i) => i.id !== itemId);
        if (!db.groceries.active_items.some((i) => i.id === itemId)) {
          db.groceries.active_items.unshift(found);
        }
      }
      db.groceries.completed_count = db.groceries.completed_items.length;
    }
    saveLocalDb(db);
    setCachedGroceries(db.groceries);
    return found;
  }
  return { id: itemId, ...updateData };
};

export const deleteGroceryItem = async (itemId) => {
  hapticFeedback('medium');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/groceries/${itemId}?telegram_id=${effectiveUserId}`, {
      method: 'DELETE',
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  if (db.groceries) {
    db.groceries.active_items = (db.groceries.active_items || []).filter((i) => i.id !== itemId);
    db.groceries.completed_items = (db.groceries.completed_items || []).filter((i) => i.id !== itemId);
    db.groceries.total_count = db.groceries.active_items.length + db.groceries.completed_items.length;
    db.groceries.completed_count = db.groceries.completed_items.length;
    saveLocalDb(db);
    setCachedGroceries(db.groceries);
  }
  return { status: 'deleted' };
};

export const clearCompletedGroceries = async () => {
  hapticFeedback('medium');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/groceries/clear-completed?telegram_id=${effectiveUserId}`, {
      method: 'POST',
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  if (db.groceries) {
    db.groceries.completed_items = [];
    db.groceries.completed_count = 0;
    db.groceries.total_count = db.groceries.active_items.length;
    saveLocalDb(db);
    setCachedGroceries(db.groceries);
  }
  return { status: 'cleared' };
};


export const fetchUserSettings = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const effectiveUserId = getEffectiveUserId();
    const res = await fetch(`${API_BASE}/user/me?telegram_id=${effectiveUserId}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      if (typeof window !== 'undefined') window.__tasker_server_connected = true;
      const data = await res.json();
      setCachedUserSettings(data);
      return data;
    }
  } catch (e) {}

  const cached = getCachedUserSettings();
  if (cached) {
    return cached;
  }

  const db = getLocalDb();
  return db.settings || {};
};

export const updateUserSettings = async (settingsData) => {
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/user/settings?telegram_id=${effectiveUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsData),
    });
    if (res.ok) {
      const data = await res.json();
      setCachedUserSettings(data);
      return data;
    }
  } catch (e) {}

  const db = getLocalDb();
  db.settings = { ...db.settings, ...settingsData };
  saveLocalDb(db);
  setCachedUserSettings(db.settings);
  return db.settings;
};

export const sendTestNotification = async () => {
  hapticFeedback('medium');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/notifications/test?telegram_id=${effectiveUserId}`, {
      method: 'POST',
    });
    if (res.ok) return await res.json();
    const data = await res.json().catch(() => ({}));
    return { error: data.detail || 'Не удалось отправить тестовое уведомление' };
  } catch (e) {
    return { error: e.message || 'Ошибка сети при отправке уведомления' };
  }
};


export const toggleTask = async (taskId, completed = null) => {
  hapticFeedback('light');
  recordUserAction();
  const effectiveUserId = getEffectiveUserId();
  try {
    const url = `${API_BASE}/tasks/${taskId}/toggle?telegram_id=${effectiveUserId}${
      completed !== null ? `&completed=${completed}` : ''
    }`;
    const res = await fetch(url, { method: 'PATCH' });
    if (res.ok) return await res.json();
    if (res.status >= 400 && typeof window !== 'undefined' && window.__tasker_is_demo === false) {
      throw new Error(`Failed to toggle task: HTTP ${res.status}`);
    }
  } catch (e) {
    if (typeof window !== 'undefined' && window.__tasker_is_demo === false) {
      throw e;
    }
  }

  const db = getLocalDb();
  const task = db.tasks.find((t) => t.id === taskId);
  if (task) {
    task.is_completed = completed !== null ? completed : !task.is_completed;
    saveLocalDb(db);
    return task;
  }
  return { id: taskId, is_completed: true };
};

export const postponeTask = async (taskId, newDateStr) => {
  hapticFeedback('medium');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(
      `${API_BASE}/tasks/${taskId}/postpone?telegram_id=${effectiveUserId}&new_date=${newDateStr}`,
      { method: 'PATCH' }
    );
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const task = db.tasks.find((t) => t.id === taskId);
  if (task) {
    task.scheduled_date = newDateStr;
    saveLocalDb(db);
    return task;
  }
  return { id: taskId, scheduled_date: newDateStr };
};

export const deleteTask = async (taskId) => {
  hapticFeedback('warning');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}?telegram_id=${effectiveUserId}`, {
      method: 'DELETE',
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  db.tasks = db.tasks.filter((t) => t.id !== taskId);
  saveLocalDb(db);
  return { success: true };
};

export const createTask = async (taskData) => {
  hapticFeedback('success');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/tasks?telegram_id=${effectiveUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const newTask = {
    id: Date.now(),
    title: taskData.title,
    category: taskData.category || 'one_time',
    goal_id: taskData.goal_id || null,
    goal_title: taskData.goal_title || null,
    priority: taskData.priority || 0,
    scheduled_date: taskData.scheduled_date || new Date().toISOString().split('T')[0],
    scheduled_time: taskData.scheduled_time || null,
    target_value: taskData.target_value || null,
    current_value: 0.0,
    step: taskData.step || 1.0,
    unit: taskData.unit || null,
    is_completed: false,
    created_at: new Date().toISOString(),
  };
  db.tasks.unshift(newTask);
  saveLocalDb(db);
  return newTask;
};

export const updateTask = async (taskId, updateData) => {
  hapticFeedback('selection');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}?telegram_id=${effectiveUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const task = db.tasks.find((t) => t.id === taskId);
  if (task) {
    Object.assign(task, updateData);
    saveLocalDb(db);
    return task;
  }
  return { id: taskId, ...updateData };
};

export const updateTaskProgress = async (taskId, { current_value, delta }) => {
  hapticFeedback('light');
  recordUserAction();
  if (!currentUser.id || currentUser.id <= 0) syncTelegramUser();
  const effectiveUserId = getEffectiveUserId();
  const mutationId = `progress_task_${taskId}_${Date.now()}`;
  if (current_value !== undefined) {
    addPendingMutation({ id: mutationId, type: 'progress_task', taskId, current_value, timestamp: Date.now() });
  }
  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/progress?telegram_id=${effectiveUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_value, delta }),
    });
    if (res.ok) {
      if (current_value !== undefined) removePendingMutation(mutationId);
      return await res.json();
    }
  } catch (e) {}

  // DO NOT remove pendingMutation if !res.ok, keeping optimistic value shielded until backend sync
  const db = getLocalDb();
  const task = db.tasks.find((t) => String(t.id) === String(taskId));
  if (task) {
    let newVal = task.current_value || 0;
    if (current_value !== undefined) newVal = current_value;
    else if (delta !== undefined) newVal += delta;
    newVal = Math.max(0, Math.round(newVal * 100) / 100);
    task.current_value = newVal;
    if (task.target_value && newVal >= task.target_value) {
      task.is_completed = true;
    } else if (task.target_value && newVal < task.target_value) {
      task.is_completed = false;
    }
    saveLocalDb(db);
    return task;
  }
  return { id: taskId, current_value };
};

export const updateRoutine = async (routineId, updateData) => {
  hapticFeedback('selection');
  recordUserAction();
  if (!currentUser.id || currentUser.id <= 0) syncTelegramUser();
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/routines/${routineId}?telegram_id=${effectiveUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const r = db.routines.find((item) => String(item.id) === String(routineId));
  if (r) {
    Object.assign(r, updateData);
    saveLocalDb(db);
    return r;
  }
  return { id: routineId, ...updateData };
};

export const updateRoutineProgress = async (routineId, { current_value, delta }) => {
  hapticFeedback('light');
  recordUserAction();
  if (!currentUser.id || currentUser.id <= 0) syncTelegramUser();
  const effectiveUserId = getEffectiveUserId();
  const mutationId = `progress_routine_${routineId}_${Date.now()}`;
  if (current_value !== undefined) {
    addPendingMutation({ id: mutationId, type: 'progress_routine', routineId, current_value, timestamp: Date.now() });
  }
  try {
    const res = await fetch(`${API_BASE}/routines/${routineId}/progress?telegram_id=${effectiveUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_value, delta }),
    });
    if (res.ok) {
      if (current_value !== undefined) removePendingMutation(mutationId);
      return await res.json();
    }
  } catch (e) {}

  // DO NOT remove pendingMutation if !res.ok, keeping optimistic value shielded until backend sync
  const db = getLocalDb();
  const r = db.routines.find((item) => String(item.id) === String(routineId));
  if (r) {
    let newVal = r.current_value || 0;
    if (current_value !== undefined) newVal = current_value;
    else if (delta !== undefined) newVal += delta;
    newVal = Math.max(0, Math.round(newVal * 100) / 100);
    r.current_value = newVal;
    if (r.target_value && newVal >= r.target_value) {
      r.is_completed_today = true;
    } else if (r.target_value && newVal < r.target_value) {
      r.is_completed_today = false;
    }
    saveLocalDb(db);
    return r;
  }
  return { id: routineId, current_value };
};

export const toggleRoutine = async (routineId, completed = null) => {
  hapticFeedback('light');
  recordUserAction();
  const effectiveUserId = getEffectiveUserId();
  try {
    const url = `${API_BASE}/routines/${routineId}/toggle?telegram_id=${effectiveUserId}${
      completed !== null ? `&completed=${completed}` : ''
    }`;
    const res = await fetch(url, { method: 'PATCH' });
    if (res.ok) return await res.json();
    if (res.status >= 400 && typeof window !== 'undefined' && window.__tasker_is_demo === false) {
      throw new Error(`Failed to toggle routine: HTTP ${res.status}`);
    }
  } catch (e) {
    if (typeof window !== 'undefined' && window.__tasker_is_demo === false) {
      throw e;
    }
  }

  const db = getLocalDb();
  const r = db.routines.find((item) => item.id === routineId);
  if (r) {
    const newState = completed !== null ? completed : !r.is_completed_today;
    r.is_completed_today = newState;
    if (newState) {
      r.current_streak = (r.current_streak || 0) + 1;
      if (r.current_streak > (r.best_streak || 0)) r.best_streak = r.current_streak;
    } else {
      r.current_streak = Math.max(0, (r.current_streak || 1) - 1);
    }
    saveLocalDb(db);
    return r;
  }
  return { id: routineId, is_completed_today: true };
};

export const deleteRoutine = async (routineId) => {
  hapticFeedback('warning');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/routines/${routineId}?telegram_id=${effectiveUserId}`, {
      method: 'DELETE',
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  db.routines = db.routines.filter((r) => r.id !== routineId);
  saveLocalDb(db);
  return { success: true };
};

export const createRoutine = async (routineData) => {
  hapticFeedback('success');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/routines?telegram_id=${effectiveUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(routineData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const newRoutine = {
    id: Date.now(),
    title: routineData.title,
    target_value: routineData.target_value || null,
    current_value: 0.0,
    step: routineData.step || 1.0,
    unit: routineData.unit || null,
    frequency_type: routineData.frequency_type || 'daily',
    interval_days: routineData.interval_days || 1,
    days_of_week: routineData.days_of_week || null,
    start_date: routineData.start_date || null,
    is_completed_today: false,
    current_streak: 0,
    best_streak: 0,
  };
  db.routines.unshift(newRoutine);
  saveLocalDb(db);
  return newRoutine;
};

export const createGoal = async (goalData) => {
  hapticFeedback('success');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/goals?telegram_id=${effectiveUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goalData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const newGoal = {
    id: Date.now(),
    title: goalData.title,
    description: goalData.description || '',
    target_date: goalData.target_date || null,
    progress: 0,
    subtasks: [],
  };
  db.goals.unshift(newGoal);
  saveLocalDb(db);
  return newGoal;
};

export const addGoalSubtask = async (goalId, title, scheduledDate = null, scheduledTime = null) => {
  hapticFeedback('light');
  const effectiveUserId = getEffectiveUserId();
  try {
    let url = `${API_BASE}/goals/${goalId}/subtasks?telegram_id=${effectiveUserId}&title=${encodeURIComponent(
      title
    )}`;
    if (scheduledDate) {
      url += `&scheduled_date=${scheduledDate}`;
    }
    if (scheduledTime) {
      url += `&scheduled_time=${encodeURIComponent(scheduledTime)}`;
    }
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const goal = db.goals.find((g) => g.id === goalId);
  if (goal) {
    if (!goal.subtasks) goal.subtasks = [];
    const newSubtask = {
      id: Date.now(),
      title,
      is_completed: false,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      goal_id: goalId,
    };
    goal.subtasks.push(newSubtask);
    saveLocalDb(db);
    return newSubtask;
  }
  return { id: Date.now(), title, is_completed: false, goal_id: goalId };
};

export const toggleGoal = async (goalId, isCompleted = null) => {
  hapticFeedback('medium');
  recordUserAction();
  const effectiveUserId = getEffectiveUserId();
  try {
    let url = `${API_BASE}/goals/${goalId}/toggle?telegram_id=${effectiveUserId}`;
    if (isCompleted !== null && isCompleted !== undefined) {
      url += `&completed=${isCompleted}`;
    }
    const res = await fetch(url, { method: 'PATCH' });
    if (res.ok) return await res.json();
    if (res.status >= 400 && typeof window !== 'undefined' && window.__tasker_is_demo === false) {
      throw new Error(`Failed to toggle goal: HTTP ${res.status}`);
    }
  } catch (e) {
    if (typeof window !== 'undefined' && window.__tasker_is_demo === false) {
      throw e;
    }
  }

  const db = getLocalDb();
  const goal = (db.goals || []).find((g) => g.id === goalId);
  if (goal) {
    goal.is_completed = isCompleted !== null ? isCompleted : !goal.is_completed;
    goal.completed_at = goal.is_completed ? new Date().toISOString() : null;
    if (goal.is_completed && goal.subtasks) {
      goal.subtasks.forEach((st) => {
        st.is_completed = true;
      });
    }
    saveLocalDb(db);
    return goal;
  }
  return { success: true };
};

export const deleteGoal = async (goalId) => {
  hapticFeedback('warning');
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/goals/${goalId}?telegram_id=${effectiveUserId}`, {
      method: 'DELETE',
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  db.goals = db.goals.filter((g) => g.id !== goalId);
  saveLocalDb(db);
  return { success: true };
};

export const getGeminiKey = () => {
  if (typeof window !== 'undefined') {
    return (
      localStorage.getItem('tasker_gemini_key') ||
      import.meta.env.VITE_GEMINI_API_KEY ||
      import.meta.env.GEMINI_API_KEY ||
      ''
    );
  }
  return '';
};

export const setGeminiKey = (key) => {
  if (typeof window !== 'undefined') {
    if (key && key.trim()) localStorage.setItem('tasker_gemini_key', key.trim());
    else localStorage.removeItem('tasker_gemini_key');
  }
};

export const getGroqKey = () => {
  if (typeof window !== 'undefined') {
    return (
      localStorage.getItem('tasker_groq_key') ||
      import.meta.env.VITE_GROQ_API_KEY ||
      import.meta.env.GROQ_API_KEY ||
      ''
    );
  }
  return '';
};

export const setGroqKey = (key) => {
  if (typeof window !== 'undefined') {
    if (key && key.trim()) localStorage.setItem('tasker_groq_key', key.trim());
    else localStorage.removeItem('tasker_groq_key');
  }
};

export const getOpenRouterKey = () => {
  if (typeof window !== 'undefined') {
    return (
      localStorage.getItem('tasker_openrouter_key') ||
      import.meta.env.VITE_OPENROUTER_API_KEY ||
      import.meta.env.OPENROUTER_API_KEY ||
      ''
    );
  }
  return '';
};

export const setOpenRouterKey = (key) => {
  if (typeof window !== 'undefined') {
    if (key && key.trim()) localStorage.setItem('tasker_openrouter_key', key.trim());
    else localStorage.removeItem('tasker_openrouter_key');
  }
};

export const fetchAIProviders = async () => {
  const effectiveUserId = getEffectiveUserId();
  try {
    const res = await fetch(`${API_BASE}/ai/providers?telegram_id=${effectiveUserId}`);
    if (res.ok) return await res.json();
  } catch (e) {}

  return {
    active_provider: 'auto',
    providers: [
      { id: 'auto', name: 'Auto-Fast Cascade (Рекомендуется)', is_default: true },
      { id: 'groq', name: 'Groq LPU (Llama & Whisper)', is_default: false },
      { id: 'openrouter', name: 'OpenRouter Free Models', is_default: false },
      { id: 'gemini', name: 'Google Gemini (3.8 Flash / 3.5 Flash-Lite)', is_default: false },
    ],
  };
};

export const GEMINI_MODELS = [
  'gemini-flash-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
];

export const GROQ_CHAT_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
];

export const OPENROUTER_FREE_MODELS = [
  'liquid/lfm-2.5-2.6b:free',
  'openrouter/free',
  'dots-studio/dots-3-note-preview:free',
  'nvidia/nemotron-3.5-lightning:free',
];

export const capitalizeFirst = (text) => {
  if (!text || typeof text !== 'string') return text || '';
  const s = text.trim();
  if (!s) return s;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch.toLowerCase() !== ch.toUpperCase()) {
      return s.slice(0, i) + ch.toUpperCase() + s.slice(i + 1);
    }
    if (/\d/.test(ch)) {
      return s;
    }
    if (!/['"«“‘`(\[]/.test(ch)) {
      return s;
    }
  }
  return s;
};

export const GROCERY_KEYWORDS = [
  'молок[оае]?', 'сливк[\\p{L}]*', 'кефир[\\p{L}]*', 'творог[\\p{L}]*', 'йогурт[\\p{L}]*', 'сметан[\\p{L}]*', 'сыр[\\p{L}]*', 'масл[\\p{L}]*',
  'хлеб[\\p{L}]*', 'батон[\\p{L}]*', 'булк[\\p{L}]*', 'лаваш[\\p{L}]*', 'выпечк[\\p{L}]*',
  'яйц[\\p{L}]*',
  'мяс[\\p{L}]*', 'куриц[\\p{L}]*', 'говядин[\\p{L}]*', 'свинин[\\p{L}]*', 'индейк[\\p{L}]*', 'фарш[\\p{L}]*', 'сосиск[\\p{L}]*', 'колбас[\\p{L}]*', 'ветчин[\\p{L}]*', 'бекон[\\p{L}]*',
  'рыб[\\p{L}]*', 'лосос[\\p{L}]*', 'форел[\\p{L}]*', 'селедк[\\p{L}]*', 'тун[ец][\\p{L}]*', 'креветк[\\p{L}]*',
  'овощ[\\p{L}]*', 'помидор[\\p{L}]*', 'огурц[\\p{L}]*', 'карто[фш][\\p{L}]*', 'морков[\\p{L}]*', 'лук', 'чеснок[\\p{L}]*', 'капуст[\\p{L}]*', 'свекл[\\p{L}]*', 'кабач[\\p{L}]*', 'баклажан[\\p{L}]*', 'перец[\\p{L}]*', 'зелен[\\p{L}]*', 'укроп[\\p{L}]*', 'петрушк[\\p{L}]*', 'салат[\\p{L}]*', 'шпинат[\\p{L}]*', 'броккол[\\p{L}]*', 'авокадо', 'гриб[\\p{L}]*', 'шампиньон[\\p{L}]*',
  'фрукт[\\p{L}]*', 'яблок[\\p{L}]*', 'банан[\\p{L}]*', 'апельсин[\\p{L}]*', 'мандарин[\\p{L}]*', 'лимон[\\p{L}]*', 'груш[\\p{L}]*', 'виноград[\\p{L}]*', 'персик[\\p{L}]*', 'ягод[\\p{L}]*', 'клубник[\\p{L}]*', 'малин[\\p{L}]*', 'черник[\\p{L}]*',
  'круп[\\p{L}]*', 'рис', 'гречк[\\p{L}]*', 'макарон[\\p{L}]*', 'спагетт[\\p{L}]*', 'паст[аеу]', 'овсянк[\\p{L}]*', 'хлопь[\\p{L}]*', 'мук[аеу]', 'сахар[\\p{L}]*', 'сол[ьи]',
  'кетчуп[\\p{L}]*', 'майонез[\\p{L}]*', 'соус[\\p{L}]*', 'пицц[\\p{L}]*',
  'чай', 'кофе', 'сок', 'вод[аеуы]', 'минералк[\\p{L}]*', 'газировк[\\p{L}]*', 'квас[\\p{L}]*', 'лимонад[\\p{L}]*', 'пив[оа]', 'вин[оа]',
  'шоколад[\\p{L}]*', 'печень[\\p{L}]*', 'конфет[\\p{L}]*', 'торт[\\p{L}]*', 'вафл[\\p{L}]*', 'мед', 'орех[\\p{L}]*', 'чипс[\\p{L}]*',
  'порошок[\\p{L}]*', 'мыл[оа]', 'шампун[\\p{L}]*', 'гель\\s+для\\s+душа', 'зубн[\\p{L}]*\\s+паст[\\p{L}]*', 'зубн[\\p{L}]*\\s+щетк[\\p{L}]*', 'туалетн[\\p{L}]*\\s+бумаг[\\p{L}]*', 'салфетк[\\p{L}]*', 'губк[\\p{L}]*\\s+для\\s+посуды', 'моющее', 'мусорн[\\p{L}]*\\s+пакет[\\p{L}]*', 'пакет[\\p{L}]*\\s+для\\s+мусора', 'батарейк[\\p{L}]*', 'корм[\\p{L}]*',
  'продукт[\\p{L}]*', 'покупк[\\p{L}]*'
].join('|');

export const GROCERY_RE = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${GROCERY_KEYWORDS})(?=[^\\p{L}\\p{N}]|$)`, 'iu');

export const CLEAN_GROCERY_PREFIX_RE = new RegExp(
  '^(?:купить|докупить|взять|приобрести|заказать|захватить)' +
  '(?:\\s+(?:в\\s+магазине|в\\s+супермаркете|домой|к\\s+чаю|в\\s+список\\s+(?:продуктов|покупок)))?\\s*[:\\-]?\\s*|' +
  '^(?:список\\s+(?:продуктов|покупок)|в\\s+список\\s+(?:продуктов|покупок))\\s*[:\\-]?\\s*',
  'iu'
);

export const isGroceryText = (text) => {
  if (!text || typeof text !== 'string') return false;
  return GROCERY_RE.test(text);
};

export const cleanGroceryTitle = (text) => {
  if (!text || typeof text !== 'string') return '';
  const cleaned = text.replace(CLEAN_GROCERY_PREFIX_RE, '').trim();
  return capitalizeFirst(cleaned || text);
};

export const HALLUCINATION_PATTERNS = [
  /продолжение\s+следует.*/i,
  /(?:(?:русские\s+)?субтитр[ыа-я]*(?:\s*(?:сделал\w*|создал\w*|создавал\w*|подготовил\w*|перевел\w*|от|:)).*|субтитр[ыа-я]*$)/i,
  /редактор\s+субтитр[ыа-я]*.*/i,
  /корректор\s+субтитр[ыа-я]*.*/i,
  /автор\s+субтитр[ыа-я]*.*/i,
  /спасибо\s+за\s+просмотр.*/i,
  /ставьте\s+лайк[иа-я]*/i,
  /подписывайтесь.*/i,
  /лайк\s+и\s+подписк[а-я]*/i,
  /колокольчик[а-я]*/i,
  /переведено\s+сообществом.*/i,
  /всем\s+пока.*/i,
  /до\s+новых\s+встреч.*/i,
  /amara\.org/i,
  /www\.[a-z0-9\-]+\.[a-z]{2,}/i,
  /http[s]?:\/\//i,
  /благодарю\s+за\s+внимание.*/i,
  /конец\s+связи/i,
  /трансляция\s+завершена/i,
  /не\s+забудьте\s+подписаться.*/i,
  /смотреть\s+далее.*/i,
  /оставайтесь\s+с\s+нами.*/i,
  /приятного\s+просмотра.*/i,
  /thank\s+you\s+for\s+watching.*/i,
  /please\s+subscribe.*/i,
  /like\s+and\s+subscribe.*/i,
];

const BRACKET_NOISE_RE = /\s*(?:\[|\()(?:\s*|\.{1,3}|тишина|музыка|звук\w*|вздох|кашель|покашливание|смех|пауза|шепот|звонок|аплодисменты|помехи|silence|music(?:\s+playing)?|cough|laughter|applause|sigh|clears\s+throat|bell|snicker|crying|pant|gasp|whisper|murmuring)(?:\]|\))\s*/gi;
const EMPTY_BRACKETS_RE = /\s*(?:\[\s*\]|\(\s*\)|\{\s*\})\s*/g;
const PROMPT_ECHO_FULL_RE = /^(?:task|tasks|задач[аи]|список\s+дел|напоминани[яе])\s*:\s*(?:\(\s*\)|\[\s*\]|\{\s*\}|\.{1,3}|-)?\s*$/i;
const PROMPT_ECHO_PREFIX_RE = /^(?:task|tasks|задач[аи]|список\s+дел|напоминани[яе])\s*:\s*/i;

export const stripWhisperHallucinations = (text) => {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text.trim();

  // 1. Check if string is purely a prompt echo / empty task container (e.g. 'Task: ()')
  if (PROMPT_ECHO_FULL_RE.test(cleaned)) {
    return '';
  }

  // 2. Strip acoustic tags and empty brackets
  cleaned = cleaned.replace(BRACKET_NOISE_RE, ' ');
  cleaned = cleaned.replace(EMPTY_BRACKETS_RE, ' ');

  // 3. Strip prompt echo prefix if followed by real words
  cleaned = cleaned.replace(PROMPT_ECHO_PREFIX_RE, '').trim();

  for (const pat of HALLUCINATION_PATTERNS) {
    if (/(?:написать|сделать|подготовить|добавить|исправить|отредактировать|вставить)\s+субтитр/i.test(cleaned)) {
      continue;
    }
    const trailingRe = new RegExp(`(?:[.,!?;\\s]|^)${pat.source}[.,!?;\\s]*$`, 'iu');
    cleaned = cleaned.replace(trailingRe, '').trim();
    const leadingRe = new RegExp(`^[.,!?;\\s]*${pat.source}(?:[.,!?;\\s]|$)`, 'iu');
    cleaned = cleaned.replace(leadingRe, '').trim();
  }

  // Strip dangling punctuation
  cleaned = cleaned.replace(/^[.,!?;:\s—\-]+|[.,!?;:\s—\-]+$/gu, '');
  return cleaned.trim();
};

export const isHallucinationOrNoise = (text) => {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (PROMPT_ECHO_FULL_RE.test(trimmed) || EMPTY_BRACKETS_RE.test(trimmed)) {
    return true;
  }

  const stripped = stripWhisperHallucinations(trimmed);
  if (!stripped) return true;

  const meaningfulAfter = stripped.replace(/[^\p{L}\p{N}]/gu, '');
  if (meaningfulAfter.length < 2) {
    const isLegit = /(?:написать|сделать|подготовить|добавить|исправить|отредактировать|вставить)\s+субтитр/i.test(trimmed);
    if (!isLegit) return true;
  }

  const cleanLower = stripped.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (['task', 'tasks', 'задача', 'задачи', 'список дел', 'напоминания', 'дело', 'дела'].includes(cleanLower)) {
    return true;
  }

  const words = stripped.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (words.length >= 4) {
    const counts = {};
    for (const w of words) counts[w] = (counts[w] || 0) + 1;
    const maxCnt = Math.max(...Object.values(counts));
    if (maxCnt >= 4 && maxCnt / words.length >= 0.5) return true;
  }

  return false;
};

const RU_HOUR_WORDS = {
  час: 1,
  один: 1,
  два: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
};

const adjustHourByPeriod = (hour, period) => {
  if (!period) return hour;
  const p = period.toLowerCase();
  if (p.startsWith('вечер') || p.startsWith('дн')) {
    if (hour >= 1 && hour <= 11) return hour + 12;
  } else if (p.startsWith('ноч')) {
    if (hour === 12) return 0;
    if (hour >= 6 && hour <= 11) return hour + 12;
  } else if (p.startsWith('утр')) {
    if (hour === 12) return 0;
  }
  return hour;
};

export const normalizeTimeString = (val) => {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s.toLowerCase() === 'null') return null;
  const parts = s.split(':');
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  return null;
};

export const extractAndCleanDateTimeClient = (text, existingDate = null, existingTime = null) => {
  if (!text || typeof text !== 'string') {
    return { title: '', scheduled_date: existingDate, scheduled_time: normalizeTimeString(existingTime) };
  }

  let working = text.trim();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const dayAfter = new Date(now);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const dayAfterStr = dayAfter.toISOString().split('T')[0];
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let dateExplicit = false;
  let extractedDate = existingDate || null;
  if (/(?:^|[^\p{L}])послезавтра(?=[^\p{L}]|$)/iu.test(working)) {
    extractedDate = dayAfterStr;
    dateExplicit = true;
  } else if (/(?:^|[^\p{L}])завтра(?=[^\p{L}]|$)/iu.test(working)) {
    extractedDate = tomorrowStr;
    dateExplicit = true;
  } else if (/(?:^|[^\p{L}])сегодня(?=[^\p{L}]|$)/iu.test(working)) {
    extractedDate = todayStr;
    dateExplicit = true;
  } else if (existingDate && existingDate !== todayStr) {
    dateExplicit = true;
  }

  let extractedTime = normalizeTimeString(existingTime);

  // 1. "в полдень" / "в полночь"
  const noonMatch = working.match(/(?:^|[^\p{L}])(?:в\s+)?(полдень|полночь)(?=[^\p{L}]|$)/iu);
  if (noonMatch) {
    if (!extractedTime) {
      extractedTime = noonMatch[1].toLowerCase() === 'полдень' ? '12:00' : '00:00';
    }
    working = working.replace(noonMatch[0], ' ');
  }

  // 2. Relative: "через N часов/минут", "через полчаса", "через час"
  const relMatch = working.match(
    /(?:^|[^\p{L}])через\s+(?:(\d+)\s*(час(?:а|ов)?|мин(?:ут[аы]?)?)|(полчаса|час))(?=[^\p{L}]|$)/iu
  );
  if (relMatch) {
    if (!extractedTime) {
      let deltaMins = 0;
      if (relMatch[3]) {
        deltaMins = relMatch[3].toLowerCase() === 'полчаса' ? 30 : 60;
      } else {
        const num = parseInt(relMatch[1], 10);
        const u = relMatch[2].toLowerCase();
        deltaMins = u.startsWith('час') ? num * 60 : num;
      }
      const targetDt = new Date(now.getTime() + deltaMins * 60000);
      extractedTime = `${String(targetDt.getHours()).padStart(2, '0')}:${String(targetDt.getMinutes()).padStart(2, '0')}`;
      const targetDateStr = targetDt.toISOString().split('T')[0];
      if (!dateExplicit && targetDateStr > todayStr) {
        extractedDate = targetDateStr;
        dateExplicit = true;
      }
    }
    working = working.replace(relMatch[0], ' ');
  }

  // 3. Explicit HH:MM or H.MM with optional period of day
  const hhmmMatch = working.match(
    /(?:(?:^|[^\p{L}])(утром|днем|днём|вечером|ночью)\s+)?(?:^|[^\p{L}])(?:в|к|на|около)\s*(\d{1,2})[:.](\d{2})(?:\s*(?:час(?:а|ов)?))?(?:\s*(утра|дня|вечера|ночи|утром|днем|днём|вечером|ночью))?(?=[^\p{L}\d]|$)/iu
  );
  if (hhmmMatch) {
    let h = parseInt(hhmmMatch[2], 10);
    const m = parseInt(hhmmMatch[3], 10);
    const period = hhmmMatch[4] || hhmmMatch[1];
    h = adjustHourByPeriod(h, period);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && !extractedTime) {
      extractedTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    working = working.replace(hhmmMatch[0], ' ');
  }

  // 4. Numeric hour + period of day ("в 7 вечера", "вечером в 7", "в 19 часов")
  const hourNumMatch = working.match(
    /(?:(?:^|[^\p{L}])(утром|днем|днём|вечером|ночью)\s+)?(?:^|[^\p{L}])(?:в|к|на|около)\s*(\d{1,2})(?:\s*час(?:а|ов|ам)?)?\s*(утра|дня|вечера|ночи|утром|днем|днём|вечером|ночью)(?=[^\p{L}]|$)|(?:^|[^\p{L}])(утром|днем|днём|вечером|ночью)\s+(?:в|к|на|около)\s*(\d{1,2})(?:\s*час(?:а|ов|ам)?)?(?=[^\p{L}\d]|$)|(?:^|[^\p{L}])(?:в|к|на|около)\s*(\d{1,2})\s*час(?:а|ов|ам)(?=[^\p{L}]|$)/iu
  );
  if (hourNumMatch) {
    let h = 0;
    let period = null;
    if (hourNumMatch[2]) {
      h = parseInt(hourNumMatch[2], 10);
      period = hourNumMatch[3] || hourNumMatch[1];
    } else if (hourNumMatch[5]) {
      h = parseInt(hourNumMatch[5], 10);
      period = hourNumMatch[4];
    } else if (hourNumMatch[6]) {
      h = parseInt(hourNumMatch[6], 10);
    }
    h = adjustHourByPeriod(h, period);
    if (h >= 0 && h <= 23 && !extractedTime) {
      extractedTime = `${String(h).padStart(2, '0')}:00`;
    }
    working = working.replace(hourNumMatch[0], ' ');
  }

  // 5. Word hour + period of day ("в семь вечера", "в час дня")
  const hourWordsPat = Object.keys(RU_HOUR_WORDS).join('|');
  const hourWordRe = new RegExp(
    `(?:(?:^|[^\\p{L}])(утром|днем|днём|вечером|ночью)\\s+)?(?:^|[^\\p{L}])(?:в|к|на|около)\\s*(${hourWordsPat})(?:\\s*час(?:а|ов|ам)?)?\\s*(утра|дня|вечера|ночи|утром|днем|днём|вечером|ночью|час(?:а|ов|ам))(?=[^\\p{L}]|$)`,
    'iu'
  );
  const hourWordMatch = working.match(hourWordRe);
  if (hourWordMatch) {
    let h = RU_HOUR_WORDS[hourWordMatch[2].toLowerCase()] || 0;
    let period = hourWordMatch[3];
    if (period && period.toLowerCase().startsWith('час')) {
      period = hourWordMatch[1];
    }
    h = adjustHourByPeriod(h, period);
    if (h >= 0 && h <= 23 && !extractedTime) {
      extractedTime = `${String(h).padStart(2, '0')}:00`;
    }
    working = working.replace(hourWordMatch[0], ' ');
  }

  // 6. Vague period ("утром", "вечером", "днем")
  const vagueMatch = working.match(/(?:^|[^\p{L}])(утром|вечером|днем|днём|ночью)(?=[^\p{L}]|$)/iu);
  if (vagueMatch) {
    const vw = vagueMatch[1].toLowerCase();
    if (!extractedTime) {
      if (vw === 'утром') extractedTime = '09:00';
      else if (vw === 'днем' || vw === 'днём') extractedTime = '14:00';
      else if (vw === 'вечером') extractedTime = '19:00';
      else if (vw === 'ночью') extractedTime = '23:00';
    }
    working = working.replace(vagueMatch[0], ' ');
  }

  // 7. Strip introductory reminder phrases and date words
  working = working.replace(
    /^\s*(?:пожалуйста[,\s]+)?(?:напомни(?:те)?|напомнить)(?:\s+мне)?(?:\s*,?\s*пожалуйста)?\s*/iu,
    ''
  );
  working = working.replace(
    /(?:^|[^\p{L}])(?:напомни(?:те)?\s+мне|напомни(?:те)?|не\s+забудь(?:те)?|не\s+забыть|сегодня|завтра|послезавтра)(?=[^\p{L}]|$)/giu,
    ' '
  );
  working = working.replace(/^\s*(?:мне\s+)?(?:нужно|надо|необходимо|задача)\s*[:\-]?\s*/iu, '');
  working = working.replace(/\s{2,}/g, ' ').replace(/^[,\s.:;\-–—]+|[,\s.:;\-–—]+$/g, '');

  // 8. If time is present, no explicit date was specified, and time has already passed today -> tomorrow
  if (extractedTime && !dateExplicit && extractedTime <= currentHHMM) {
    extractedDate = tomorrowStr;
  } else if (!extractedDate) {
    extractedDate = todayStr;
  }

  return {
    title: capitalizeFirst(working || text.trim()),
    scheduled_date: extractedDate,
    scheduled_time: extractedTime,
  };
};

export const normalizeTasks = (parsed, defaultCategory = 'one_time') => {
  if (!parsed) return null;
  let rawList = null;
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (Array.isArray(parsed.tasks)) {
    rawList = parsed.tasks;
  } else if (parsed.task) {
    rawList = [parsed.task];
  } else if (parsed.title) {
    rawList = [parsed];
  }

  if (!rawList || !Array.isArray(rawList) || rawList.length === 0) {
    return null;
  }

  const tasks = rawList
    .map((item, idx) => {
      if (!item) return null;
      if (typeof item === 'string') {
        let rawTitle = stripWhisperHallucinations(item.trim());
        if (!rawTitle || isHallucinationOrNoise(rawTitle)) return null;
        if (/не удалось расшифровать|голосовая заметка \(не удалось/i.test(rawTitle)) return null;

        const isRoutine = /каждый день|ежедневно|по утрам|по вечерам|каждое утро|каждый вечер|привычк/i.test(rawTitle);
        const isGoal = /цель|проект|хочу/i.test(rawTitle);
        const isGroc = isGroceryText(rawTitle);
        const cat = isGroc ? 'grocery' : isRoutine ? 'routine' : isGoal ? 'goal' : defaultCategory;

        if (isGroc || isRoutine || isGoal) {
          const title = isGroc ? cleanGroceryTitle(rawTitle) : capitalizeFirst(rawTitle);
          return {
            id: `task_${Date.now()}_${idx}`,
            title,
            category: cat,
            scheduled_date: null,
            scheduled_time: null,
            selected: true,
          };
        }

        const dtInfo = extractAndCleanDateTimeClient(rawTitle);
        return {
          id: `task_${Date.now()}_${idx}`,
          title: dtInfo.title,
          category: cat,
          scheduled_date: dtInfo.scheduled_date,
          scheduled_time: dtInfo.scheduled_time,
          selected: true,
        };
      }
      if (typeof item === 'object') {
        let rawTitle = stripWhisperHallucinations(String(item.title || item.name || item.text || '').trim());
        if (!rawTitle || isHallucinationOrNoise(rawTitle)) return null;
        if (/не удалось расшифровать|голосовая заметка \(не удалось/i.test(rawTitle)) return null;

        let cat = item.category || defaultCategory;
        if (!['routine', 'one_time', 'goal', 'subtask', 'grocery'].includes(cat)) {
          cat = defaultCategory;
        }

        const isGroc = cat === 'grocery' || isGroceryText(rawTitle);
        let title = isGroc ? cleanGroceryTitle(rawTitle) : capitalizeFirst(rawTitle);
        let sched = item.scheduled_date || null;
        let schedTime = normalizeTimeString(item.scheduled_time || item.time || null);

        if (isGroc) {
          cat = 'grocery';
          sched = null;
          schedTime = null;
        } else if (cat === 'one_time' || cat === 'subtask') {
          const dtInfo = extractAndCleanDateTimeClient(rawTitle, sched, schedTime);
          title = dtInfo.title;
          sched = dtInfo.scheduled_date;
          schedTime = dtInfo.scheduled_time;
        }

        const goalTitle = item.goal_title ? capitalizeFirst(String(item.goal_title)) : null;
        return {
          id: item.id || `task_${Date.now()}_${idx}`,
          title,
          category: cat,
          scheduled_date: sched,
          scheduled_time: schedTime,
          description: item.description || null,
          goal_title: goalTitle,
          goal_id: item.goal_id || null,
          target_date: item.target_date || null,
          target_value: item.target_value !== undefined && item.target_value !== null ? Number(item.target_value) : null,
          step: item.step !== undefined && item.step !== null ? Number(item.step) : (item.target_value ? 1.0 : null),
          unit: item.unit ? String(item.unit) : null,
          frequency_type: item.frequency_type || null,
          interval_days: item.interval_days || null,
          days_of_week: item.days_of_week || null,
          selected: item.selected !== false,
        };
      }
      return null;
    })
    .filter(Boolean);

  if (tasks.length === 0) return null;
  return { tasks };
};

export const parseTextWithDirectGemini = async (text) => {
  const key = getGeminiKey();
  if (!key) return null;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nowTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const prompt = `Ты — интеллектуальный ассистент по планированию задач TaskerBot.
Твоя задача — внимательно проанализировать текст пользователя и извлечь ВСЕ упомянутые задачи.
Если в тексте несколько действий/задач, ОБЯЗАТЕЛЬНО разбей их на отдельные элементы массива "tasks"!
Категории:
1. "routine": регулярные привычки ("каждый день", "ежедневно", "по утрам")
2. "one_time": разовые задачи ("завтра", "сегодня", "позвонить", "сделать", "купить ноутбук", "напомни мне в 7 вечера сходить полить цветы")
3. "goal": глобальные цели ("цель", "проект")
4. "grocery": продукты питания, напитки, еда, бытовая химия ("молоко", "хлеб", "сыр", "яйца", "в список продуктов", "купить в магазине")

ВАЖНО:
- Все продукты питания, еду, напитки и бытовую химию ВСЕГДА классифицируй как "grocery" со "scheduled_date": null и "scheduled_time": null!
- Для категории "grocery" в поле "title" пиши только сам продукт без слова "Купить" (например: "Молоко 2 л", "Сыр", "Хлеб")!
- Разовые дела, услуги и покупку крупной техники ("купить ноутбук", "купить билеты") классифицируй как "one_time".
- Если указано время ("в 7 вечера", "в 19:00", "утром в 9", "в полдень", "через 2 часа"), заполни "scheduled_time" в формате "HH:MM" (24ч, например "19:00", "09:00", "12:00"). Если время не указано — null.
- Если дата явно не указана, но указано время ("scheduled_time"), которое уже прошло относительно текущего времени (${nowTimeStr}), ставь "scheduled_date" на завтра!
- Очищай "title" от вводных фраз ("напомни мне", "нужно", "надо") и маркеров даты/времени ("в 7 вечера", "завтра"). Например: "напомни мне в 7 вечера сходить полить цветы" -> "title": "Сходить полить цветы", "scheduled_time": "19:00".
- Название каждой задачи ("title") ВСЕГДА пиши с большой (заглавной) буквы!

Правила для числовых (количественных) задач и привычек со счётчиком:
- Если задача или привычка содержит измеримую количественную цель (например: "выпить 2 литра воды", "отжаться 20 раз", "купить 5 помидоров", "пробежать 5 км", "прочитать 30 страниц"):
  - "target_value": числовое значение цели (float, например: 2.0, 20.0, 5.0, 30.0).
  - "unit": единица измерения кратко (строка, например: "л", "мл", "раз", "шт", "кг", "км", "стр").
  - "step": шаг (float, например: 0.25 для литров/кг, 1.0 для штук/раз/км).
- Если задача обычная и не содержит числовой счётчик, поля target_value, step, unit должны быть null.

Текущая дата: ${todayStr}, текущее время: ${nowTimeStr}.
Формат ответа строго валидный JSON с ключом "tasks".
Каждый элемент: {"category": "routine"|"one_time"|"goal"|"grocery", "title": "краткое название задачи с большой буквы", "scheduled_date": "YYYY-MM-DD"|null, "scheduled_time": "HH:MM"|null, "target_value": float|null, "step": float|null, "unit": string|null}
Пример структуры:
{
  "tasks": [
    {
      "title": "Молоко 2 л",
      "category": "grocery",
      "scheduled_date": null,
      "scheduled_time": null,
      "target_value": 2.0,
      "step": 1.0,
      "unit": "л"
    },
    {
      "title": "Выпить 2 литра воды",
      "category": "routine",
      "scheduled_date": "${todayStr}",
      "scheduled_time": null,
      "target_value": 2.0,
      "step": 0.25,
      "unit": "л"
    },
    {
      "title": "Сходить полить цветы",
      "category": "one_time",
      "scheduled_date": "${todayStr}",
      "scheduled_time": "19:00",
      "target_value": null,
      "step": null,
      "unit": null
    }
  ]
}

Текст пользователя:
${text}`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        }
      );
      if (!res.ok) {
        console.warn(`Direct Gemini model ${model} HTTP status: ${res.status}`);
        continue;
      }
      const data = await res.json();
      const textContent = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
      if (!textContent) continue;
      let cleaned = textContent.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      }
      const parsed = JSON.parse(cleaned);
      const normalized = normalizeTasks(parsed);
      if (normalized && normalized.tasks.length > 0) {
        return normalized;
      }
    } catch (e) {
      console.warn(`Direct Gemini model ${model} error:`, e);
      continue;
    }
  }
  return null;
};

export const parseTextWithDirectGroq = async (text) => {
  const key = getGroqKey();
  if (!key) return null;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nowTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const prompt = `Ты — интеллектуальный ассистент по планированию задач TaskerBot.
Твоя задача — внимательно проанализировать текст пользователя и извлечь ВСЕ упомянутые задачи.
Если в сообщении несколько задач, ОБЯЗАТЕЛЬНО разбей их на отдельные элементы массива "tasks"!
Категории: "routine" (привычки), "one_time" (разовые задачи), "goal" (цели), "grocery" (продукты, напитки, еда, бытовая химия).

ВАЖНО:
- Все продукты питания, еду, напитки и бытовые товары ВСЕГДА относи к "grocery" со "scheduled_date": null и "scheduled_time": null!
- В поле "title" для продуктов пиши только сам продукт без слова "Купить" (например: "Молоко 2 л", "Хлеб")!
- Если указано время ("в 7 вечера", "в 19:00", "утром в 9", "через 2 часа"), укажи "scheduled_time": "HH:MM" (24ч, например "19:00"). Иначе null.
- Очищай "title" от вводных слов ("напомни мне", "нужно") и маркеров даты/времени ("в 7 вечера", "завтра").
- Название каждой задачи ("title") ВСЕГДА пиши с большой (заглавной) буквы!

Правила для числовых (количественных) задач и привычек со счётчиком:
- Если задача или привычка содержит измеримую количественную цель (например: "выпить 2 литра воды", "отжаться 20 раз", "купить 5 помидоров", "пробежать 5 км", "прочитать 30 страниц"):
  - "target_value": числовое значение цели (float, например: 2.0, 20.0, 5.0, 30.0).
  - "unit": единица измерения кратко (строка, например: "л", "мл", "раз", "шт", "кг", "км", "стр").
  - "step": шаг (float, например: 0.25 для литров/кг, 1.0 для штук/раз/км).
- Если задача обычная и не содержит числовой счётчик, поля target_value, step, unit должны быть null.

Текущая дата: ${todayStr}, текущее время: ${nowTimeStr}.
Формат ответа: строгий JSON с ключом "tasks".
Каждый элемент объекта в "tasks": {"category": "routine"|"one_time"|"goal"|"grocery", "title": "краткое название задачи с большой буквы", "scheduled_date": "YYYY-MM-DD"|null, "scheduled_time": "HH:MM"|null, "target_value": float|null, "step": float|null, "unit": string|null}
Пример: {"tasks": [{"category": "grocery", "title": "Молоко 2 л", "scheduled_date": null, "scheduled_time": null, "target_value": 2.0, "step": 1.0, "unit": "л"}, {"category": "routine", "title": "Выпить 2 литра воды", "scheduled_date": "${todayStr}", "scheduled_time": null, "target_value": 2.0, "step": 0.25, "unit": "л"}, {"category": "one_time", "title": "Сходить полить цветы", "scheduled_date": "${todayStr}", "scheduled_time": "19:00", "target_value": null, "step": null, "unit": null}]}`;

  for (const model of GROQ_CHAT_MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt + ' Ответ должен быть строго в формате JSON с ключом "tasks".' },
            { role: 'user', content: `Текст пользователя:\n${text}` },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });
      if (!res.ok) {
        console.warn(`Direct Groq model ${model} status: ${res.status}`);
        continue;
      }
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      let raw = (msg?.content && msg.content.trim()) || (msg?.reasoning && msg.reasoning.trim());
      if (!raw) continue;
      if (raw.includes('```')) {
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (jsonErr) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch (_) {
            continue;
          }
        } else {
          continue;
        }
      }
      const normalized = normalizeTasks(parsed);
      if (normalized && normalized.tasks.length > 0) {
        return normalized;
      }
    } catch (e) {
      console.warn(`Direct Groq model ${model} error:`, e);
      continue;
    }
  }
  return null;
};

export const parseAudioWithDirectGemini = async (audioBlob) => {
  const key = getGeminiKey();
  if (!key) return null;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nowTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const base64Audio = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      const base64 = typeof result === 'string' ? result.split(',')[1] : '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(audioBlob);
  });

  if (!base64Audio) return null;

  const mimeType = (audioBlob.type || 'audio/webm').split(';')[0];
  const prompt = `Ты — голосовой ассистент по планированию задач TaskerBot.
Внимательно прослушай аудиозапись пользователя, транскрибируй её и извлеки ВСЕ задачи.
Если сказано несколько действий, разбей их на отдельные задачи в массиве "tasks".
Категории: "routine" (привычки), "one_time" (разовые задачи), "goal" (цели), "grocery" (продукты, напитки, еда, бытовая химия).
Если указано время ("в 7 вечера", "в 19:00"), заполни "scheduled_time": "HH:MM" (24ч) и очисти "title" от вводных фраз ("напомни мне") и маркеров даты/времени.
Текущая дата: ${todayStr}, текущее время: ${nowTimeStr}.
Формат ответа: строгий валидный JSON с ключом "tasks".
Каждый элемент: {"category": "routine"|"one_time"|"goal"|"grocery", "title": "название задачи", "scheduled_date": "YYYY-MM-DD"|null, "scheduled_time": "HH:MM"|null}`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: base64Audio,
                    },
                  },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const textContent = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
      if (!textContent) continue;
      let cleaned = textContent.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      }
      const parsed = JSON.parse(cleaned);
      const normalized = normalizeTasks(parsed);
      if (normalized && normalized.tasks.length > 0) {
        return normalized;
      }
    } catch (e) {
      console.warn(`Direct Gemini audio parse error on ${model}:`, e);
      continue;
    }
  }
  return null;
};

export const transcribeWithDirectGroqWhisper = async (audioBlob) => {
  const groqKey = getGroqKey();
  if (!groqKey) return null;

  for (const whisperModel of ['whisper-large-v3-turbo', 'whisper-large-v3']) {
    try {
      const gFormData = new FormData();
      let ext = 'voice.webm';
      if (audioBlob.type) {
        if (audioBlob.type.includes('mp4') || audioBlob.type.includes('m4a') || audioBlob.type.includes('aac')) {
          ext = 'voice.mp4';
        } else if (audioBlob.type.includes('ogg')) {
          ext = 'voice.ogg';
        } else if (audioBlob.type.includes('wav')) {
          ext = 'voice.wav';
        }
      }
      gFormData.append('file', audioBlob, ext);
      gFormData.append('model', whisperModel);
      gFormData.append('language', 'ru');
      gFormData.append('temperature', '0.0');
      gFormData.append('prompt', 'Разговорная русская речь без субтитров. Запись повседневных дел и покупок.');
      gFormData.append('response_format', 'json');

      const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
        },
        body: gFormData,
      });

      if (whisperRes.ok) {
        const whisperData = await whisperRes.json();
        const text = whisperData.text && whisperData.text.trim();
        if (text) {
          const stripped = stripWhisperHallucinations(text);
          if (!isHallucinationOrNoise(stripped)) {
            const clean = stripped.replace(/[^\p{L}\d]/gu, '').trim();
            if (clean.length >= 2) return stripped;
          }
        }
      }
    } catch (we) {
      console.warn(`Direct Groq Whisper ${whisperModel} failed:`, we);
    }
  }
  return null;
};

export const parseTextWithDirectOpenRouter = async (text) => {
  const openRouterKey = getOpenRouterKey();
  if (!openRouterKey) return null;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nowTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const systemPrompt = `Ты — интеллектуальный ассистент по планированию задач TaskerBot.
Твоя задача — извлечь ВСЕ упомянутые задачи из текста пользователя.
Текущая дата: ${todayStr}, текущее время: ${nowTimeStr}.
Категории:
- routine: регулярные ежедневные дела (каждый день, по утрам)
- one_time: разовые дела (сегодня, завтра, в пятницу, купить ноутбук)
- goal: глобальные цели и проекты
- subtask: подзадачи для цели
- grocery: продукты питания, напитки, еда, бытовая химия (молоко, хлеб, яйца)

ВАЖНО:
- Все продукты питания, еду, напитки и бытовую химию ВСЕГДА классифицируй как "grocery" со "scheduled_date": null и "scheduled_time": null!
- В названии "title" для продуктов пиши только сам продукт без слова "Купить" (например: "Молоко 2 л", "Хлеб")!
- Если указано время ("в 7 вечера", "в 19:00", "утром в 9"), укажи "scheduled_time": "HH:MM" (24ч) и очисти "title" от вводных фраз ("напомни мне") и маркеров даты/времени.
- Название каждой задачи ("title") ВСЕГДА пиши с большой (заглавной) буквы!

Правила для числовых (количественных) задач и привычек со счётчиком:
- Если задача или привычка содержит измеримую количественную цель (например: "выпить 2 литра воды", "отжаться 20 раз", "купить 5 помидоров", "пробежать 5 км", "прочитать 30 страниц"):
  - "target_value": числовое значение цели (float, например: 2.0, 20.0, 5.0, 30.0).
  - "unit": единица измерения кратко (строка, например: "л", "мл", "раз", "шт", "кг", "км", "стр").
  - "step": шаг (float, например: 0.25 для литров/кг, 1.0 для штук/раз/км).
- Если задача обычная и не содержит числовой счётчик, поля target_value, step, unit должны быть null.

Верни ответ СТРОГО в формате JSON с ключом "tasks":
{"tasks": [{"category": "grocery", "title": "Молоко 2 л", "scheduled_date": null, "scheduled_time": null, "target_value": 2.0, "step": 1.0, "unit": "л"}, {"category": "routine", "title": "Выпить 2 литра воды", "scheduled_date": "${todayStr}", "scheduled_time": null, "target_value": 2.0, "step": 0.25, "unit": "л"}, {"category": "one_time", "title": "Сходить полить цветы", "scheduled_date": "YYYY-MM-DD", "scheduled_time": "19:00", "target_value": null, "step": null, "unit": null}]}`;

  for (const model of OPENROUTER_FREE_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://taskerbot.local',
          'X-Title': 'TaskerBot',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Текст пользователя:\n${text}` },
          ],
          temperature: 0.1,
        }),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      const content = msg?.content || msg?.reasoning;
      if (!content) continue;

      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      }
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        cleaned = match[0];
      }
      const parsed = JSON.parse(cleaned);
      const normalized = normalizeTasks(parsed);
      if (normalized && normalized.tasks.length > 0) {
        return normalized;
      }
    } catch (e) {
      console.warn(`Direct OpenRouter failed on model ${model}:`, e);
      continue;
    }
  }
  return null;
};

export const parseSmartText = async (text, provider = null) => {
  // 1. Try Backend API first if reachable
  try {
    const effectiveUserId = getEffectiveUserId();
    const formData = new FormData();
    formData.append('text', text);
    if (provider) {
      formData.append('provider', provider);
    }
    const res = await fetch(`${API_BASE}/ai/parse-text?telegram_id=${effectiveUserId}`, {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      const normalized = normalizeTasks(data);
      if (normalized && normalized.tasks.length > 0) return normalized;
    }
  } catch (e) {}

  // 2. Direct Neural AI call (OpenRouter, Groq, or Gemini)
  const chosen = provider || 'auto';

  if (chosen === 'openrouter') {
    // OpenRouter requested
    try {
      const orRes = await parseTextWithDirectOpenRouter(text);
      if (orRes && orRes.tasks && orRes.tasks.length > 0) return orRes;
    } catch (e) {
      console.warn('Direct OpenRouter failed, trying Groq fallback:', e);
    }
    try {
      const gRes = await parseTextWithDirectGroq(text);
      if (gRes && gRes.tasks && gRes.tasks.length > 0) return gRes;
    } catch (e) {}
    try {
      const gemRes = await parseTextWithDirectGemini(text);
      if (gemRes && gemRes.tasks && gemRes.tasks.length > 0) return gemRes;
    } catch (e) {}
  } else if (chosen === 'groq') {
    // Groq requested
    try {
      const gRes = await parseTextWithDirectGroq(text);
      if (gRes && gRes.tasks && gRes.tasks.length > 0) return gRes;
    } catch (e) {
      console.warn('Direct Groq failed, trying OpenRouter fallback:', e);
    }
    try {
      const orRes = await parseTextWithDirectOpenRouter(text);
      if (orRes && orRes.tasks && orRes.tasks.length > 0) return orRes;
    } catch (e) {}
    try {
      const gemRes = await parseTextWithDirectGemini(text);
      if (gemRes && gemRes.tasks && gemRes.tasks.length > 0) return gemRes;
    } catch (e) {}
  } else if (chosen === 'gemini') {
    // Gemini requested
    try {
      const gemRes = await parseTextWithDirectGemini(text);
      if (gemRes && gemRes.tasks && gemRes.tasks.length > 0) return gemRes;
    } catch (e) {
      console.warn('Direct Gemini failed, trying Groq fallback:', e);
    }
    try {
      const gRes = await parseTextWithDirectGroq(text);
      if (gRes && gRes.tasks && gRes.tasks.length > 0) return gRes;
    } catch (e) {}
    try {
      const orRes = await parseTextWithDirectOpenRouter(text);
      if (orRes && orRes.tasks && orRes.tasks.length > 0) return orRes;
    } catch (e) {}
  } else {
    // Auto-Fast cascade: Groq -> OpenRouter -> Gemini
    try {
      const gRes = await parseTextWithDirectGroq(text);
      if (gRes && gRes.tasks && gRes.tasks.length > 0) return gRes;
    } catch (e) {}
    try {
      const orRes = await parseTextWithDirectOpenRouter(text);
      if (orRes && orRes.tasks && orRes.tasks.length > 0) return orRes;
    } catch (e) {}
    try {
      const gemRes = await parseTextWithDirectGemini(text);
      if (gemRes && gemRes.tasks && gemRes.tasks.length > 0) return gemRes;
    } catch (e) {}
  }

  // 3. Fallback NLP rule-based task splitter (splits on Russian conjunctions & task keywords)
  const rawChunks = text
    .split(/(?:[\n;]+|\s+(?:а также|а еще|и еще|а потом|потом|также|плюс|кстати|и)\s+)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const tasks = rawChunks.map((chunk, idx) => {
    const lower = chunk.toLowerCase();
    const isRoutine = /каждый день|ежедневно|по утрам|по вечерам|привычк/i.test(lower);
    const isGoal = /цель|проект|хочу/i.test(lower);
    const isGroc = isGroceryText(chunk);

    if (isGroc) {
      return {
        id: `task_${Date.now()}_${idx}`,
        title: cleanGroceryTitle(chunk),
        category: 'grocery',
        scheduled_date: null,
        scheduled_time: null,
        selected: true,
      };
    }

    if (isRoutine || isGoal) {
      const cleanTitle = capitalizeFirst(
        chunk
          .replace(/^(?:завтра|сегодня|послезавтра|надо|нужно|каждый день|ежедневно|цель:?|проект:?)\s*/i, '')
          .trim()
      );
      return {
        id: `task_${Date.now()}_${idx}`,
        title: cleanTitle || capitalizeFirst(chunk),
        category: isRoutine ? 'routine' : 'goal',
        scheduled_date: null,
        scheduled_time: null,
        selected: true,
      };
    }

    const dtInfo = extractAndCleanDateTimeClient(chunk, null, null);
    return {
      id: `task_${Date.now()}_${idx}`,
      title: dtInfo.title || capitalizeFirst(chunk),
      category: 'one_time',
      scheduled_date: dtInfo.scheduled_date || todayStr,
      scheduled_time: dtInfo.scheduled_time || null,
      selected: true,
    };
  });

  const isWholeTextGroc = isGroceryText(text);
  const wholeDt = isWholeTextGroc ? null : extractAndCleanDateTimeClient(text, null, null);
  const defaultTask = {
    id: `task_${Date.now()}_0`,
    title: isWholeTextGroc ? cleanGroceryTitle(text) : (wholeDt?.title || capitalizeFirst(text)),
    category: isWholeTextGroc ? 'grocery' : 'one_time',
    scheduled_date: isWholeTextGroc ? null : (wholeDt?.scheduled_date || todayStr),
    scheduled_time: isWholeTextGroc ? null : (wholeDt?.scheduled_time || null),
    selected: true,
  };

  return {
    tasks: tasks.length > 0 ? tasks : [defaultTask],
  };
};

export const parseSmartAudio = async (audioBlob, provider = null) => {
  // 1. Try Backend API first if reachable
  try {
    const formData = new FormData();
    let ext = 'voice.webm';
    if (audioBlob.type) {
      if (audioBlob.type.includes('mp4') || audioBlob.type.includes('m4a')) ext = 'voice.mp4';
      else if (audioBlob.type.includes('ogg')) ext = 'voice.ogg';
      else if (audioBlob.type.includes('wav')) ext = 'voice.wav';
    }
    formData.append('audio', audioBlob, ext);
    if (provider) {
      formData.append('provider', provider);
    }
    const effectiveUserId = getEffectiveUserId();
    const res = await fetch(`${API_BASE}/ai/parse-audio?telegram_id=${effectiveUserId}`, {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      const normalized = normalizeTasks(data);
      if (normalized && normalized.tasks.length > 0) return normalized;
    } else {
      console.warn('Backend audio parse returned status:', res.status);
    }
  } catch (e) {
    console.warn('Backend audio parse error:', e);
  }

  const chosen = provider || 'auto';

  // 2. Direct browser AI calls
  // Note: OpenRouter is a text LLM inference service (chat completions) and does not transcribe voice directly.
  // We use Groq Whisper (lightning-fast ~300ms) or Gemini Multimodal Audio to transcribe speech,
  // then pass the transcribed text to the chosen provider (OpenRouter / Groq / Gemini).
  if (chosen === 'gemini') {
    // Gemini chosen: try Gemini Multimodal Audio first
    try {
      const gemRes = await parseAudioWithDirectGemini(audioBlob);
      if (gemRes && gemRes.tasks && gemRes.tasks.length > 0) return gemRes;
    } catch (ge) {
      console.warn('Direct Gemini audio failed, trying Groq Whisper fallback:', ge);
    }
    // Fallback to Groq Whisper transcription + Gemini text parsing
    try {
      const whisperText = await transcribeWithDirectGroqWhisper(audioBlob);
      if (whisperText) {
        return await parseSmartText(whisperText, 'gemini');
      }
    } catch (we) {}
  } else {
    // chosen is 'openrouter', 'groq', or 'auto'
    // Step A: Transcribe via Groq Whisper
    try {
      const whisperText = await transcribeWithDirectGroqWhisper(audioBlob);
      if (whisperText) {
        // Transcribed successfully: parse via chosen provider (OpenRouter / Groq)
        return await parseSmartText(whisperText, chosen);
      }
    } catch (we) {
      console.warn('Direct Groq Whisper failed, trying Gemini audio fallback:', we);
    }

    // Step B: Fallback to Gemini Multimodal Audio
    try {
      const gemRes = await parseAudioWithDirectGemini(audioBlob);
      if (gemRes && gemRes.tasks && gemRes.tasks.length > 0) return gemRes;
    } catch (ge) {}
  }

  // Fallback will trigger browser speech recognition in QuickAddModal
  throw new Error('Голосовая AI транскрипция требует подключения бэкенда или доступа к микрофону.');
};
