import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Share, PlusSquare, Smartphone, X, CheckCircle2, ChevronRight } from 'lucide-react';
import { isIosDevice, isStandalonePwa, isInsideTelegram, hapticFeedback } from '../api';

const STORAGE_KEY = 'tasker_pwa_ios_prompt_dismissed';

export default function IosPwaPrompt({
  forceOpen = false,
  onCloseForce = null,
}) {
  const [isStandalone] = useState(() => isStandalonePwa());
  const [isIos] = useState(() => isIosDevice());
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (_) {
      return false;
    }
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleDismissBanner = (e) => {
    e?.stopPropagation();
    hapticFeedback('light');
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (_) {}
    setIsDismissed(true);
  };

  const handleOpenModal = () => {
    hapticFeedback('medium');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    hapticFeedback('light');
    setIsModalOpen(false);
    if (onCloseForce) {
      onCloseForce();
    }
  };

  const showBanner = !forceOpen && isIos && !isStandalone && !isInsideTelegram() && !isDismissed && !isModalOpen;
  const showModal = forceOpen || isModalOpen;

  return (
    <>
      {/* Floating Smart Banner above bottom dock on iOS Safari */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className="ios-pwa-banner"
            onClick={handleOpenModal}
            role="button"
            tabIndex={0}
          >
            <div className="ios-pwa-banner-icon">
              <Smartphone size={20} />
            </div>
            <div className="ios-pwa-banner-body">
              <div className="ios-pwa-banner-title">
                Убрать панели Safari
              </div>
              <div className="ios-pwa-banner-desc">
                Добавьте на экран «Домой» для полноэкранного режима
              </div>
            </div>
            <button
              type="button"
              className="ios-pwa-banner-action"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenModal();
              }}
            >
              Как <ChevronRight size={14} />
            </button>
            <button
              type="button"
              className="ios-pwa-banner-close"
              onClick={handleDismissBanner}
              aria-label="Скрыть баннер"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step-by-step Installation Guide Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="modal-backdrop ios-pwa-modal-backdrop" onClick={handleCloseModal}>
            <motion.div
              className="modal-content ios-pwa-modal-card"
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 20 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ios-pwa-modal-header">
                <div className="ios-pwa-modal-icon-badge">
                  <Smartphone size={22} />
                </div>
                <div>
                  <h3 className="ios-pwa-modal-title">
                    Полноэкранный режим без рамок Safari
                  </h3>
                  <p className="ios-pwa-modal-subtitle">
                    Как убрать системные навигационные панели iOS Safari
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={handleCloseModal}
                  aria-label="Закрыть"
                >
                  <X size={18} />
                </button>
              </div>

              {isStandalone ? (
                <div className="ios-pwa-standalone-active">
                  <CheckCircle2 size={24} style={{ color: 'var(--success, #22c55e)' }} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      Полноэкранный режим уже активен
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Приложение запущено с экрана «Домой» как автономное PWA без рамок и кнопок Safari.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="ios-pwa-steps-list">
                  <div className="ios-pwa-step-item">
                    <div className="ios-pwa-step-num">1</div>
                    <div className="ios-pwa-step-text">
                      Нажмите кнопку <strong>«Поделиться»</strong>{' '}
                      <span className="ios-pwa-inline-badge">
                        <Share size={13} style={{ display: 'inline', verticalAlign: '-2px' }} />
                      </span>{' '}
                      в нижней навигационной панели Safari.
                    </div>
                  </div>

                  <div className="ios-pwa-step-item">
                    <div className="ios-pwa-step-num">2</div>
                    <div className="ios-pwa-step-text">
                      Прокрутите список действий вниз и нажмите <strong>«На экран „Домой“»</strong>{' '}
                      <span className="ios-pwa-inline-badge">
                        <PlusSquare size={13} style={{ display: 'inline', verticalAlign: '-2px' }} />
                      </span>.
                    </div>
                  </div>

                  <div className="ios-pwa-step-item">
                    <div className="ios-pwa-step-num">3</div>
                    <div className="ios-pwa-step-text">
                      В правом верхнем углу подтвердите добавление, нажав <strong>«Добавить»</strong>.
                    </div>
                  </div>

                  <div className="ios-pwa-step-item">
                    <div className="ios-pwa-step-num">4</div>
                    <div className="ios-pwa-step-text">
                      Откройте иконку <strong>Chihiro Tasker</strong> на главном экране iOS — приложение запустится в автономном режиме без адресной строки и нижнего меню.
                    </div>
                  </div>
                </div>
              )}

              <div className="ios-pwa-modal-footer">
                <button
                  type="button"
                  className="filter-chip active"
                  onClick={() => {
                    handleDismissBanner();
                    handleCloseModal();
                  }}
                  style={{
                    padding: '10px 20px',
                    fontSize: '13px',
                    fontWeight: 600,
                    width: '100%',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  Понятно
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
