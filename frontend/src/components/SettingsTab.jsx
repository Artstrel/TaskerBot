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
import Mascot from './Mascot';

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

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(() => {
    const saved = localStorage.getItem('settings_notifications_open');
    return saved !== null ? saved === 'true' : true;
  });
  const [isAiOpen, setIsAiOpen] = useState(() => {
    const saved = localStorage.getItem('settings_ai_open');
    return saved !== null ? saved === 'true' : false;
  });

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
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }, []);

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
      {/* Mobile iOS HIG Large Title */}
      <h1 className="mobile-large-title mobile-only-item">Параметры</h1>

      {/* Desktop Material 3 View Header */}
      <div className="desktop-view-header desktop-only-item">
        <div className="desktop-view-title-group">
          <h1 className="desktop-view-title">Параметры</h1>
          <div className="desktop-view-subtitle">
            Уведомления, время завершения дня и AI-интеграция
          </div>
        </div>
        <div className="desktop-view-actions">
          {onForceRefresh && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                hapticFeedback('light');
                onForceRefresh();
              }}
              title="Обновить настройки"
            >
              <RotateCw size={14} className={isSyncing ? 'spin-icon' : ''} />
              <span>Обновить</span>
            </button>
          )}
          {savedSuccess && (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--accent-success)',
                background: 'var(--accent-success-dim)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Check size={12} /> Сохранено
            </span>
          )}
        </div>
      </div>

      <div className="settings-content-wrap">
        {/* Mobile Sub-Header Bar */}
        <div className="mobile-only-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', width: '100%' }}>
          <div className="mobile-subheader-text">
            Уведомления, время и AI-интеграция
          </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onForceRefresh && (
            <button
              type="button"
              className="canvas-sync-btn mobile-only-item"
              onClick={() => {
                hapticFeedback('light');
                onForceRefresh();
              }}
              title="Обновить настройки"
            >
              <RotateCw size={13} className={isSyncing ? 'spin-icon' : ''} />
            </button>
          )}
          {savedSuccess && (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--accent-success)',
                background: 'var(--accent-success-dim)',
                padding: '3px 8px',
                borderRadius: 'var(--radius-full)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Check size={12} /> Сохранено
            </span>
          )}
        </div>
      </div>

      {/* User profile row */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: 'none',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <Mascot state="idle" size={42} interactive={true} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {currentUser.first_name || 'Пользователь'}
          </div>
          {currentUser.username && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              @{currentUser.username}
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
            Telegram ID: {currentUser.id}
          </div>
        </div>
      </div>

      <div className="settings-desktop-grid">
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
