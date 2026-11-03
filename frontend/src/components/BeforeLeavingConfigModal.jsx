import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { X, Trash2, ArrowUp, ArrowDown, DoorOpen, ListChecks, Check, Pencil } from 'lucide-react';
import QuickAddBar from './QuickAddBar';
import {
  fetchBeforeLeavingItems,
  createBeforeLeavingItem,
  updateBeforeLeavingItem,
  deleteBeforeLeavingItem,
  reorderBeforeLeavingItems,
  hapticFeedback,
  capitalizeFirst,
} from '../api';

export default function BeforeLeavingConfigModal({ isOpen, onClose, onStartSession }) {
  const [items, setItems] = useState([]);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const editInputRef = useRef(null);
  const sheetRef = useRef(null);

  useEffect(() => {
    let ignore = false;
    if (isOpen) {
      fetchBeforeLeavingItems()
        .then((data) => {
          if (!ignore) {
            setItems(Array.isArray(data) ? [...data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : []);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!ignore) {
            setItems([]);
            setLoading(false);
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editingId !== null) {
          setEditingId(null);
        } else {
          onClose();
        }
      } else if (e.key === 'Tab' && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editingId, onClose]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        const input = sheetRef.current?.querySelector('.quick-bar-input');
        input?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleAddItem = async (e) => {
    e.preventDefault();
    const clean = capitalizeFirst(newItemTitle.trim());
    if (!clean || isSubmitting) return;

    setIsSubmitting(true);
    hapticFeedback('light');

    const tempId = Date.now();
    const newOrder = items.length;
    const tempItem = {
      id: tempId,
      title: clean,
      order: newOrder,
      created_at: new Date().toISOString(),
    };

    setItems((prev) => [...prev, tempItem]);
    setNewItemTitle('');

    try {
      const created = await createBeforeLeavingItem({ title: clean, order: newOrder });
      if (created && created.id) {
        setItems((prev) => prev.map((item) => (item.id === tempId ? created : item)));
      }
    } catch {
      // Keep optimistic item
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (item) => {
    hapticFeedback('selection');
    setEditingId(item.id);
    setEditTitle(item.title);
  };

  const handleSaveEdit = async (id) => {
    const clean = capitalizeFirst(editTitle.trim());
    if (!clean) {
      setEditingId(null);
      return;
    }

    hapticFeedback('light');
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, title: clean } : item)));
    setEditingId(null);

    try {
      await updateBeforeLeavingItem(id, { title: clean });
    } catch {
      // Retain optimistic update
    }
  };

  const handleDeleteItem = async (id) => {
    hapticFeedback('medium');
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (editingId === id) setEditingId(null);

    try {
      await deleteBeforeLeavingItem(id);
    } catch {
      // Retain optimistic deletion
    }
  };

  const handleMove = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    hapticFeedback('selection');
    const updated = [...items];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);

    const reordered = updated.map((item, idx) => ({ ...item, order: idx }));
    setItems(reordered);

    try {
      await reorderBeforeLeavingItems(reordered.map((item) => item.id));
    } catch {
      // Retain optimistic reorder
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      className="sheet-backdrop before-leaving-config-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="before-leaving-config-title"
    >
      <motion.div
        ref={sheetRef}
        tabIndex={-1}
        className="bottom-sheet-content before-leaving-config-sheet"
        initial={{ y: '100%', opacity: 0.8 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.8 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      >
        <div className="sheet-handle-bar" />
        <div className="sheet-header-row" style={{ pointerEvents: 'auto' }}>
          <div id="before-leaving-config-title" className="sheet-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DoorOpen size={18} />
            <span>Перед выходом: Настройка шаблона</span>
          </div>
          <button
            type="button"
            className="sheet-close-btn"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        <div className="before-leaving-config-body">
          <p className="before-leaving-hint">
            Сформируйте список вещей и проверок (ключи, документы, выключить утюг...), который будет блокировать интерфейс перед выходом из дома.
          </p>

          <QuickAddBar
            placeholder="Добавить пункт (например, «Ключи»)..."
            value={newItemTitle}
            onChange={setNewItemTitle}
            onSubmit={handleAddItem}
            isSubmitting={isSubmitting}
            submitTitle="Добавить"
            autoFocus
            className="before-leaving-quick-add"
          />

          <div className="before-leaving-items-list" role="list">
            {loading ? (
              <div className="before-leaving-empty">
                <span>Загрузка шаблона...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="before-leaving-empty">
                <ListChecks size={36} color="var(--text-tertiary)" />
                <span>Список вещей пуст. Добавьте то, что нужно проверить перед выходом из дома (ключи, документы, выключить утюг...).</span>
              </div>
            ) : (
              items.map((item, index) => (
                <div key={item.id} className="before-leaving-item-row" role="listitem">
                  <div className="before-leaving-item-reorder">
                    <button
                      type="button"
                      className="item-mini-btn"
                      disabled={index === 0}
                      onClick={() => handleMove(index, -1)}
                      aria-label="Переместить выше"
                      title="Выше"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="item-mini-btn"
                      disabled={index === items.length - 1}
                      onClick={() => handleMove(index, 1)}
                      aria-label="Переместить ниже"
                      title="Ниже"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>

                  <div className="before-leaving-item-content">
                    {editingId === item.id ? (
                      <div className="before-leaving-inline-edit-wrapper" style={{ display: 'flex', width: '100%', gap: '6px', alignItems: 'center' }}>
                        <input
                          ref={editInputRef}
                          type="text"
                          className="before-leaving-inline-edit"
                          value={editTitle}
                          maxLength={500}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => handleSaveEdit(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(item.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          aria-label="Редактировать название"
                        />
                        <button
                          type="button"
                          className="item-mini-btn btn-success"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSaveEdit(item.id);
                          }}
                          title="Сохранить"
                          aria-label="Сохранить"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <span
                        className="before-leaving-item-title"
                        onClick={() => handleStartEdit(item)}
                        title="Нажмите для редактирования"
                      >
                        {item.title}
                      </span>
                    )}
                  </div>

                  <div className="before-leaving-item-actions">
                    {editingId !== item.id && (
                      <button
                        type="button"
                        className="item-mini-btn"
                        onClick={() => handleStartEdit(item)}
                        title="Редактировать"
                        aria-label="Редактировать"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="item-mini-btn btn-danger"
                      onClick={() => handleDeleteItem(item.id)}
                      aria-label="Удалить пункт"
                      title="Удалить"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {items.length > 0 && onStartSession && (
            <div className="before-leaving-config-footer" style={{ marginTop: '12px' }}>
              <button
                type="button"
                className="before-leaving-launch-preview-btn"
                onClick={() => {
                  onClose();
                  onStartSession({ startDirectly: true });
                }}
              >
                <DoorOpen size={16} />
                <span>Запустить режим «Перед выходом»</span>
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
