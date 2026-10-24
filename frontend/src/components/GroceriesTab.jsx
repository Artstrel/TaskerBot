import React, { useState } from 'react';
import {
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  Pencil,
  X,
  Mic,
  ShoppingCart,
  CheckCheck,
  RotateCw,
} from 'lucide-react';
import {
  createGroceryItem,
  updateGroceryItem,
  deleteGroceryItem,
  clearCompletedGroceries,
  hapticFeedback,
  setCachedGroceries,
  addPendingMutation,
  removePendingMutation,
  capitalizeFirst,
} from '../api';
import Mascot from './Mascot';

export default function GroceriesTab({
  groceriesData,
  setGroceriesData,
  onRefresh,
  onForceRefresh,
  isSyncing,
  onOpenQuickAdd,
}) {
  const [quickTitle, setQuickTitle] = useState('');
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);
  const [isCompletedOpen, setIsCompletedOpen] = useState(true);

  // Inline item title editing state
  const [editingItemId, setEditingItemId] = useState(null);
  const [editItemTitle, setEditItemTitle] = useState('');

  // Direct numeric value editing state
  const [editingNumericId, setEditingNumericId] = useState(null);
  const [directNumericVal, setDirectNumericVal] = useState('');

  const activeItems = groceriesData?.active_items || [];
  const completedItems = groceriesData?.completed_items || [];
  const totalCount = groceriesData?.total_count || (activeItems.length + completedItems.length);
  const completedCount = groceriesData?.completed_count || completedItems.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const isAllPurchased = totalCount > 0 && activeItems.length === 0;
  const isCompletelyEmpty = totalCount === 0;

  // Toggle purchased status
  const handleToggle = (itemId, currentCompleted) => {
    hapticFeedback('medium');
    const newCompleted = !currentCompleted;
    const mutationId = `toggle_grocery_${itemId}_${Date.now()}`;

    let itemToMove = null;

    if (setGroceriesData) {
      setGroceriesData((prev) => {
        if (!prev) return prev;
        let active = [...(prev.active_items || [])];
        let completed = [...(prev.completed_items || [])];

        if (newCompleted) {
          const idx = active.findIndex((i) => i.id === itemId);
          if (idx !== -1) {
            itemToMove = { ...active[idx], is_completed: true, completed_at: new Date().toISOString() };
            active.splice(idx, 1);
            completed.unshift(itemToMove);
          }
        } else {
          const idx = completed.findIndex((i) => i.id === itemId);
          if (idx !== -1) {
            itemToMove = { ...completed[idx], is_completed: false, completed_at: null };
            completed.splice(idx, 1);
            active.unshift(itemToMove);
          }
        }

        const updated = {
          ...prev,
          active_items: active,
          completed_items: completed,
          completed_count: completed.length,
          total_count: active.length + completed.length,
        };
        setCachedGroceries(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'toggle_grocery', itemId, is_completed: newCompleted, timestamp: Date.now() });

    updateGroceryItem(itemId, { is_completed: newCompleted })
      .then(() => {
        removePendingMutation(mutationId);
      })
      .catch((err) => {
        console.error('Failed to toggle grocery item:', err);
        removePendingMutation(mutationId);
        if (onRefresh) onRefresh();
      });
  };

  // Start inline editing
  const handleStartEdit = (item) => {
    hapticFeedback('selection');
    setEditingItemId(item.id);
    setEditItemTitle(item.title);
  };

  // Save inline title edit
  const handleSaveEdit = (itemId) => {
    const title = capitalizeFirst(editItemTitle.trim());
    if (!title) {
      setEditingItemId(null);
      return;
    }
    const mutationId = `edit_grocery_${itemId}_${Date.now()}`;
    setEditingItemId(null);
    hapticFeedback('light');

    if (setGroceriesData) {
      setGroceriesData((prev) => {
        if (!prev) return prev;
        const updateList = (list) =>
          (list || []).map((i) => (i.id === itemId ? { ...i, title } : i));
        const updated = {
          ...prev,
          active_items: updateList(prev.active_items),
          completed_items: updateList(prev.completed_items),
        };
        setCachedGroceries(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'edit_grocery', itemId, title, timestamp: Date.now() });

    updateGroceryItem(itemId, { title })
      .then(() => removePendingMutation(mutationId))
      .catch((err) => {
        console.error('Failed to update grocery title:', err);
        removePendingMutation(mutationId);
        if (onRefresh) onRefresh();
      });
  };

  // Step quantity progress change (+/-)
  const handleProgress = (itemId, delta) => {
    hapticFeedback('light');
    let newTarget = 0;

    if (setGroceriesData) {
      setGroceriesData((prev) => {
        if (!prev) return prev;
        const active = (prev.active_items || []).map((i) => {
          if (i.id === itemId) {
            const current = i.target_value || 0;
            const updatedVal = Math.max(0, Math.round((current + delta) * 100) / 100);
            newTarget = updatedVal;
            return { ...i, target_value: updatedVal };
          }
          return i;
        });
        const updated = { ...prev, active_items: active };
        setCachedGroceries(updated);
        return updated;
      });
    }

    updateGroceryItem(itemId, { target_value: newTarget }).catch((err) => {
      console.error('Failed to update grocery quantity:', err);
      if (onRefresh) onRefresh();
    });
  };

  // Direct numeric value change
  const handleDirectValue = (itemId, rawVal) => {
    const val = parseFloat(rawVal);
    setEditingNumericId(null);
    if (isNaN(val) || val < 0) return;

    hapticFeedback('light');
    if (setGroceriesData) {
      setGroceriesData((prev) => {
        if (!prev) return prev;
        const active = (prev.active_items || []).map((i) =>
          i.id === itemId ? { ...i, target_value: val } : i
        );
        const updated = { ...prev, active_items: active };
        setCachedGroceries(updated);
        return updated;
      });
    }

    updateGroceryItem(itemId, { target_value: val }).catch((err) => {
      console.error('Failed to update grocery target:', err);
      if (onRefresh) onRefresh();
    });
  };

  // Delete single item
  const handleDelete = (itemId) => {
    hapticFeedback('medium');
    const mutationId = `del_grocery_${itemId}_${Date.now()}`;

    if (setGroceriesData) {
      setGroceriesData((prev) => {
        if (!prev) return prev;
        const active = (prev.active_items || []).filter((i) => i.id !== itemId);
        const completed = (prev.completed_items || []).filter((i) => i.id !== itemId);
        const updated = {
          ...prev,
          active_items: active,
          completed_items: completed,
          total_count: active.length + completed.length,
          completed_count: completed.length,
        };
        setCachedGroceries(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'delete_grocery', itemId, timestamp: Date.now() });

    deleteGroceryItem(itemId)
      .then(() => removePendingMutation(mutationId))
      .catch((err) => {
        console.error('Failed to delete grocery item:', err);
        removePendingMutation(mutationId);
        if (onRefresh) onRefresh();
      });
  };

  // Clear all completed items
  const handleClearCompleted = () => {
    if (completedItems.length === 0) return;
    hapticFeedback('medium');

    if (setGroceriesData) {
      setGroceriesData((prev) => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          completed_items: [],
          completed_count: 0,
          total_count: (prev.active_items || []).length,
        };
        setCachedGroceries(updated);
        return updated;
      });
    }

    clearCompletedGroceries().catch((err) => {
      console.error('Failed to clear completed groceries:', err);
      if (onRefresh) onRefresh();
    });
  };

  // Inline quick submit
  const handleQuickSubmit = (e) => {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title || isSubmittingQuick) return;

    setIsSubmittingQuick(true);
    setQuickTitle('');
    hapticFeedback('light');

    // Parse numeric quantity if present (e.g. "Молоко 2 л" or "Яйца 10 шт")
    let cleanTitle = capitalizeFirst(title);
    let targetVal = null;
    let unit = null;

    const qtyMatch = title.match(/^(.*?)(?:,\s*|\s+)(\d+(?:[.,]\d+)?)\s*(л|мл|кг|г|шт|упак|банк|бутыл)?$/i);
    if (qtyMatch) {
      cleanTitle = capitalizeFirst(qtyMatch[1].trim());
      targetVal = parseFloat(qtyMatch[2].replace(',', '.'));
      unit = qtyMatch[3] ? qtyMatch[3].toLowerCase() : null;
    }

    const tempId = `temp_grocery_${Date.now()}`;
    const mutationId = `create_quick_grocery_${tempId}`;

    const optItem = {
      id: tempId,
      user_id: 0,
      title: cleanTitle,
      target_value: targetVal,
      current_value: 0.0,
      step: unit === 'л' || unit === 'кг' ? 0.25 : 1.0,
      unit,
      is_completed: false,
      created_at: new Date().toISOString(),
      is_optimistic: true,
    };

    if (setGroceriesData) {
      setGroceriesData((prev) => {
        const prevActive = prev?.active_items || [];
        const updated = {
          ...prev,
          active_items: [optItem, ...prevActive],
          completed_items: prev?.completed_items || [],
          total_count: (prev?.total_count || 0) + 1,
          completed_count: prev?.completed_count || 0,
        };
        setCachedGroceries(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'create_grocery', tempId, title: cleanTitle, timestamp: Date.now() });

    createGroceryItem({
      title: cleanTitle,
      target_value: targetVal,
      step: unit === 'л' || unit === 'кг' ? 0.25 : 1.0,
      unit,
    })
      .then((real) => {
        removePendingMutation(mutationId);
        setIsSubmittingQuick(false);
        if (setGroceriesData && real) {
          setGroceriesData((prev) => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              active_items: (prev.active_items || []).map((i) =>
                i.id === tempId ? { ...real, is_optimistic: false } : i
              ),
            };
            setCachedGroceries(updated);
            return updated;
          });
        }
      })
      .catch((err) => {
        console.error('Failed to create grocery item:', err);
        removePendingMutation(mutationId);
        setIsSubmittingQuick(false);
      });
  };

  // Stepper rendering
  const renderNumericStepper = (item) => {
    if (!item.target_value || item.target_value <= 0) return null;

    const target = item.target_value;
    const step = item.step || (item.unit === 'л' || item.unit === 'кг' ? 0.25 : 1.0);
    const unitStr = item.unit ? ` ${item.unit}` : '';
    const isEditing = editingNumericId === item.id;

    return (
      <div className="numeric-stepper-row" onClick={(e) => e.stopPropagation()}>
        <div className="numeric-stepper-controls">
          <button
            type="button"
            className="numeric-btn"
            disabled={target <= 0}
            onClick={() => handleProgress(item.id, -step)}
            title={`Уменьшить на ${step}`}
          >
            <Minus size={13} strokeWidth={2.5} />
          </button>

          {isEditing ? (
            <div className="numeric-direct-edit-box">
              <input
                type="number"
                step="any"
                className="numeric-direct-input"
                value={directNumericVal}
                onChange={(e) => setDirectNumericVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDirectValue(item.id, directNumericVal);
                  if (e.key === 'Escape') setEditingNumericId(null);
                }}
                autoFocus
              />
              <button
                type="button"
                className="numeric-direct-btn btn-save"
                onClick={() => handleDirectValue(item.id, directNumericVal)}
              >
                <Check size={11} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <span
              className="numeric-value-badge"
              onClick={() => {
                hapticFeedback('selection');
                setEditingNumericId(item.id);
                setDirectNumericVal(String(target));
              }}
              title="Нажмите, чтобы ввести число вручную"
            >
              {target}
              {unitStr}
            </span>
          )}

          <button
            type="button"
            className="numeric-btn"
            onClick={() => handleProgress(item.id, step)}
            title={`Увеличить на ${step}`}
          >
            <Plus size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="tab-scroll-container groceries-tab-container">
      {/* Mobile iOS HIG Large Title */}
      <h1 className="mobile-large-title mobile-only-item">Список продуктов</h1>

      {/* Desktop Material 3 View Header */}
      <div className="desktop-view-header desktop-only-item">
        <div className="desktop-view-title-group">
          <h1 className="desktop-view-title">Список продуктов</h1>
          <div className="desktop-view-subtitle">
            {completedCount} из {totalCount} куплено ({progressPct}%)
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
              title="Обновить список продуктов"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCw size={14} className={isSyncing ? 'spin-icon' : ''} />
              <span>Обновить</span>
            </button>
          )}
          {completedCount > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClearCompleted}
              title="Очистить купленные товары"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Trash2 size={14} />
              <span>Очистить купленное</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress & Actions Header Card */}
      <div className="day-status-card">
        <div className="day-progress-bar-wrap">
          <div className="day-progress-label">
            <span>
              {completedCount} из {totalCount} куплено ({progressPct}%)
            </span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
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
              title="Обновить список продуктов"
            >
              <RotateCw size={13} className={isSyncing ? 'spin-icon' : ''} />
            </button>
          )}

          {completedCount > 0 && (
            <button
              type="button"
              className="header-icon-btn"
              onClick={handleClearCompleted}
              title="Очистить купленные товары"
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'var(--bg-surface)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Trash2 size={13} />
              <span>Очистить купленное</span>
            </button>
          )}
        </div>
      </div>

      {/* Top Quick Add Bar with Direct Voice Button */}
      <div className="groceries-quick-add-wrap">
        <form onSubmit={handleQuickSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            className="unified-textarea"
            placeholder="Добавить продукт (например, Молоко 2 л)..."
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-surface)',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              padding: '8px 16px',
              fontSize: '13px',
              minHeight: '38px',
              height: '38px',
              color: 'var(--text-primary)',
            }}
          />

          {/* Direct 1-tap voice dictation button */}
          <button
            type="button"
            onClick={() => {
              hapticFeedback('medium');
              if (onOpenQuickAdd) {
                onOpenQuickAdd({
                  initialCategory: 'grocery',
                  autoStartVoice: true,
                });
              }
            }}
            title="Надиктовать список продуктов голосом"
            style={{
              background: 'var(--bg-surface)',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              color: 'var(--accent-primary, #60a5fa)',
              padding: '0 12px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Mic size={16} />
          </button>

          {/* Quick Submit (+) button */}
          <button
            type="submit"
            disabled={!quickTitle.trim() || isSubmittingQuick}
            title="Добавить в список"
            style={{
              background: 'var(--bg-surface)',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              color: quickTitle.trim() ? 'var(--text-primary)' : 'var(--text-tertiary)',
              padding: '0 14px',
              height: '38px',
              fontSize: '13px',
              cursor: quickTitle.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Plus size={16} />
          </button>
        </form>
      </div>

      {/* All Items Purchased Celebration */}
      {isAllPurchased && (
        <div className="empty-state-mascot-card">
          <Mascot state="done" size={96} interactive={true} />
          <div className="empty-mascot-title">Все продукты куплены!</div>
          <div className="empty-mascot-desc">
            Корзина пуста. Добавьте новые покупки через строку ввода или надиктуйте голосом.
          </div>
        </div>
      )}

      {/* Completely Empty State */}
      {isCompletelyEmpty && (
        <div className="empty-state-mascot-card">
          <Mascot state="happy" size={96} interactive={true} />
          <div className="empty-mascot-title">Список продуктов пуст</div>
          <div className="empty-mascot-desc">
            Надиктуйте список через микрофон 🎙 или введите продукт сверху (например: <i>«Молоко 2 л»</i>).
          </div>
        </div>
      )}

      <div className="groceries-desktop-grid">
      {/* SECTION 1: Active Grocery Items (Нужно купить) */}
      {activeItems.length > 0 && (
        <section className="linear-section">
          <div className="linear-section-header">
            <div className="linear-section-title">
              <ShoppingCart size={15} color="var(--text-primary)" />
              <span>Нужно купить</span>
              <span className="linear-count-badge">
                {activeItems.length}
              </span>
            </div>
          </div>

          <div className="linear-list">
            {activeItems.map((item) => (
              <div
                key={item.id}
                className="linear-list-item"
                style={{ alignItems: 'flex-start' }}
              >
                {/* Checkbox */}
                <button
                  className="linear-checkbox"
                  onClick={() => handleToggle(item.id, false)}
                  aria-label="Отметить как купленное"
                  style={{ marginTop: '3px' }}
                >
                  {/* Empty unchecked circle */}
                </button>

                {/* Title & Editable Box */}
                {editingItemId === item.id ? (
                  <div className="task-inline-edit-box">
                    <input
                      type="text"
                      className="task-inline-input"
                      value={editItemTitle}
                      onChange={(e) => setEditItemTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(item.id);
                        if (e.key === 'Escape') setEditingItemId(null);
                      }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        className="item-mini-btn"
                        onClick={() => setEditingItemId(null)}
                      >
                        <X size={13} />
                      </button>
                      <button
                        type="button"
                        className="item-mini-btn btn-success"
                        onClick={() => handleSaveEdit(item.id)}
                      >
                        <Check size={13} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="task-content-main" style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="linear-title"
                      onClick={() => handleStartEdit(item)}
                      title="Нажмите для редактирования названия"
                      style={{ cursor: 'pointer' }}
                    >
                      {item.title}
                    </div>

                    {/* Numeric Stepper if quantity present */}
                    {renderNumericStepper(item)}
                  </div>
                )}

                {/* Right Actions */}
                <div className="item-action-btns">
                  <button
                    className="item-mini-btn"
                    onClick={() => handleStartEdit(item)}
                    title="Редактировать"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="item-mini-btn btn-danger"
                    onClick={() => handleDelete(item.id)}
                    title="Удалить"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SECTION 2: Completed / Purchased Items (Куплено) */}
      {completedItems.length > 0 && (
        <section className="linear-section" style={{ marginTop: '16px' }}>
          <div
            className="linear-section-header"
            onClick={() => setIsCompletedOpen((prev) => !prev)}
            style={{ cursor: 'pointer' }}
          >
            <div className="linear-section-title">
              <CheckCheck size={15} color="var(--text-secondary)" />
              <span style={{ color: 'var(--text-secondary)' }}>Куплено</span>
              <span className="linear-count-badge badge-success">
                {completedItems.length}
              </span>
            </div>
            {isCompletedOpen ? (
              <ChevronUp size={16} color="var(--text-tertiary)" />
            ) : (
              <ChevronDown size={16} color="var(--text-tertiary)" />
            )}
          </div>

          {isCompletedOpen && (
            <div className="linear-list">
              {completedItems.map((item) => (
                <div
                  key={item.id}
                  className="linear-list-item completed"
                  style={{ alignItems: 'flex-start' }}
                >
                  {/* Checked checkbox */}
                  <button
                    className="linear-checkbox checked"
                    onClick={() => handleToggle(item.id, true)}
                    aria-label="Вернуть в список покупок"
                    style={{ marginTop: '3px' }}
                  >
                    <Check size={12} strokeWidth={3} />
                  </button>

                  <div className="task-content-main" style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="linear-title completed-title"
                      style={{ textDecoration: 'line-through', opacity: 0.6 }}
                    >
                      {item.title}
                      {item.target_value ? (
                        <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          ({item.target_value} {item.unit || 'шт'})
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="item-action-btns">
                    <button
                      className="item-mini-btn btn-danger"
                      onClick={() => handleDelete(item.id)}
                      title="Удалить"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      </div>
    </div>
  );
}
