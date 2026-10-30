import React, { useState } from 'react';
import AnimatedCheckbox from './ui/AnimatedCheckbox';
import AnimatedChevron from './ui/AnimatedChevron';
import AnimatedAccordion from './ui/AnimatedAccordion';
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
import ViewHeader from './ViewHeader';
import QuickAddBar from './QuickAddBar';

export default function GroceriesTab({
  groceriesData,
  setGroceriesData,
  onRefresh,
  onForceRefresh,
  isSyncing,
  isInitialLoading = false,
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

  if (!groceriesData) {
    return (
      <div className="tab-scroll-container groceries-tab-container today-skeleton-screen">
        <ViewHeader
          title="Список продуктов"
          subtitle="Быстрые покупки"
          actions={
            <span className="sync-indicator-pill">
              <RotateCw size={12} className="spin-sync-icon" />
              <span>Синхронизация...</span>
            </span>
          }
        />

        {/* Progress card shimmer */}
        <div className="day-status-card" style={{ opacity: 0.85 }}>
          <div className="day-progress-bar-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="skeleton-shimmer" style={{ width: '140px', height: '14px' }} />
            <div className="skeleton-shimmer" style={{ width: '100%', height: '6px', borderRadius: '3px' }} />
          </div>
        </div>

        {/* Quick add bar shimmer */}
        <div className="groceries-quick-add-wrap" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div className="skeleton-shimmer" style={{ flex: 1, height: '40px', borderRadius: 'var(--radius-full)' }} />
          <div className="skeleton-shimmer" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-full)' }} />
        </div>

        {/* Active items skeleton list */}
        <section className="linear-section">
          <div className="linear-section-header">
            <div className="linear-section-title">
              <ShoppingCart size={15} color="var(--text-tertiary)" />
              <div className="skeleton-shimmer" style={{ width: '120px', height: '16px' }} />
            </div>
          </div>
          <div className="linear-list">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="skeleton-list-item" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                  <div className="skeleton-shimmer skeleton-checkbox" />
                  <div className="skeleton-content">
                    <div
                      className="skeleton-shimmer skeleton-title"
                      style={{ width: n === 1 ? '60%' : n === 2 ? '45%' : n === 3 ? '70%' : '50%' }}
                    />
                  </div>
                </div>
                <div
                  className="skeleton-shimmer"
                  style={{ width: '74px', height: '28px', borderRadius: 'var(--radius-full)', flexShrink: 0 }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Completed items skeleton section */}
        <section className="linear-section">
          <div className="linear-section-header">
            <div className="linear-section-title">
              <CheckCheck size={15} color="var(--text-tertiary)" />
              <div className="skeleton-shimmer" style={{ width: '90px', height: '16px' }} />
            </div>
          </div>
          <div className="linear-list">
            {[1, 2].map((n) => (
              <div key={n} className="skeleton-list-item">
                <div className="skeleton-shimmer skeleton-checkbox" style={{ opacity: 0.5 }} />
                <div className="skeleton-content">
                  <div
                    className="skeleton-shimmer skeleton-title"
                    style={{ width: n === 1 ? '50%' : '40%', opacity: 0.5 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

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
        hapticFeedback('error');
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
    const item = (groceriesData?.active_items || []).find((i) => i.id === itemId);
    const curVal = item?.target_value || 0;
    const newTarget = Math.max(0, Math.round((curVal + delta) * 100) / 100);

    if (setGroceriesData) {
      setGroceriesData((prev) => {
        if (!prev) return prev;
        const active = (prev.active_items || []).map((i) => {
          if (i.id === itemId) {
            return { ...i, target_value: newTarget };
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
            <Minus size={14} strokeWidth={2.5} />
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
                <Check size={13} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <span
              className="numeric-val-badge"
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
            <Plus size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="tab-scroll-container groceries-tab-container">
      <ViewHeader
        title="Список продуктов"
        subtitle="Быстрые покупки"
        actions={
          completedCount > 0 && (
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
          )
        }
        mobileActions={
          completedCount > 0 && (
            <button
              type="button"
              className="canvas-sync-btn btn-danger-subtle"
              onClick={handleClearCompleted}
              title="Очистить купленные товары"
              aria-label="Очистить купленные товары"
              style={{ width: '32px', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Trash2 size={14} />
            </button>
          )
        }
      />

      {/* Progress & Actions Header Card: hidden when all items bought or 0 items */}
      {totalCount > 0 && completedCount < totalCount && (
        <div className="day-status-card">
          <div className="day-progress-horizontal-group">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="day-progress-metric">
              {completedCount} из {totalCount} ({progressPct}%)
            </span>
          </div>

          <div className="day-status-actions">
            {completedCount > 0 && (
              <button
                type="button"
                className="day-status-action-btn btn-danger-subtle"
                onClick={handleClearCompleted}
                title="Очистить купленные товары"
                aria-label="Очистить купленные товары"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Quick Add Bar with Direct Voice Button */}
      <QuickAddBar
        placeholder="Добавить продукт..."
        value={quickTitle}
        onChange={setQuickTitle}
        onSubmit={handleQuickSubmit}
        isSubmitting={isSubmittingQuick}
        onVoiceClick={() => {
          if (onOpenQuickAdd) {
            onOpenQuickAdd({
              initialCategory: 'grocery',
              autoStartVoice: true,
            });
          }
        }}
        voiceTitle="Надиктовать список продуктов голосом"
        submitTitle="Добавить в список"
        className="groceries-quick-add-wrap"
      />

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
            Надиктуйте список через микрофон <Mic size={13} style={{ verticalAlign: 'middle', display: 'inline', margin: '0 2px' }} /> или введите продукт сверху (например: <i>«Молоко 2 л»</i>).
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
                  {/* Animated Checkbox */}
                  <AnimatedCheckbox
                    checked={false}
                    onChange={() => handleToggle(item.id, false)}
                    ariaLabel="Отметить как купленное"
                    style={{ marginTop: '3px' }}
                  />

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
                      <div className="linear-title">
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
                <AnimatedChevron isOpen={isCompletedOpen} size={16} />
            </div>

            <AnimatedAccordion isOpen={isCompletedOpen}>
              <div className="linear-list">
                {completedItems.map((item) => (
                  <div
                    key={item.id}
                    className="linear-list-item completed"
                    style={{ alignItems: 'flex-start' }}
                  >
                    {/* Checked animated checkbox */}
                    <AnimatedCheckbox
                      checked={true}
                      onChange={() => handleToggle(item.id, true)}
                      ariaLabel="Вернуть в список покупок"
                      style={{ marginTop: '3px' }}
                    />

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
            </AnimatedAccordion>
          </section>
        )}
      </div>
    </div>
  );
}
