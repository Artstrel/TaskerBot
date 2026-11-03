import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, DoorOpen, CheckCircle2, ShieldCheck, Check, AlertCircle, Sparkles } from 'lucide-react';
import AnimatedCheckbox from './ui/AnimatedCheckbox';
import { hapticFeedback } from '../api';

/**
 * BeforeLeavingActiveOverlay: Fullscreen blocking interactive checklist for Milestone 3 (R2).
 * Locked interface covering 100vw x 100dvh at z-index: 100.
 */
export default function BeforeLeavingActiveOverlay({
  session,
  onToggleItem,
  onFinishSession,
  onSessionUpdate,
  isFinishing = false,
}) {
  const overlayRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isActionPending, setIsActionPending] = useState(false);

  const rawItems = session?.items || [];
  const sortedItems = useMemo(
    () => [...rawItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [rawItems]
  );

  const totalCount = session?.total_count ?? sortedItems.length;
  const completedCount =
    session?.completed_count ?? sortedItems.filter((i) => Boolean(i.is_checked)).length;
  const isAllCompleted =
    Boolean(session?.is_all_completed) || (totalCount > 0 && completedCount === totalCount);
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // -------------------------------------------------------------------------
  // Multi-layer Hard Lock Protocol
  // -------------------------------------------------------------------------
  useEffect(() => {
    // 1. Focus overlay on mount
    if (overlayRef.current) {
      overlayRef.current.focus();
    }

    // 2. Prevent body scroll
    const origOverflow = document.body.style.overflow;
    const origOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'contain';
    document.body.classList.add('before-leaving-lock-body');

    // 3. Browser History Trap (pushState + popstate + beforeunload)
    const lockKey = 'before_leaving_lock';
    try {
      window.history.pushState({ [lockKey]: true, ts: Date.now() }, document.title);
    } catch {}

    const handlePopState = () => {
      try {
        window.history.pushState({ [lockKey]: true, ts: Date.now() }, document.title);
      } catch {}
      hapticFeedback('warning');
    };

    const handleBeforeUnload = (e) => {
      if (!isAllCompleted) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 4. Keyboard Trap (Capturing phase for Escape, shortcuts, and focus trap)
    const handleCaptureKeyDown = (e) => {
      const key = e.key;
      const lowerKey = key.toLowerCase();

      // Suppress Escape key
      if (key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        hapticFeedback('warning');
        return;
      }

      // Suppress desktop QuickAdd shortcuts (c, n, cyrillic с, т) outside inputs
      if (['c', 'n', 'с', 'т'].includes(lowerKey)) {
        const target = e.target;
        const isInput =
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (!isInput) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
      }

      // Focus Trapping within overlay container
      if (key === 'Tab' && overlayRef.current) {
        const focusable = overlayRef.current.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled])'
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first || !overlayRef.current.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last || !overlayRef.current.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        } else {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleCaptureKeyDown, true);

    // 5. Telegram WebApp Lock API
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      try {
        tg.enableClosingConfirmation?.();
        tg.disableVerticalSwipes?.();
        tg.BackButton?.hide?.();
      } catch {}
    }

    return () => {
      window.removeEventListener('keydown', handleCaptureKeyDown, true);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.body.style.overflow = origOverflow;
      document.body.style.overscrollBehavior = origOverscroll;
      document.body.classList.remove('before-leaving-lock-body');

      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        try {
          tg.disableClosingConfirmation?.();
          tg.enableVerticalSwipes?.();
        } catch {}
      }
    };
  }, [isAllCompleted]);

  // -------------------------------------------------------------------------
  // Item Toggle Handler
  // -------------------------------------------------------------------------
  const handleItemToggle = useCallback(
    async (item) => {
      hapticFeedback('selection');
      setErrorMessage(null);
      const nextChecked = !item.is_checked;

      if (onToggleItem) {
        try {
          await onToggleItem(item.id, nextChecked);
        } catch (err) {
          setErrorMessage(err?.message || 'Не удалось обновить статус пункта.');
        }
      }
    },
    [onToggleItem]
  );

  // -------------------------------------------------------------------------
  // Finish Session Action
  // -------------------------------------------------------------------------
  const handleFinish = useCallback(async () => {
    if (isFinishing || isActionPending || !isAllCompleted) return;
    setIsActionPending(true);
    setErrorMessage(null);
    hapticFeedback('success');

    try {
      if (onFinishSession) {
        await onFinishSession();
      }
    } catch (err) {
      setErrorMessage(err?.message || 'Не удалось завершить сессию. Попробуйте снова.');
    } finally {
      setIsActionPending(false);
    }
  }, [isFinishing, isActionPending, isAllCompleted, onFinishSession]);

  const finishingState = isFinishing || isActionPending;

  return (
    <motion.div
      ref={overlayRef}
      tabIndex={-1}
      className="before-leaving-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="before-leaving-overlay-title"
      aria-label="Режим «Перед выходом»: блокирующий чеклист"
    >
      {/* HEADER SECTION (Unified surface with scrim gradient) */}
      <header className="before-leaving-overlay-header before-leaving-header">
        <div className="before-leaving-header-inner">
          <div className="before-leaving-header-top-row before-leaving-header-top">
            <div className="before-leaving-badge">
              <Lock size={12} strokeWidth={2.4} aria-hidden="true" />
              <span>Режим блокировки</span>
            </div>
          </div>

          <div className="before-leaving-header-title-row before-leaving-title-group">
            <h1 id="before-leaving-overlay-title" className="before-leaving-overlay-title before-leaving-title">
              Перед выходом
            </h1>
          </div>

          <p className="before-leaving-overlay-subtitle">
            Отметьте все пункты чеклиста, чтобы разблокировать интерфейс и выйти из дома.
          </p>

          {/* UNIFIED PROGRESS BAR & INDICATOR ROW */}
          <div className="before-leaving-progress-row">
            <div
              className="before-leaving-progress-container before-leaving-progress-track"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Прогресс сборов"
            >
              <div className="before-leaving-progress-track-inner">
                <motion.div
                  className="before-leaving-progress-fill"
                  initial={false}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>

            <div
              className="before-leaving-counter-pill before-leaving-counter before-leaving-progress-counter"
              aria-live="polite"
              aria-label={`Выполнено ${completedCount} из ${totalCount}`}
            >
              <span className="counter-current before-leaving-counter-current">{completedCount}</span>
              <span className="counter-sep before-leaving-counter-divider"> из </span>
              <span className="counter-total before-leaving-counter-total">{totalCount}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ERROR BANNER IF NETWORK FAILURE */}
      {errorMessage && (
        <div className="before-leaving-error-banner" role="alert">
          <AlertCircle size={15} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* SCROLLABLE CHECKLIST BODY */}
      <main className="before-leaving-overlay-body before-leaving-list-container" role="list">
        <div className="before-leaving-body-inner before-leaving-list">
          {sortedItems.length === 0 ? (
            <div className="before-leaving-overlay-empty">
              <span>Список чеклиста пуст.</span>
            </div>
          ) : (
            sortedItems.map((item) => {
              const isChecked = Boolean(item.is_checked);
              return (
                <div
                  key={item.id}
                  className={`before-leaving-check-row ${isChecked ? 'checked is-checked' : ''}`}
                  onClick={() => handleItemToggle(item)}
                  role="listitem"
                  aria-checked={isChecked}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      handleItemToggle(item);
                    }
                  }}
                >
                  <AnimatedCheckbox
                    checked={isChecked}
                    onChange={() => handleItemToggle(item)}
                    size={22}
                    ariaLabel={`Отметить пункт: ${item.title}`}
                  />
                  <span className="before-leaving-check-title">{item.title}</span>
                  {isChecked && (
                    <motion.div
                      className="before-leaving-check-done-mark"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.18 }}
                      aria-hidden="true"
                    >
                      <Check size={16} strokeWidth={2.4} />
                    </motion.div>
                  )}
                </div>
              );
            })
          )}

          {/* CELEBRATION CARD WHEN ALL ITEMS COMPLETED */}
          <AnimatePresence>
            {isAllCompleted && (
              <motion.div
                className="before-leaving-celebration-card"
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                role="region"
                aria-label="Все пункты выполнены"
              >
                <div className="before-leaving-celebration-icon-box">
                  <CheckCircle2 size={30} strokeWidth={2.2} />
                </div>
                <div className="before-leaving-celebration-title">Все пункты проверены!</div>
                <div className="before-leaving-celebration-desc">
                  Вы готовы к выходу. Блокировка интерфейса снята. Нажмите кнопку ниже для завершения режима.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ACTION FOOTER */}
      {isAllCompleted && (
        <footer className="before-leaving-overlay-footer before-leaving-footer">
          <div className="before-leaving-footer-inner">
            <motion.button
              type="button"
              className="before-leaving-finish-btn"
              onClick={handleFinish}
              disabled={finishingState}
              whileTap={{ scale: 0.98 }}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
              aria-label="Завершить и выйти"
            >
              <DoorOpen size={18} strokeWidth={2.2} />
              <span>{finishingState ? 'Завершение...' : 'Завершить и выйти'}</span>
            </motion.button>
          </div>
        </footer>
      )}
    </motion.div>
  );
}
