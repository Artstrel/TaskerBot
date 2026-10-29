import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, ArrowLeft, RotateCw } from 'lucide-react';
import Mascot from './Mascot';
import {
  exchangeTelegramAuthCode,
  exchangeTelegramWidgetAuth,
  hapticFeedback,
  isAuthenticated,
  getDefaultRedirectUri,
  getAppHomeUrl,
} from '../api';

export default function AuthCallback({ onLoginSuccess, onCancel }) {
  const [status, setStatus] = useState('processing'); // 'processing' | 'warming_up' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const hasExecutedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const homeUrl = getAppHomeUrl();

    // If session is already established (e.g. from previous successful exchange or refresh), redirect immediately
    if (isAuthenticated()) {
      window.history.replaceState({}, document.title, homeUrl);
      if (onLoginSuccess) {
        onLoginSuccess();
      } else {
        window.location.replace(homeUrl);
      }
      return;
    }

    if (hasExecutedRef.current) return;
    hasExecutedRef.current = true;

    const performExchange = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        let code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
          throw new Error(errorDescription || `Ошибка Telegram: ${error}`);
        }

        // 1. Check for Telegram tgAuthResult in hash (e.g. #tgAuthResult=eyJpZCI6...)
        let widgetData = null;
        const hash = window.location.hash;
        if (hash && hash.includes('tgAuthResult=')) {
          const rawHash = hash.split('tgAuthResult=')[1].split('&')[0];
          try {
            const decoded = atob(rawHash);
            if (decoded === 'false') {
              throw new Error('Авторизация отменена в Telegram');
            }
            widgetData = JSON.parse(decoded);
          } catch (e) {
            if (e.message && e.message.includes('отменена')) throw e;
            console.warn('Could not parse tgAuthResult JSON:', e);
          }
        }

        // 2. Check for Telegram Login Widget parameters in query string
        if (!widgetData && searchParams.has('hash') && searchParams.has('id')) {
          widgetData = {
            id: Number(searchParams.get('id')),
            first_name: searchParams.get('first_name') || '',
            last_name: searchParams.get('last_name') || '',
            username: searchParams.get('username') || '',
            photo_url: searchParams.get('photo_url') || '',
            auth_date: Number(searchParams.get('auth_date') || 0),
            hash: searchParams.get('hash'),
          };
        }

        // 3. Check for code in hash if missing in search
        if (!code && !widgetData && hash && hash.includes('code=')) {
          const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
          code = hashParams.get('code');
        }

        let result = null;
        if (widgetData) {
          result = await exchangeTelegramWidgetAuth(widgetData);
        } else if (code) {
          const redirectUri = getDefaultRedirectUri();
          const savedVerifier = typeof window !== 'undefined'
            ? (localStorage.getItem('tg_code_verifier') || sessionStorage.getItem('tg_code_verifier'))
            : null;
          result = await exchangeTelegramAuthCode(
            code,
            state,
            redirectUri,
            savedVerifier,
            (nextStep) => {
              if (!isMounted) return;
              if (nextStep === 'warming_up') {
                setStatus('warming_up');
              } else if (nextStep === 'exchanging') {
                setStatus('processing');
              }
            }
          );
        } else {
          // If neither widget data nor OAuth code is present
          window.history.replaceState({}, document.title, homeUrl);
          if (onCancel) onCancel();
          return;
        }

        if (!isMounted) return;

        hapticFeedback('success');
        setStatus('success');

        // Immediately clean up URL in address bar to homeUrl
        window.history.replaceState({}, document.title, homeUrl);

        // If opened inside popup, notify opener and close
        if (window.opener && typeof window.opener.postMessage === 'function') {
          try {
            window.opener.postMessage({ event: 'auth_result', result: result }, window.location.origin);
            setTimeout(() => {
              try { window.close(); } catch (_) {}
            }, 300);
            return;
          } catch (_) {}
        }

        setTimeout(() => {
          if (onLoginSuccess) {
            onLoginSuccess(result.user);
          } else {
            window.location.replace(homeUrl);
          }
        }, 400);
      } catch (err) {
        console.error('AuthCallback exchange error:', err);
        if (!isMounted) return;
        hapticFeedback('error');
        setStatus('error');
        setErrorMessage(err.message || 'Не удалось завершить авторизацию через Telegram');
      }
    };

    performExchange();

    return () => {
      isMounted = false;
    };
  }, [onLoginSuccess, onCancel]);

  return (
    <div className="login-screen-wrapper">
      <div className="login-screen-glow" />

      <motion.div
        className="login-screen-card text-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        style={{ maxWidth: 420 }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Mascot
            state={status === 'error' ? 'sad' : status === 'success' ? 'done' : 'thinking'}
            size={76}
            interactive={false}
          />
        </div>

        {(status === 'processing' || status === 'warming_up') && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {status === 'warming_up' ? 'Пробуждение облачного сервера...' : 'Авторизация через Telegram...'}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              {status === 'warming_up'
                ? 'Сервер выходит из спящего режима. Сессия откроется автоматически через несколько секунд.'
                : 'Проверяем подтверждение входа и синхронизируем ваш профиль.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', color: 'var(--text-tertiary)' }}>
              <RotateCw size={18} className="animate-spin" />
              <span style={{ fontSize: '12px' }}>
                {status === 'warming_up' ? 'Подключение к API TaskerBot...' : 'Обмен токенами безопасности...'}
              </span>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Вход выполнен успешно!
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Загружаем ваши задачи и привычки...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div style={{ display: 'inline-flex', padding: 10, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', marginBottom: 16 }}>
              <AlertCircle size={28} />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Не удалось войти
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.4 }}>
              {errorMessage}
            </p>
            <button
              type="button"
              className="login-btn-telegram"
              style={{ width: '100%' }}
              onClick={() => {
                const homeUrl = getAppHomeUrl();
                window.history.replaceState({}, document.title, homeUrl);
                if (onCancel) {
                  onCancel();
                } else {
                  window.location.href = homeUrl;
                }
              }}
            >
              <ArrowLeft size={16} />
              <span>Вернуться на экран входа</span>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
