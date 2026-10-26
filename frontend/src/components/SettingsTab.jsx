import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Check,
  Server,
  Key,
  RotateCw,
  Bell,
  Cpu,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon,
  SunMoon,
  Sunrise,
  Sunset,
} from 'lucide-react';
import {
  fetchUserSettings,
  updateUserSettings,
  currentUser,
  hapticFeedback,
  getCustomBackendUrl,
  setCustomBackendUrl,
  getGeminiKey,
  setGeminiKey,
  getGroqKey,
  setGroqKey,
  getOpenRouterKey,
  setOpenRouterKey,
  sendTestNotification,
} from '../api';
import { applyTheme, getStoredThemeConfig } from '../theme';
import ViewHeader from './ViewHeader';

export default function SettingsTab({ onRefresh, onForceRefresh, isSyncing }) {
  const [settings, setSettings] = useState(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [customBackend, setCustomBackend] = useState(getCustomBackendUrl());
  const [backendInput, setBackendInput] = useState(getCustomBackendUrl());
  const [geminiKeyInput, setGeminiKeyInput] = useState(getGeminiKey());
  const [groqKeyInput, setGroqKeyInput] = useState(getGroqKey());
  const [openRouterKeyInput, setOpenRouterKeyInput] = useState(getOpenRouterKey());
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testFeedback, setTestFeedback] = useState(null);
  const [avatarError, setAvatarError] = useState(false);

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(() => {
    const saved = localStorage.getItem('settings_notifications_open');
    return saved !== null ? saved === 'true' : true;
  });
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(() => {
    const saved = localStorage.getItem('settings_appearance_open');
    return saved !== null ? saved === 'true' : true;
  });
  const [isAiOpen, setIsAiOpen] = useState(() => {
    const saved = localStorage.getItem('settings_ai_open');
    return saved !== null ? saved === 'true' : false;
  });

  const toggleAppearance = () => {
    hapticFeedback('selection');
    setIsAppearanceOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('settings_appearance_open', String(next));
      } catch (e) {}
      return next;
    });
  };

  const handleSendTestNotification = async () => {
    setIsSendingTest(true);
    setTestFeedback(null);
    try {
      const res = await sendTestNotification();
      if (res && res.error) {
        setTestFeedback({ error: true, text: `Ошибка: ${res.error}` });
      } else {
        setTestFeedback({ error: false, text: 'Тестовое уведомление успешно отправлено в Telegram!' });
      }
    } catch (e) {
      setTestFeedback({ error: true, text: 'Не удалось отправить уведомление' });
    } finally {
      setIsSendingTest(false);
      setTimeout(() => {
        setTestFeedback(null);
      }, 5000);
    }
  };

  const toggleNotifications = () => {
    hapticFeedback('selection');
    setIsNotificationsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('settings_notifications_open', String(next));
      } catch (e) {
        // ignore
      }
      return next;
    });
  };

  const toggleAi = () => {
    hapticFeedback('selection');
    setIsAiOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('settings_ai_open', String(next));
      } catch (e) {
        // ignore
      }
      return next;
    });
  };

  const loadSettings = useCallback(async () => {
    try {
      const data = await fetchUserSettings();
      setSettings(data);
      if (data) {
        applyTheme(
          {
            mode: data.theme_mode,
            scheduleEnabled: data.theme_schedule_enabled,
            scheduleStart: data.theme_schedule_start,
            scheduleEnd: data.theme_schedule_end,
          },
          data.timezone
        );
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }, []);

  const handleThemeModeChange = async (mode) => {
    hapticFeedback('selection');
    const newSettings = { ...settings, theme_mode: mode };
    setSettings(newSettings);
    applyTheme({ mode }, settings?.timezone);
    triggerSaved();
    try {
      await updateUserSettings({ theme_mode: mode });
    } catch (e) {}
  };

  const handleToggleThemeSchedule = async () => {
    hapticFeedback('selection');
    const nextVal = !settings?.theme_schedule_enabled;
    const newSettings = { ...settings, theme_schedule_enabled: nextVal };
    setSettings(newSettings);
    applyTheme({ scheduleEnabled: nextVal }, settings?.timezone);
    triggerSaved();
    try {
      await updateUserSettings({ theme_schedule_enabled: nextVal });
    } catch (e) {}
  };

  const handleThemeScheduleStartChange = async (start) => {
    hapticFeedback('selection');
    const newSettings = { ...settings, theme_schedule_start: start };
    setSettings(newSettings);
    applyTheme({ scheduleStart: start }, settings?.timezone);
    triggerSaved();
    try {
      await updateUserSettings({ theme_schedule_start: start });
    } catch (e) {}
  };

  const handleThemeScheduleEndChange = async (end) => {
    hapticFeedback('selection');
    const newSettings = { ...settings, theme_schedule_end: end };
    setSettings(newSettings);
    applyTheme({ scheduleEnd: end }, settings?.timezone);
    triggerSaved();
    try {
      await updateUserSettings({ theme_schedule_end: end });
    } catch (e) {}
  };

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const triggerSaved = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleSaveBackend = () => {
    hapticFeedback('medium');
    setCustomBackendUrl(backendInput);
    setCustomBackend(backendInput.trim());
    triggerSaved();
    if (onRefresh) onRefresh();
  };

  const handleResetBackend = () => {
    hapticFeedback('light');
    setCustomBackendUrl('');
    setCustomBackend('');
    setBackendInput('');
    triggerSaved();
    if (onRefresh) onRefresh();
  };

  const handleSaveAiKeys = () => {
    hapticFeedback('medium');
    setGeminiKey(geminiKeyInput);
    setGroqKey(groqKeyInput);
    setOpenRouterKey(openRouterKeyInput);
    triggerSaved();
    if (onRefresh) onRefresh();
  };

  const handleToggle = async (key) => {
    if (!settings) return;
    hapticFeedback('selection');
    const currentVal = settings[key] !== false;
    const newSettings = { ...settings, [key]: !currentVal };
    setSettings(newSettings);
    await updateUserSettings({ [key]: newSettings[key] });
    triggerSaved();
    if (onRefresh) onRefresh();
  };

  const handleDayEndChange = async (val) => {
    if (!settings) return;
    hapticFeedback('selection');
    const newSettings = { ...settings, day_end_time: val };
    setSettings(newSettings);
    await updateUserSettings({ day_end_time: val });
    triggerSaved();
    if (onRefresh) onRefresh();
  };

  const handleGoalCleanupChange = async (days) => {
    if (!settings) return;
    hapticFeedback('selection');
    const newSettings = { ...settings, goal_cleanup_days: days };
    setSettings(newSettings);
    await updateUserSettings({ goal_cleanup_days: days });
    triggerSaved();
    if (onRefresh) onRefresh();
  };

  const handleMorningTimeChange = async (val) => {
    if (!settings) return;
    hapticFeedback('selection');
    const newSettings = { ...settings, morning_digest_time: val };
    setSettings(newSettings);
    await updateUserSettings({ morning_digest_time: val });
    triggerSaved();
    if (onRefresh) onRefresh();
  };

  const handleAutoDetectTz = async () => {
    hapticFeedback('medium');
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
    if (!settings) return;
    const newSettings = { ...settings, timezone: detected };
    setSettings(newSettings);
    await updateUserSettings({ timezone: detected });
    triggerSaved();
    if (onRefresh) onRefresh();
  };

  const handleProviderSelect = async (providerId) => {
    if (!settings) return;
    hapticFeedback('selection');
    const newSettings = { ...settings, ai_provider: providerId };
    setSettings(newSettings);
    await updateUserSettings({ ai_provider: providerId });
    triggerSaved();
    if (onRefresh) onRefresh();
  };

  if (!settings) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
        Загрузка настроек...
      </div>
    );
  }

  return (
    <div className="tab-scroll-container settings-tab-container">
      <ViewHeader
        title="Параметры"
        subtitle="Уведомления, время завершения дня и AI-интеграция"
        subtitlePrefix={
          savedSuccess && (
            <span
              style={{
                fontSize: 'var(--font-caption)',
                color: 'var(--accent-success)',
                background: 'var(--accent-success-dim)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              <Check size={11} /> Сохранено
            </span>
          )
        }
      />

      <div className="settings-content-wrap">

        {/* User profile card */}
        <div className="settings-profile-card">
          <div className="header-avatar-circle" style={{ width: 44, height: 44 }}>
            {currentUser.photo_url && !avatarError ? (
              <img
                src={currentUser.photo_url}
                alt={currentUser.first_name || 'User'}
                className="header-avatar-img"
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <span className="header-avatar-initial" style={{ fontSize: 18 }}>
                {(currentUser.first_name || 'П').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {currentUser.first_name || 'Пользователь'}
            </div>
            {currentUser.username && (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                @{currentUser.username}
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
              Telegram ID: {currentUser.id}
            </div>
          </div>
        </div>

        <div className="settings-desktop-grid">
        {/* ========================================================
            ACCORDION 0: Оформление и тема (Open by default)
            ======================================================== */}
        <section className="linear-section settings-accordion-section">
          <div
            className="settings-accordion-header"
            onClick={toggleAppearance}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleAppearance();
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <SunMoon size={16} style={{ color: 'var(--text-primary)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Оформление и тема
              </span>
            </div>
            {isAppearanceOpen ? (
              <ChevronUp size={16} style={{ color: 'var(--text-tertiary)' }} />
            ) : (
              <ChevronDown size={16} style={{ color: 'var(--text-tertiary)' }} />
            )}
          </div>

          {isAppearanceOpen && (
            <div className="settings-accordion-content">
              {/* SECTION: Theme selector */}
              <div className="settings-section-title">
                Тема интерфейса
              </div>
              <div className="settings-group" style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  Выберите визуальную тему оформления или автоматическую синхронизацию.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { id: 'auto', label: 'Авто', icon: SunMoon },
                    { id: 'light', label: 'Светлая', icon: Sun },
                    { id: 'dark', label: 'Тёмная', icon: Moon },
                  ].map((t) => {
                    const isSelected = (settings?.theme_mode || 'auto') === t.id;
                    const IconComp = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`filter-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => handleThemeModeChange(t.id)}
                        style={{
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          padding: '12px 6px',
                          height: 'auto',
                          borderRadius: 'var(--radius-md)',
                          gap: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        <IconComp size={18} />
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION: Sunrise / Sunset schedule */}
              <div className="settings-section-title">
                Расписание дня и ночи
              </div>
              <div className="settings-group">
                <div
                  className="settings-row"
                  onClick={handleToggleThemeSchedule}
                  style={{ cursor: 'pointer' }}
                >
                  <div>
                    <div className="settings-row-label">Автосмена по времени суток</div>
                    <div className="settings-row-desc">
                      Включает светлую тему днём и тёмную ночью по вашему часовому поясу
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`linear-toggle ${settings?.theme_schedule_enabled ? 'active' : ''}`}
                    aria-label="Автосмена по времени суток"
                  >
                    <div className="linear-toggle-knob" />
                  </button>
                </div>

                {settings?.theme_schedule_enabled && (
                  <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                          <Sunrise size={14} style={{ color: 'var(--text-tertiary)' }} />
                          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            Начало дня (светлая тема)
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                          {['06:00', '07:00', '08:00', '09:00'].map((time) => {
                            const isSelected = (settings?.theme_schedule_start || '07:00') === time;
                            return (
                              <button
                                key={time}
                                type="button"
                                className={`filter-chip ${isSelected ? 'active' : ''}`}
                                onClick={() => handleThemeScheduleStartChange(time)}
                                style={{ justifyContent: 'center', padding: '6px 4px', fontSize: '12px' }}
                              >
                                {time}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                          <Sunset size={14} style={{ color: 'var(--text-tertiary)' }} />
                          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            Конец дня / закат (тёмная тема)
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                          {['19:00', '20:00', '21:00', '22:00'].map((time) => {
                            const isSelected = (settings?.theme_schedule_end || '20:00') === time;
                            return (
                              <button
                                key={time}
                                type="button"
                                className={`filter-chip ${isSelected ? 'active' : ''}`}
                                onClick={() => handleThemeScheduleEndChange(time)}
                                style={{ justifyContent: 'center', padding: '6px 4px', fontSize: '12px' }}
                              >
                                {time}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ========================================================
            ACCORDION 1: Уведомления и расписание (Open by default)
            ======================================================== */}
        <section className="linear-section settings-accordion-section">
          <div
            className="settings-accordion-header"
            onClick={toggleNotifications}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleNotifications();
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Bell size={16} style={{ color: 'var(--text-primary)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Уведомления и расписание
              </span>
            </div>
            {isNotificationsOpen ? (
              <ChevronUp size={16} style={{ color: 'var(--text-tertiary)' }} />
            ) : (
              <ChevronDown size={16} style={{ color: 'var(--text-tertiary)' }} />
            )}
          </div>

          {isNotificationsOpen && (
            <div className="settings-accordion-content">
              {/* SECTION: Notifications */}
              <div className="settings-section-title">
                Уведомления в Telegram
              </div>
              <div className="settings-group">
                {[
                  { key: 'reminder_6h_enabled', label: 'Напоминание за 6 ч. до конца дня' },
                  { key: 'reminder_3h_enabled', label: 'Напоминание за 3 ч. до конца дня' },
                  { key: 'reminder_1h_enabled', label: 'Срочное напоминание за 1 ч.' },
                  { key: 'praise_notifications_enabled', label: 'Похвала, если все дела завершены' },
                  { key: 'morning_digest_enabled', label: 'Утренний дайджест задач' },
                  { key: 'evening_digest_enabled', label: 'Вечерний отчет и итоги дня (за 15м)' },
                ].map((item) => {
                  const isEnabled = settings[item.key] !== false;
                  return (
                    <div
                      key={item.key}
                      className="settings-row"
                      onClick={() => handleToggle(item.key)}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="settings-row-label">{item.label}</span>
                      <button
                        type="button"
                        className={`linear-toggle ${isEnabled ? 'active' : ''}`}
                        aria-label={item.label}
                      >
                        <div className="linear-toggle-knob" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Standalone Action: Send test notification */}
              <div style={{ margin: '10px 0 16px 0' }}>
                <button
                  type="button"
                  onClick={handleSendTestNotification}
                  disabled={isSendingTest}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '11px 16px',
                    fontSize: '13px',
                    fontWeight: '500',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    cursor: isSendingTest ? 'default' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Bell size={14} style={{ color: 'var(--accent-primary)' }} />
                  {isSendingTest ? 'Отправка...' : 'Отправить тестовое уведомление в Telegram'}
                </button>
                {testFeedback && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: testFeedback.error ? 'var(--color-danger, #ef4444)' : 'var(--color-success, #22c55e)',
                      textAlign: 'center',
                      marginTop: '8px',
                      fontWeight: '500',
                    }}
                  >
                    {testFeedback.text}
                  </div>
                )}
              </div>

              {/* SECTION: Morning Digest */}
              {settings.morning_digest_enabled !== false && (
                <>
                  <div className="settings-section-title">
                    Время утреннего дайджеста
                  </div>
                  <div className="settings-group" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      Время отправки краткой сводки главных задач и привычек на день в Telegram.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                      {['07:00', '08:00', '09:00', '10:00'].map((time) => {
                        const isSelected = (settings.morning_digest_time || '09:00') === time;
                        return (
                          <button
                            key={time}
                            type="button"
                            className={`filter-chip ${isSelected ? 'active' : ''}`}
                            onClick={() => handleMorningTimeChange(time)}
                            style={{
                              justifyContent: 'center',
                              padding: '8px 4px',
                            }}
                          >
                            {time}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* SECTION: Day end cutoff */}
              <div className="settings-section-title">
                Время сброса дня
              </div>
              <div className="settings-group" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  В это время невыполненные задачи дня переходят в просроченные, а ежедневные привычки сбрасываются.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {['00:00', '01:00', '02:00', '03:00'].map((time) => {
                    const isSelected = settings.day_end_time === time;
                    return (
                      <button
                        key={time}
                        type="button"
                        className={`filter-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => handleDayEndChange(time)}
                        style={{
                          justifyContent: 'center',
                          padding: '8px 4px',
                        }}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION: Goals retention */}
              <div className="settings-section-title">
                Автоудаление выполненных целей
              </div>
              <div className="settings-group" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  Срок хранения закрытых целей перед их окончательным удалением из списка.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                  {[
                    { label: 'Сразу', days: 0 },
                    { label: '1 дн.', days: 1 },
                    { label: '2 дн.', days: 2 },
                    { label: '3 дн.', days: 3 },
                    { label: '7 дн.', days: 7 },
                  ].map((item) => {
                    const currentDays = settings.goal_cleanup_days !== undefined ? settings.goal_cleanup_days : 3;
                    const isSelected = currentDays === item.days;
                    return (
                      <button
                        key={item.days}
                        type="button"
                        className={`filter-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => handleGoalCleanupChange(item.days)}
                        style={{
                          justifyContent: 'center',
                          padding: '8px 4px',
                          fontSize: '12px',
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION: Timezone */}
              <div className="settings-section-title">
                Часовой пояс
              </div>
              <div className="settings-group">
                <div className="settings-row">
                  <div>
                    <div className="settings-row-label">{settings.timezone || 'Europe/Moscow'}</div>
                    <div className="settings-row-desc">Используется для точных напоминаний</div>
                  </div>
                  <button
                    type="button"
                    className="filter-chip"
                    onClick={handleAutoDetectTz}
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                  >
                    <Globe size={12} />
                    <span>Определить</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ========================================================
            ACCORDION 2: ИИ и API подключение (Collapsed by default)
            ======================================================== */}
        <section className="linear-section settings-accordion-section">
          <div
            className="settings-accordion-header"
            onClick={toggleAi}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleAi();
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Cpu size={16} style={{ color: 'var(--text-primary)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                ИИ и API подключение
              </span>
            </div>
            {isAiOpen ? (
              <ChevronUp size={16} style={{ color: 'var(--text-tertiary)' }} />
            ) : (
              <ChevronDown size={16} style={{ color: 'var(--text-tertiary)' }} />
            )}
          </div>

          {isAiOpen && (
            <div className="settings-accordion-content">
              {/* SECTION: Backend server */}
              <div className="settings-section-title">
                Сервер бэкенда (API)
              </div>
              <div className="settings-group" style={{ padding: '14px 16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Server size={14} style={{ color: customBackend ? 'var(--accent-primary)' : 'var(--text-tertiary)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {customBackend ? 'Подключен внешний бэкенд' : 'Локальный режим (GitHub Pages Demo)'}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      background: customBackend ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      color: customBackend ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: 500,
                    }}
                  >
                    {customBackend ? 'Live API' : 'Демо (LocalStorage)'}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px', lineHeight: 1.4 }}>
                  {customBackend ? (
                    <>Запросы отправляются на <code style={{ color: 'var(--text-secondary)' }}>{customBackend}</code>. Задачи синхронизируются с ботом.</>
                  ) : (
                    'GitHub Pages — статический хостинг без Python и базы данных. В демо-режиме все задачи и цели сохраняются прямо в браузере. Чтобы подключить Telegram-бота, укажите URL запущенного бэкенда (Render / Railway / ngrok).'
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="url"
                    placeholder="https://taskerbot-api.onrender.com"
                    value={backendInput}
                    onChange={(e) => setBackendInput(e.target.value)}
                    className="settings-input"
                    style={{
                      flex: '1 1 180px',
                      minWidth: 0,
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="filter-chip active"
                      onClick={handleSaveBackend}
                      style={{ padding: '0 12px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Сохранить
                    </button>
                    {customBackend && (
                      <button
                        type="button"
                        className="filter-chip"
                        onClick={handleResetBackend}
                        style={{ padding: '0 10px', fontSize: '12px', cursor: 'pointer' }}
                        title="Сбросить на демо-режим"
                      >
                        Сброс
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION: AI Providers */}
              <div className="settings-section-title">
                AI Провайдер
              </div>
              <div className="settings-group" style={{ padding: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    {
                      id: 'auto',
                      name: 'Auto-Fast Cascade (Groq + OpenRouter + Gemini)',
                      desc: 'Сверхбыстрый интеллектуальный каскад: сначала Groq (~0.2с) и бесплатные модели OpenRouter, при сбое — Google Gemini.',
                    },
                    {
                      id: 'groq',
                      name: 'Groq LPU (Llama & Whisper)',
                      desc: 'Молниеносная генерация и транскрипция аудио на специализированных чипах Groq LPU.',
                    },
                    {
                      id: 'openrouter',
                      name: 'OpenRouter Free Models',
                      desc: 'Легковесные модели (Gemma 4, Liquid 2.6B, Nemotron) через единый API OpenRouter.',
                    },
                    {
                      id: 'gemini',
                      name: 'Google Gemini (3.8 Flash / 3.5 Flash-Lite)',
                      desc: 'Официальные модели Google: точный разбор голоса и сложных задач, декомпозиция дат.',
                    },
                  ].map((prov) => {
                    const isSelected = (settings.ai_provider || 'auto') === prov.id;
                    return (
                      <div
                        key={prov.id}
                        onClick={() => handleProviderSelect(prov.id)}
                        style={{
                          padding: '11px 13px',
                          borderRadius: 'var(--radius-md)',
                          background: isSelected ? 'var(--bg-elevated)' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {prov.name}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px', lineHeight: 1.3 }}>
                            {prov.desc}
                          </div>
                        </div>

                        <div
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            border: isSelected ? '5px solid var(--accent-primary)' : '1.5px solid var(--text-muted)',
                            background: isSelected ? '#ffffff' : 'transparent',
                            flexShrink: 0,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION: Direct AI Keys (Browser / Offline Mode) */}
              <div className="settings-section-title">
                Ключи API для автономного режима (GitHub Pages)
              </div>
              <div className="settings-group" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px', lineHeight: 1.4 }}>
                  Позволяют нейросети расшифровывать голос и задачи прямо в браузере без запуска бэкенда. Ключи сохраняются локально в вашем браузере.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Key size={12} /> OpenRouter API Key (Бесплатные модели)
                    </div>
                    <input
                      type="password"
                      placeholder="Вставьте ваш OpenRouter API Key (sk-or-v1-...)"
                      value={openRouterKeyInput}
                      onChange={(e) => setOpenRouterKeyInput(e.target.value)}
                      className="settings-input"
                      style={{ fontFamily: 'monospace' }}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Key size={12} /> Google Gemini API Key
                    </div>
                    <input
                      type="password"
                      placeholder="Вставьте ваш Google Gemini API Key"
                      value={geminiKeyInput}
                      onChange={(e) => setGeminiKeyInput(e.target.value)}
                      className="settings-input"
                      style={{ fontFamily: 'monospace' }}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Key size={12} /> Groq API Key
                    </div>
                    <input
                      type="password"
                      placeholder="Вставьте ваш Groq API Key (gsk_...)"
                      value={groqKeyInput}
                      onChange={(e) => setGroqKeyInput(e.target.value)}
                      className="settings-input"
                      style={{ fontFamily: 'monospace' }}
                    />
                  </div>

                  <button
                    type="button"
                    className="filter-chip active"
                    onClick={handleSaveAiKeys}
                    style={{
                      padding: '8px 16px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      alignSelf: 'flex-start',
                      marginTop: '4px',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    Сохранить ключи API
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}
