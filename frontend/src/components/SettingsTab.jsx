import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Check,
  Server,
  Key,
  RotateCw,
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
    const newSettings = { ...settings, [key]: !settings[key] };
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
    <div className="linear-section" style={{ paddingBottom: '30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Параметры
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            Уведомления, время и AI-интеграция
          </div>
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
          borderRadius: 'var(--radius-md)',
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
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: '4px' }}>
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

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="url"
            placeholder="https://taskerbot-api.onrender.com"
            value={backendInput}
            onChange={(e) => setBackendInput(e.target.value)}
            style={{
              flex: 1,
              fontSize: '12px',
              padding: '8px 10px',
              background: 'var(--bg-card)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            className="filter-chip active"
            onClick={handleSaveBackend}
            style={{ padding: '0 12px', fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}
          >
            Сохранить
          </button>
          {customBackend && (
            <button
              type="button"
              className="filter-chip"
              onClick={handleResetBackend}
              style={{ padding: '0 10px', fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}
              title="Сбросить на демо-режим"
            >
              Сброс
            </button>
          )}
        </div>
      </div>

      {/* SECTION: Notifications */}
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: '4px' }}>
        Уведомления в Telegram
      </div>
      <div className="settings-group">
        {[
          { key: 'reminder_6h_enabled', label: 'Напоминание за 6 ч. до конца дня' },
          { key: 'reminder_3h_enabled', label: 'Напоминание за 3 ч. до конца дня' },
          { key: 'reminder_1h_enabled', label: 'Срочное напоминание за 1 ч.' },
          { key: 'morning_digest_enabled', label: 'Утренний дайджест задач' },
          { key: 'evening_digest_enabled', label: 'Вечерний отчет и итоги дня' },
        ].map((item) => {
          const isEnabled = settings[item.key];
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

      {/* SECTION: Day end cutoff */}
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: '4px' }}>
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
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {time}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION: Timezone */}
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: '4px' }}>
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

      {/* SECTION: AI Providers */}
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: '4px' }}>
        AI Провайдер
      </div>
      <div className="settings-group" style={{ padding: '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            {
              id: 'auto',
              name: 'Auto-Fast Cascade (Groq + OpenRouter + Gemini)',
              badge: 'Рекомендуется',
              desc: 'Сверхбыстрый интеллектуальный каскад: сначала Groq (~0.2с) и бесплатные модели OpenRouter, при сбое — Google Gemini.',
            },
            {
              id: 'groq',
              name: 'Groq LPU (Llama & Whisper)',
              badge: 'Молниеносно ~0.2с',
              desc: 'Молниеносная генерация и транскрипция аудио на специализированных чипах Groq LPU.',
            },
            {
              id: 'openrouter',
              name: 'OpenRouter Free Models',
              badge: 'Бесплатные модели',
              desc: 'Легковесные модели (Gemma 4, Liquid 2.6B, Nemotron) через единый API OpenRouter.',
            },
            {
              id: 'gemini',
              name: 'Google Gemini (3.8 Flash / 3.5 Flash-Lite)',
              badge: 'Мультимодальный',
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
                  borderRadius: 'var(--radius-sm)',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {prov.name}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {prov.badge}
                    </span>
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
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: '4px', marginTop: '16px' }}>
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
              style={{
                width: '100%',
                fontSize: '12px',
                padding: '8px 10px',
                background: 'var(--bg-card)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: 'monospace',
                boxSizing: 'border-box',
              }}
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
              style={{
                width: '100%',
                fontSize: '12px',
                padding: '8px 10px',
                background: 'var(--bg-card)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: 'monospace',
                boxSizing: 'border-box',
              }}
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
              style={{
                width: '100%',
                fontSize: '12px',
                padding: '8px 10px',
                background: 'var(--bg-card)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: 'monospace',
                boxSizing: 'border-box',
              }}
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
            }}
          >
            Сохранить ключи API
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
