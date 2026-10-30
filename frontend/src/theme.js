/**
 * Theme Management for TaskerBot
 * Supports:
 * - 'auto': Telegram WebApp color scheme / system prefers-color-scheme
 * - 'auto' + schedule: daylight hours (e.g. 07:00–20:00) calculated by user timezone
 * - 'dark': pure graphite monochrome dark
 * - 'light': linear / apple monochrome light
 */

export const THEME_STORAGE_KEY = 'tasker_theme_mode';
export const SCHEDULE_ENABLED_KEY = 'tasker_theme_schedule_enabled';
export const SCHEDULE_START_KEY = 'tasker_theme_schedule_start';
export const SCHEDULE_END_KEY = 'tasker_theme_schedule_end';

let currentConfig = {
  mode: 'auto',
  scheduleEnabled: false,
  scheduleStart: '07:00',
  scheduleEnd: '20:00',
};

let currentTimezone = null;
let intervalId = null;
let isInitialized = false;
let flushTimerA = null;
let flushTimerB = null;

/**
 * Ensures the top and bottom fixed-edge sampling shims exist in document.body
 * and returns them so WebKit's LocalFrameView::fixedContainerEdges always hits
 * an opaque position:fixed box (>10px tall, 100% wide, no backdrop-filter).
 */
function ensureSafariEdgeShims(themeColor) {
  if (typeof document === 'undefined' || !document.body) return { topShim: null, botShim: null };

  let topShim = document.getElementById('safari-edge-top');
  if (!topShim) {
    topShim = document.createElement('div');
    topShim.id = 'safari-edge-top';
    topShim.className = 'safari-edge-shim safari-edge-shim-top';
    topShim.setAttribute('aria-hidden', 'true');
    document.body.prepend(topShim);
  }

  let botShim = document.getElementById('safari-edge-bottom');
  if (!botShim) {
    botShim = document.createElement('div');
    botShim.id = 'safari-edge-bottom';
    botShim.className = 'safari-edge-shim safari-edge-shim-bottom';
    botShim.setAttribute('aria-hidden', 'true');
    document.body.prepend(botShim);
  }

  if (themeColor) {
    topShim.style.backgroundColor = themeColor;
    botShim.style.backgroundColor = themeColor;
  }

  return { topShim, botShim };
}

/**
 * Replaces <meta name="theme-color"> in document.head and forces WebKit iOS 26/27
 * (LocalFrameView::fixedContainerEdges + PageColorSampler + ScrollPocket) to
 * recompute and commit a new RemoteLayerTreeTransaction with the active theme color.
 */
function syncSafariChromeAndShims(themeColor, effectiveTheme) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.setAttribute('data-theme', effectiveTheme);
  root.style.colorScheme = effectiveTheme;
  root.style.backgroundColor = themeColor;

  if (document.body) {
    document.body.setAttribute('data-theme', effectiveTheme);
    document.body.style.colorScheme = effectiveTheme;
    document.body.style.backgroundColor = themeColor;
  }

  const appRoot = document.getElementById('root');
  if (appRoot) {
    appRoot.style.backgroundColor = themeColor;
  }

  const { topShim, botShim } = ensureSafariEdgeShims(themeColor);

  const metaColorScheme =
    document.getElementById('meta-color-scheme') ||
    document.querySelector('meta[name="color-scheme"]');
  if (metaColorScheme) {
    metaColorScheme.setAttribute('content', effectiveTheme);
  }

  const metaStatusBar =
    document.getElementById('meta-status-bar-style') ||
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (metaStatusBar) {
    metaStatusBar.setAttribute(
      'content',
      effectiveTheme === 'light' ? 'default' : 'black-translucent'
    );
  }

  // Replace <meta name="theme-color"> node in <head> so WebKit's HTMLMetaElement
  // insertion hook fires unconditionally on live theme switches and reloads.
  if (document.head) {
    const existingMetas = document.head.querySelectorAll('meta[name="theme-color"]');
    existingMetas.forEach((m) => m.remove());
    const freshMeta = document.createElement('meta');
    freshMeta.setAttribute('name', 'theme-color');
    freshMeta.setAttribute('content', themeColor);
    freshMeta.id = 'meta-theme-color';
    document.head.appendChild(freshMeta);
  }

  // Force WebKit RenderLayerCompositor & LocalFrameView::fixedContainerEdges to
  // invalidate fixed-edge geometry and emit a fresh RemoteLayerTreeTransaction.
  if (topShim && botShim) {
    topShim.style.height = '13px';
    botShim.style.height = '13px';
    topShim.style.transform = 'translate3d(0, 0, 0)';
    botShim.style.transform = 'translate3d(0, 0, 0)';
  }
  // Synchronous style/layout flush at t=0ms (with CSS transition:none on root/body/shims)
  void root.offsetHeight;

  if (typeof window !== 'undefined') {
    const commitEdgeSample = (h, tf) => {
      try {
        const currentTheme = root.getAttribute('data-theme') || effectiveTheme;
        const targetColor = currentTheme === 'light' ? '#f4f4f6' : '#0d0d0d';
        root.style.backgroundColor = targetColor;
        if (document.body) {
          document.body.style.backgroundColor = targetColor;
        }
        const { topShim: ts, botShim: bs } = ensureSafariEdgeShims(targetColor);
        if (ts && bs) {
          ts.style.height = h;
          bs.style.height = h;
          ts.style.transform = tf;
          bs.style.transform = tf;
        }
        void root.offsetHeight;
        window.scrollBy(0, 0);
      } catch (_) {}
    };

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        commitEdgeSample('12px', 'translateZ(0)');
        window.requestAnimationFrame(() => {
          commitEdgeSample('12px', 'translate3d(0, 0, 0)');
        });
      });
    }

    if (flushTimerA) clearTimeout(flushTimerA);
    if (flushTimerB) clearTimeout(flushTimerB);
    flushTimerA = setTimeout(() => commitEdgeSample('13px', 'translateZ(0)'), 50);
    flushTimerB = setTimeout(() => commitEdgeSample('12px', 'translateZ(0)'), 150);
  }
}

/**
 * Retrieve saved theme settings from LocalStorage
 */
export function getStoredThemeConfig() {
  if (typeof window === 'undefined') {
    return { ...currentConfig };
  }

  try {
    const mode = localStorage.getItem(THEME_STORAGE_KEY) || 'auto';
    const scheduleEnabled = localStorage.getItem(SCHEDULE_ENABLED_KEY) === 'true';
    const scheduleStart = localStorage.getItem(SCHEDULE_START_KEY) || '07:00';
    const scheduleEnd = localStorage.getItem(SCHEDULE_END_KEY) || '20:00';

    return {
      mode: ['auto', 'dark', 'light'].includes(mode) ? mode : 'auto',
      scheduleEnabled,
      scheduleStart,
      scheduleEnd,
    };
  } catch (e) {
    return { ...currentConfig };
  }
}

/**
 * Calculates whether the current local time in timezone is during daylight
 */
function isDaytimeInTimezone(timezone, startStr = '07:00', endStr = '20:00') {
  try {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
    const now = new Date();
    const timeStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);

    if (startStr <= endStr) {
      return timeStr >= startStr && timeStr < endStr;
    } else {
      // Overnight range, e.g. 21:00 to 07:00
      return timeStr >= startStr || timeStr < endStr;
    }
  } catch (_) {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${h}:${m}`;
    return timeStr >= startStr && timeStr < endStr;
  }
}

/**
 * Detects if Telegram WebApp environment is active with authentic Telegram context.
 * In standalone browsers, telegram-web-app.js leaves platform='unknown' and initData=''
 */
export function isTelegramWebAppActive() {
  if (typeof window === 'undefined') return false;
  const tg = window.Telegram?.WebApp;
  if (!tg) return false;
  if (tg.initData && tg.initData.length > 0) return true;
  if (tg.initDataUnsafe?.user) return true;
  if (tg.platform && tg.platform !== 'unknown') return true;
  if (window.location?.hash && window.location.hash.includes('tgWebAppData')) return true;
  return false;
}

/**
 * Determine the active theme ('light' or 'dark') given the configuration
 */
export function resolveEffectiveTheme(config = currentConfig, timezone = currentTimezone) {
  const mode = config?.mode || 'auto';

  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';

  // Mode is 'auto'
  if (config?.scheduleEnabled) {
    const isDay = isDaytimeInTimezone(
      timezone,
      config?.scheduleStart || '07:00',
      config?.scheduleEnd || '20:00'
    );
    return isDay ? 'light' : 'dark';
  }

  // Telegram colorScheme only when running inside authentic Telegram WebApp
  if (isTelegramWebAppActive() && window.Telegram?.WebApp?.colorScheme) {
    return window.Telegram.WebApp.colorScheme === 'light' ? 'light' : 'dark';
  }

  // System preference (Browser / OS)
  if (typeof window !== 'undefined' && window.matchMedia) {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  }

  return 'dark';
}

/**
 * Push the current theme color to Telegram native chrome (header, background, bottom bar).
 * Idempotent; re-invoked on Telegram lifecycle events because the native client may reset
 * these colors after viewport/fullscreen/activation transitions.
 */
function syncTelegramChromeColors(color = null) {
  if (typeof window === 'undefined' || !window.Telegram?.WebApp) return;
  const themeColor =
    color ||
    (document.documentElement.getAttribute('data-theme') === 'light' ? '#f4f4f6' : '#0d0d0d');
  const tg = window.Telegram.WebApp;
  try {
    if (typeof tg.setHeaderColor === 'function') tg.setHeaderColor(themeColor);
    if (typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor(themeColor);
    if (typeof tg.setBottomBarColor === 'function') tg.setBottomBarColor(themeColor);
  } catch (_) {}
}

/**
 * Apply the theme to documentElement and sync with Telegram WebApp
 */
export function applyTheme(config = null, timezone = null) {
  if (config) {
    currentConfig = { ...currentConfig, ...config };
  }
  if (timezone) {
    currentTimezone = timezone;
  }

  // Save to LocalStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, currentConfig.mode);
      localStorage.setItem(SCHEDULE_ENABLED_KEY, String(currentConfig.scheduleEnabled));
      localStorage.setItem(SCHEDULE_START_KEY, currentConfig.scheduleStart);
      localStorage.setItem(SCHEDULE_END_KEY, currentConfig.scheduleEnd);
    } catch (_) {}
  }

  const effectiveTheme = resolveEffectiveTheme(currentConfig, currentTimezone);

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    const prevTheme = root.getAttribute('data-theme');
    const themeColor = effectiveTheme === 'light' ? '#f4f4f6' : '#0d0d0d';

    syncSafariChromeAndShims(themeColor, effectiveTheme);
    syncTelegramChromeColors(themeColor);

    if (prevTheme !== effectiveTheme && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('taskerThemeChanged', {
          detail: { theme: effectiveTheme, config: currentConfig },
        })
      );
    }
  }

  return effectiveTheme;
}

/**
 * Initialize theme listeners (Telegram events, media query, reload/bfcache, periodic schedule check)
 */
export function initTheme(initialTimezone = null) {
  if (typeof window === 'undefined') return;

  currentConfig = getStoredThemeConfig();
  if (initialTimezone) {
    currentTimezone = initialTimezone;
  } else {
    try {
      currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (_) {
      currentTimezone = 'Europe/Moscow';
    }
  }

  applyTheme(currentConfig, currentTimezone);

  if (isInitialized) return;
  isInitialized = true;

  // Re-sync Safari & PWA top/bottom chrome on system reload, bfcache restore, and tab activation
  try {
    window.addEventListener('pageshow', () => {
      currentConfig = getStoredThemeConfig();
      applyTheme(currentConfig, currentTimezone);
    });
    window.addEventListener('load', () => {
      applyTheme(currentConfig, currentTimezone);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        currentConfig = getStoredThemeConfig();
        applyTheme(currentConfig, currentTimezone);
      }
    });
  } catch (_) {}

  // Telegram theme change listener (active only when running in Telegram WebApp)
  if (window.Telegram?.WebApp && isTelegramWebAppActive()) {
    try {
      window.Telegram.WebApp.onEvent('themeChanged', () => {
        if (currentConfig.mode === 'auto' && !currentConfig.scheduleEnabled) {
          applyTheme();
        }
      });
    } catch (_) {}
    try {
      ['viewportChanged', 'fullscreenChanged', 'safeAreaChanged', 'activated'].forEach((evt) => {
        window.Telegram.WebApp.onEvent(evt, () => syncTelegramChromeColors());
      });
    } catch (_) {}
  }

  // OS system theme change listener (for browsers and environments respecting prefers-color-scheme)
  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => {
        if (currentConfig.mode === 'auto' && !currentConfig.scheduleEnabled) {
          applyTheme();
        }
      };
      if (media.addEventListener) {
        media.addEventListener('change', listener);
      } else if (media.addListener) {
        media.addListener(listener);
      }
    } catch (_) {}
  }

  // Periodic schedule tick (every 30 seconds)
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => {
    if (currentConfig.mode === 'auto' && currentConfig.scheduleEnabled) {
      applyTheme();
    }
  }, 30000);
}
