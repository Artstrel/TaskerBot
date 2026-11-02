import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DoorOpen, Settings2, RotateCw } from 'lucide-react';
import { hapticFeedback } from '../api';

export default function ProfileBubbleContextMenu({
  isOpen,
  onClose,
  onStartBeforeLeaving,
  onOpenConfig,
  onRefresh,
  isSyncing,
  triggerRef,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      const target = e.target instanceof Element ? e.target : e.target?.parentElement;

      // Dropdown containment check (covers both ref and cross-instance class)
      if (menuRef.current?.contains(e.target) || (target && typeof target.closest === 'function' && target.closest('.profile-bubble-dropdown'))) {
        return;
      }

      // Trigger containment check (covers optional triggerRef and profile bubble class)
      if (triggerRef?.current?.contains(e.target) || (target && typeof target.closest === 'function' && target.closest('.header-profile-bubble'))) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          className="profile-bubble-dropdown"
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          role="menu"
          aria-label="Меню профиля"
        >
          <button
            type="button"
            className="profile-dropdown-item profile-dropdown-item-primary"
            role="menuitem"
            onClick={() => {
              hapticFeedback('medium');
              onClose();
              if (onStartBeforeLeaving) onStartBeforeLeaving();
            }}
          >
            <DoorOpen size={16} />
            <span>Перед выходом</span>
          </button>

          <button
            type="button"
            className="profile-dropdown-item"
            role="menuitem"
            onClick={() => {
              hapticFeedback('selection');
              onClose();
              if (onOpenConfig) onOpenConfig();
            }}
          >
            <Settings2 size={16} />
            <span>Настройка чеклиста</span>
          </button>

          <div className="profile-dropdown-divider" role="separator" />

          <button
            type="button"
            className="profile-dropdown-item"
            role="menuitem"
            disabled={isSyncing}
            onClick={() => {
              onClose();
              if (onRefresh) onRefresh();
            }}
          >
            <RotateCw size={16} className={isSyncing ? 'spin-sync-icon' : ''} />
            <span>{isSyncing ? 'Синхронизация...' : 'Обновить данные'}</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
