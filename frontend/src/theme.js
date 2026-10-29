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
    root.setAttribute('data-theme', effectiveTheme);
    root.style.colorScheme = effectiveTheme;

    if (document.body) {
      document.body.setAttribute('data-theme', effectiveTheme);
    }

    // Sync Telegram WebApp native colors and meta theme-color
    const themeColor = effectiveTheme === 'light' ? '#f4f4f6' : '#0d0d0d';
    root.style.backgroundColor = themeColor;
    if (document.body) {
      document.body.style.backgroundColor = themeColor;
    }
    const metaThemeColors = document.querySelectorAll('meta[name="theme-color"]');
    if (metaThemeColors.length > 0) {
      metaThemeColors.forEach((m) => m.setAttribute('content', themeColor));
    }

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
 * Initialize theme listeners (Telegram events, media query, periodic schedule check)
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
