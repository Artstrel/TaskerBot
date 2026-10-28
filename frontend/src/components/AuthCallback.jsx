import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, ArrowLeft, RotateCw } from 'lucide-react';
import Mascot from './Mascot';
import { exchangeTelegramAuthCode, hapticFeedback } from '../api';

export default function AuthCallback({ onLoginSuccess, onCancel }) {
  const [status, setStatus] = useState('processing'); // 'processing' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const performExchange = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
          throw new Error(errorDescription || `Ошибка Telegram: ${error}`);
        }

        if (!code) {
          throw new Error('Код авторизации Telegram не найден в URL параметрах');
        }

        const redirectUri = `${window.location.origin}/auth/callback`;
        const result = await exchangeTelegramAuthCode(code, state, redirectUri);

        if (!isMounted) return;

        hapticFeedback('success');
        setStatus('success');

        // Clean up URL parameters without refreshing
        window.history.replaceState({}, document.title, window.location.pathname.replace('/auth/callback', '') || '/');

        setTimeout(() => {
          if (onLoginSuccess) {
            onLoginSuccess(result.user);
          } else {
            window.location.reload();
          }
        }, 600);
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
  }, [onLoginSuccess]);

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

        {status === 'processing' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Авторизация через Telegram...
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Проверяем подтверждение входа и синхронизируем ваш профиль.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', color: 'var(--text-tertiary)' }}>
              <RotateCw size={18} className="animate-spin" />
              <span style={{ fontSize: '12px' }}>Обмен токенами безопасности...</span>
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
                window.history.replaceState({}, document.title, '/');
                if (onCancel) {
                  onCancel();
                } else {
                  window.location.href = '/';
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
