import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Flame,
  ShoppingCart,
  Mic,
  ArrowRight,
  ShieldCheck,
  Terminal,
  Check,
  Clock,
} from 'lucide-react';
import BarVisualizer from './BarVisualizer';
import { getTelegramAuthUrl, exchangeTelegramWidgetAuth, authenticateWithTelegramIdToken, devLogin, setDemoMode, hapticFeedback } from '../api';
import { LOGIN_CONTENT } from '../constants/loginContent';
import brandAvatar from '../assets/brand-avatar.png';

const SLIDES = [
  {
    id: LOGIN_CONTENT.slides[0].id,
    badge: LOGIN_CONTENT.slides[0].badge,
    title: LOGIN_CONTENT.slides[0].title,
    subtitle: LOGIN_CONTENT.slides[0].subtitle,
    icon: Calendar,
    renderVisual: () => (
      <div className="slide-mockup-card">
        <div className="slide-mockup-header">
          <span className="slide-mockup-tag">
            <Calendar size={12} /> {LOGIN_CONTENT.slides[0].mockup.tag}
          </span>
          <span className="slide-mockup-time">{LOGIN_CONTENT.slides[0].mockup.time}</span>
        </div>
        <div className="slide-mockup-body">
          <div className="slide-mockup-check active">
            <Check size={13} strokeWidth={2.8} />
          </div>
          <div className="slide-mockup-text-col">
            <div className="slide-mockup-task-title">{LOGIN_CONTENT.slides[0].mockup.taskTitle}</div>
            <div className="slide-mockup-meta">{LOGIN_CONTENT.slides[0].mockup.meta}</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: LOGIN_CONTENT.slides[1].id,
    badge: LOGIN_CONTENT.slides[1].badge,
    title: LOGIN_CONTENT.slides[1].title,
    subtitle: LOGIN_CONTENT.slides[1].subtitle,
    icon: Flame,
    renderVisual: () => (
      <div className="slide-mockup-card">
        <div className="slide-mockup-header">
          <span className="slide-mockup-tag streak">
            <Flame size={12} /> {LOGIN_CONTENT.slides[1].mockup.streakTag}
          </span>
        </div>
        <div className="slide-mockup-habit-row">
          <div className="slide-mockup-habit-title">{LOGIN_CONTENT.slides[1].mockup.habitTitle}</div>
        </div>
        <div className="slide-mockup-days">
          {LOGIN_CONTENT.slides[1].mockup.days.map((day, idx) => {
            const isCompleted = idx < 6;
            return (
              <div
                key={day}
                className={`slide-mockup-day ${isCompleted ? 'completed' : 'today'}`}
              >
                <span>{day}</span>
                {isCompleted ? (
                  <Check size={10} strokeWidth={3} />
                ) : (
                  <div className="dot-pulse" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    ),
  },
  {
    id: LOGIN_CONTENT.slides[2].id,
    badge: LOGIN_CONTENT.slides[2].badge,
    title: LOGIN_CONTENT.slides[2].title,
    subtitle: LOGIN_CONTENT.slides[2].subtitle,
    icon: ShoppingCart,
    renderVisual: () => (
      <div className="slide-mockup-card">
        <div className="slide-mockup-header">
          <span className="slide-mockup-tag">
            <ShoppingCart size={12} /> {LOGIN_CONTENT.slides[2].mockup.tag}
          </span>
          <span className="slide-mockup-count">{LOGIN_CONTENT.slides[2].mockup.count}</span>
        </div>
        <div className="slide-mockup-list">
          {LOGIN_CONTENT.slides[2].mockup.items.map((item) => (
            <div key={item.name} className={`slide-mockup-item ${item.done ? 'done' : ''}`}>
              <div className={`slide-mockup-item-check ${item.done ? '' : 'empty'}`}>
                {item.done && <Check size={10} strokeWidth={3} />}
              </div>
              <span className="slide-mockup-item-name">{item.name}</span>
              <span className="slide-mockup-item-qty">{item.qty}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: LOGIN_CONTENT.slides[3].id,
    badge: LOGIN_CONTENT.slides[3].badge,
    title: LOGIN_CONTENT.slides[3].title,
    subtitle: LOGIN_CONTENT.slides[3].subtitle,
    icon: Mic,
    renderVisual: () => (
      <div className="slide-mockup-card slide-mockup-island">
        <div className="voice-stage-top">
          <div className="voice-timer-pill">
            <Clock size={11} style={{ opacity: 0.7 }} />
            <span className="voice-timer-display">{LOGIN_CONTENT.slides[3].mockup.timerDisplay}</span>
            <span className="voice-timer-limit">{LOGIN_CONTENT.slides[3].mockup.timerLimit}</span>
          </div>
        </div>

        <div className="voice-visualizer-center-stage">
          <BarVisualizer
            state="processing"
            barCount={7}
            height={32}
            barWidth={7}
            gap={5}
          />
        </div>

        <div className="voice-island-hint">
          {LOGIN_CONTENT.slides[3].mockup.hint}
        </div>
      </div>
    ),
  },
];

export default function LoginScreen({ onLoginSuccess, onEnterDemo }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideDirection, setSlideDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const timerRef = useRef(null);

  const goToSlide = useCallback((index, dir = 1) => {
    setSlideDirection(dir);
    setCurrentSlide(index);
  }, []);

  const nextSlide = useCallback(() => {
    setSlideDirection(1);
    setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
  }, []);

  const prevSlide = useCallback(() => {
    setSlideDirection(-1);
    setCurrentSlide((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  }, []);

  // Auto-slide effect (4.5s) with pause on touch/hover
  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      nextSlide();
    }, 4500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, nextSlide]);

  useEffect(() => {
    const handleMessage = async (event) => {
      try {
        let msg = event.data;
        if (typeof msg === 'string') {
          try {
            msg = JSON.parse(msg);
          } catch (_) { }
        }
        if (msg?.event === 'auth_result' && msg?.result) {
          if (msg.result === false) {
            setErrorMessage('Авторизация отменена в Telegram');
            setIsLoading(false);
            return;
          }
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
          if (typeof msg.result === 'object' && msg.result.access_token) {
            setIsLoading(true);
            if (onLoginSuccess) {
              onLoginSuccess(msg.result.user);
            } else {
              window.location.replace('/');
            }
            return;
          }
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
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
        if (isDesktop) {
          const width = 540;
          const height = 660;
          const left = window.screenLeft !== undefined ? window.screenLeft + (window.outerWidth - width) / 2 : 100;
          const top = window.screenTop !== undefined ? window.screenTop + (window.outerHeight - height) / 2 : 100;
          const popup = window.open(
            data.auth_url,
            'telegram_auth_popup',
            `width=${width},height=${height},left=${left},top=${top},status=0,toolbar=0,location=1`
          );
          if (popup && !popup.closed) {
            return;
          }
        }
        window.location.href = data.auth_url;
      } else {
        throw new Error('Не получен URL авторизации от бэкенда');
      }
    } catch (err) {
      console.error('Telegram login initiation error:', err);
      setIsLoading(false);
      setErrorMessage(err.message || 'Ошибка подключения к серверу авторизации');
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
      setErrorMessage(err.message || LOGIN_CONTENT.errors.devLoginFailed);
    }
  };

  const currentSlideData = SLIDES[currentSlide];

  return (
    <div className="login-screen-wrapper">
      <div className="login-screen-glow" />

      <div className="login-screen-card login-screen-onboarding">
        {/* Top Header: Compact Brand Badge */}
        <header className="login-top-bar">
          <div className="login-brand-badge">
            <img
              src={brandAvatar}
              alt={LOGIN_CONTENT.brand.badgeText}
              className="login-brand-avatar"
              width="18"
              height="18"
            />
            <span className="login-brand-text">{LOGIN_CONTENT.brand.badgeText}</span>
          </div>
        </header>

        {/* Center: Interactive Carousel */}
        <section
          className="login-slider-container"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          <div className="login-slide-viewport">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentSlideData.id}
                className="login-slide-content"
                initial={{ opacity: 0, x: slideDirection > 0 ? 36 : -36 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: slideDirection > 0 ? -36 : 36 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -40 || info.velocity.x < -300) {
                    hapticFeedback('selection');
                    nextSlide();
                  } else if (info.offset.x > 40 || info.velocity.x > 300) {
                    hapticFeedback('selection');
                    prevSlide();
                  }
                }}
              >
                {/* Visual UI Mockup */}
                <div className="slide-visual-wrapper">
                  {currentSlideData.renderVisual()}
                </div>

                {/* Text Block */}
                <div className="login-slide-info">
                  <h1 className="login-slide-title">{currentSlideData.title}</h1>
                  <p className="login-slide-desc">{currentSlideData.subtitle}</p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Pagination Indicators (Dots) */}
          <div className="login-slider-dots" role="tablist" aria-label={LOGIN_CONTENT.sliderAriaLabel}>
            {SLIDES.map((slide, index) => {
              const isActive = index === currentSlide;
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={slide.title}
                  className={`login-slider-dot ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    hapticFeedback('selection');
                    goToSlide(index, index > currentSlide ? 1 : -1);
                  }}
                />
              );
            })}
          </div>
        </section>

        {/* Bottom Section: Unified UI Kit Buttons and Auth */}
        <footer className="login-bottom-section">
          {errorMessage && (
            <motion.div
              className="login-error-banner"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
            >
              <span>{errorMessage}</span>
            </motion.div>
          )}

          <div className="login-actions">
            <button
              type="button"
              className="btn btn-primary login-btn-primary"
              onClick={handleTelegramLogin}
              disabled={isLoading}
            >
              <div className="login-btn-left-group">
                <svg
                  className="tg-icon-svg"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="currentColor"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                </svg>
                <span>{isLoading ? LOGIN_CONTENT.actions.telegramRedirecting : LOGIN_CONTENT.actions.telegramLogin}</span>
              </div>
              <ArrowRight size={17} className="login-btn-arrow" />
            </button>

            <button
              type="button"
              className="btn btn-secondary login-btn-secondary"
              onClick={handleDemoClick}
              disabled={isLoading}
            >
              <span>{LOGIN_CONTENT.actions.demoMode}</span>
            </button>
          </div>

          {/* Dev sandbox toggle */}
          <div className="login-dev-toggle-row">
            <button
              type="button"
              className="login-dev-link"
              onClick={() => setShowDevPanel((prev) => !prev)}
            >
              <Terminal size={12} />
              <span>{LOGIN_CONTENT.actions.devLink}</span>
            </button>

            {showDevPanel && (
              <motion.div
                className="login-dev-panel"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                  {LOGIN_CONTENT.actions.devHint}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm login-dev-btn"
                  onClick={handleDevLogin}
                  disabled={isLoading}
                >
                  {LOGIN_CONTENT.actions.devLoginBtn}
                </button>
              </motion.div>
            )}
          </div>

          {/* Security footnote */}
          <div className="login-footnote">
            <ShieldCheck size={13} className="text-tertiary" />
            <span>{LOGIN_CONTENT.actions.securityFootnote}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

