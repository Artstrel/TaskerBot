import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Calendar,
  CheckCircle2,
  ShoppingCart,
  Mic,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import Mascot from './Mascot';
import { getTelegramAuthUrl, exchangeTelegramWidgetAuth, authenticateWithTelegramIdToken, devLogin, setDemoMode, hapticFeedback } from '../api';

export default function LoginScreen({ onLoginSuccess, onEnterDemo }) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [mascotMood, setMascotMood] = useState('idle');

  useEffect(() => {
    const handleMessage = async (event) => {
      try {
        let msg = event.data;
        if (typeof msg === 'string') {
          try {
            msg = JSON.parse(msg);
          } catch (_) {}
        }
        if (msg?.event === 'auth_result' && msg?.result) {
          if (msg.result === false) {
            setErrorMessage('Авторизация отменена в Telegram');
            setIsLoading(false);
            return;
          }
          // Direct Telegram OIDC id_token (from telegram-login.js or oauth.telegram.org postMessage)
          if (typeof msg.result === 'string') {
            setIsLoading(true);
            const data = await authenticateWithTelegramIdToken(msg.result);
            if (onLoginSuccess) {
              onLoginSuccess(data.user);
            } else {
              window.location.replace('/');
            }
            return;
          }
          if (typeof msg.result === 'object' && msg.result.id_token) {
            setIsLoading(true);
            const data = await authenticateWithTelegramIdToken(msg.result.id_token);
            if (onLoginSuccess) {
              onLoginSuccess(data.user);
            } else {
              window.location.replace('/');
            }
            return;
          }
          // Legacy Telegram widget hash payload
          if (typeof msg.result === 'object' && msg.result.hash) {
            setIsLoading(true);
            const data = await exchangeTelegramWidgetAuth(msg.result);
            if (onLoginSuccess) {
              onLoginSuccess(data.user);
            } else {
              window.location.replace('/');
            }
            return;
          }
        }
      } catch (err) {
        console.error('PostMessage auth error:', err);
        setErrorMessage(err.message || 'Ошибка обработки ответа Telegram');
        setIsLoading(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onLoginSuccess]);

  const handleTelegramLogin = async () => {
    hapticFeedback('medium');
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const data = await getTelegramAuthUrl(redirectUri);
      if (data?.auth_url) {
        // Full-page redirect prevents popup blockers and cross-context sessionStorage loss
        window.location.href = data.auth_url;
      } else {
        throw new Error('Не получен URL авторизации от бэкенда');
      }
    } catch (err) {
      console.error('Telegram login initiation error:', err);
      setIsLoading(false);
      setErrorMessage(err.message || 'Ошибка подключения к серверу авторизации');
      setMascotMood('sad');
    }
  };

  const handleDemoClick = () => {
    hapticFeedback('selection');
    setDemoMode(true);
    if (onEnterDemo) {
      onEnterDemo();
    } else {
      window.location.reload();
    }
  };

  const handleDevLogin = async () => {
    hapticFeedback('medium');
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await devLogin(123456789, 'Тестовый Пользователь', 'tasker_tester');
      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error('Dev login error:', err);
      setIsLoading(false);
      setErrorMessage(err.message || 'Ошибка тестового входа');
    }
  };

  return (
    <div className="login-screen-wrapper">
      <div className="login-screen-glow" />

      <motion.div
        className="login-screen-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        {/* Top Mascot & Status */}
        <div className="login-mascot-box">
          <Mascot
            state={mascotMood}
            size={72}
            interactive={true}
            onClick={() => {
              setMascotMood(m => (m === 'idle' ? 'happy' : m === 'happy' ? 'thinking' : 'idle'));
            }}
          />
          <div className="login-badge">
            <Sparkles size={13} className="text-accent" />
            <span>TaskerBot Web</span>
          </div>
        </div>

        {/* Hero title & text */}
        <div className="login-hero-header">
          <h1 className="login-title">Организуйте день без хаоса</h1>
          <p className="login-subtitle">
            Привычки, задачи, списки покупок и голосовой AI-ассистент — синхронизировано с вашим Telegram.
          </p>
        </div>

        {/* Feature Pills Grid */}
        <div className="login-features-grid">
          <div className="login-feature-item">
            <div className="login-feature-icon">
              <Calendar size={17} />
            </div>
            <div className="login-feature-texts">
              <span className="login-feature-title">Фокус на сегодня</span>
              <span className="login-feature-desc">Умные дедлайны и перенос задач</span>
            </div>
          </div>

          <div className="login-feature-item">
            <div className="login-feature-icon">
              <CheckCircle2 size={17} />
            </div>
            <div className="login-feature-texts">
              <span className="login-feature-title">Привычки & Стрики</span>
              <span className="login-feature-desc">Отслеживание ежедневного прогресса</span>
            </div>
          </div>

          <div className="login-feature-item">
            <div className="login-feature-icon">
              <ShoppingCart size={17} />
            </div>
            <div className="login-feature-texts">
              <span className="login-feature-title">Список покупок</span>
              <span className="login-feature-desc">Быстрый чек-лист с количеством</span>
            </div>
          </div>

          <div className="login-feature-item">
            <div className="login-feature-icon">
              <Mic size={17} />
            </div>
            <div className="login-feature-texts">
              <span className="login-feature-title">Голосовой AI-ввод</span>
              <span className="login-feature-desc">Авто-распознавание любых заметок</span>
            </div>
          </div>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <motion.div
            className="login-error-banner"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <span>{errorMessage}</span>
          </motion.div>
        )}

        {/* Actions block */}
        <div className="login-actions">
          <button
            type="button"
            className="login-btn-telegram"
            onClick={handleTelegramLogin}
            disabled={isLoading}
          >
            <svg
              className="tg-icon-svg"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="currentColor"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
            <span>{isLoading ? 'Перенаправление в Telegram...' : 'Войти через Telegram'}</span>
            <ArrowRight size={18} className="login-btn-arrow" />
          </button>

          <button
            type="button"
            className="login-btn-demo"
            onClick={handleDemoClick}
            disabled={isLoading}
          >
            <span>Попробовать в демо-режиме</span>
          </button>
        </div>

        {/* Dev sandbox toggle */}
        <div className="login-dev-toggle-row">
          <button
            type="button"
            className="login-dev-link"
            onClick={() => setShowDevPanel(!showDevPanel)}
          >
            <Terminal size={13} />
            <span>Локальное тестирование</span>
          </button>

          {showDevPanel && (
            <motion.div
              className="login-dev-panel"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                Вход без необходимости настройки домена в BotFather:
              </div>
              <button
                type="button"
                className="login-dev-btn"
                onClick={handleDevLogin}
                disabled={isLoading}
              >
                Быстрый вход разработчика (ID 123456789)
              </button>
            </motion.div>
          )}
        </div>

        {/* Security footnote */}
        <div className="login-footnote">
          <ShieldCheck size={14} className="text-tertiary" />
          <span>Официальный протокол Telegram OpenID Connect. Пароли не требуются.</span>
        </div>
      </motion.div>
    </div>
  );
}
