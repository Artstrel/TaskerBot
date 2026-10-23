import React, { useState } from 'react';
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Check,
  Trash2,
  Clock,
  Sparkles,
  Mic,
} from 'lucide-react';
import {
  createGoal,
  deleteGoal,
  addGoalSubtask,
  toggleTask,
  postponeTask,
  hapticFeedback,
  setCachedGoals,
  setCachedDashboard,
  addPendingMutation,
  removePendingMutation,
} from '../api';
import Mascot from './Mascot';

export default function GoalsTab({
  goalsData = [],
  setGoalsData,
  dashboardData,
  setDashboardData,
  onRefresh,
  onOpenQuickAdd,
}) {
  const [expandedGoalId, setExpandedGoalId] = useState(null);
  const [isCreatingGoal, setIsCreatingGoal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDesc, setNewGoalDesc] = useState('');
  const [newGoalDate, setNewGoalDate] = useState('');
  const [newSubtaskTitles, setNewSubtaskTitles] = useState({});
  const [aiGoalInput, setAiGoalInput] = useState('');

  const toggleExpand = (id) => {
    hapticFeedback('selection');
    setExpandedGoalId((prev) => (prev === id ? null : id));
  };

  const handleCreateGoal = (e) => {
    e.preventDefault();
    const title = newGoalTitle.trim();
    if (!title) return;

    const tempId = `temp_goal_${Date.now()}`;
    const mutationId = `create_goal_${tempId}`;
    const desc = newGoalDesc.trim() || null;
    const targetDate = newGoalDate || null;

    const optimisticGoal = {
      id: tempId,
      title,
      description: desc,
      target_date: targetDate,
      progress: 0,
      subtasks: [],
      is_optimistic: true,
    };

    setNewGoalTitle('');
    setNewGoalDesc('');
    setNewGoalDate('');
    setIsCreatingGoal(false);
    hapticFeedback('success');

    if (setGoalsData) {
      setGoalsData((prev) => {
        const updated = [optimisticGoal, ...(prev || [])];
        setCachedGoals(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'create_goal', tempId, title, timestamp: Date.now() });

    createGoal({ title, description: desc, target_date: targetDate })
      .then((realGoal) => {
        removePendingMutation(mutationId);
        if (setGoalsData && realGoal && realGoal.id) {
          setGoalsData((prev) => {
            const updated = (prev || []).map((g) => (g.id === tempId ? { ...realGoal, is_optimistic: false } : g));
            setCachedGoals(updated);
            return updated;
          });
        }
      })
      .catch((err) => {
        console.error('Failed to create goal:', err);
        removePendingMutation(mutationId);
        if (setGoalsData) {
          setGoalsData((prev) => {
            const updated = (prev || []).filter((g) => g.id !== tempId);
            setCachedGoals(updated);
            return updated;
          });
        }
      });
  };

  const handleAddSubtask = (goalId) => {
    const title = (newSubtaskTitles[goalId] || '').trim();
    if (!title) return;

    const tempId = `temp_subtask_${Date.now()}`;
    const mutationId = `add_subtask_${tempId}`;

    const optimisticSubtask = {
      id: tempId,
      title,
      is_completed: false,
      scheduled_date: null,
      is_optimistic: true,
    };

    setNewSubtaskTitles((prev) => ({ ...prev, [goalId]: '' }));
    hapticFeedback('light');

    if (setGoalsData) {
      setGoalsData((prev) => {
        const updated = (prev || []).map((g) => {
          if (g.id === goalId) {
            const subtasks = [...(g.subtasks || []), optimisticSubtask];
            const completedCount = subtasks.filter((s) => s.is_completed).length;
            const progress = subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0;
            return { ...g, subtasks, progress };
          }
          return g;
        });
        setCachedGoals(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'add_subtask', goalId, tempId, title, timestamp: Date.now() });

    addGoalSubtask(goalId, title)
      .then((realSubtask) => {
        removePendingMutation(mutationId);
        if (setGoalsData && realSubtask && realSubtask.id) {
          setGoalsData((prev) => {
            const updated = (prev || []).map((g) => {
              if (g.id === goalId) {
                const subtasks = (g.subtasks || []).map((s) => (s.id === tempId ? realSubtask : s));
                return { ...g, subtasks };
              }
              return g;
            });
            setCachedGoals(updated);
            return updated;
          });
        }
      })
      .catch((err) => {
        console.error('Failed to add subtask:', err);
        removePendingMutation(mutationId);
        if (setGoalsData) {
          setGoalsData((prev) => {
            const updated = (prev || []).map((g) => {
              if (g.id === goalId) {
                const subtasks = (g.subtasks || []).filter((s) => s.id !== tempId);
                const completedCount = subtasks.filter((s) => s.is_completed).length;
                const progress = subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0;
                return { ...g, subtasks, progress };
              }
              return g;
            });
            setCachedGoals(updated);
            return updated;
          });
        }
      });
  };

  const handleToggleSubtask = (goalId, subtaskId, currentStatus) => {
    const nextStatus = !currentStatus;
    const mutationId = `toggle_subtask_${subtaskId}_${Date.now()}`;
    hapticFeedback(nextStatus ? 'medium' : 'light');

    if (setGoalsData) {
      setGoalsData((prev) => {
        const updated = (prev || []).map((g) => {
          if (g.id === goalId) {
            const subtasks = (g.subtasks || []).map((s) =>
              s.id === subtaskId ? { ...s, is_completed: nextStatus } : s
            );
            const completedCount = subtasks.filter((s) => s.is_completed).length;
            const progress = subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0;
            return { ...g, subtasks, progress };
          }
          return g;
        });
        setCachedGoals(updated);
        return updated;
      });
    }

    // Also update in today's dashboard if present
    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        const inToday = (prev.today_tasks || []).some((t) => t.id === subtaskId);
        if (!inToday) return prev;
        const newToday = (prev.today_tasks || []).map((t) =>
          t.id === subtaskId ? { ...t, is_completed: nextStatus } : t
        );
        const delta = nextStatus ? 1 : -1;
        const updated = {
          ...prev,
          today_tasks: newToday,
          completed_count: Math.max(0, Math.min(prev.total_count, (prev.completed_count || 0) + delta)),
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'toggle_subtask', subtaskId, nextStatus, timestamp: Date.now() });

    toggleTask(subtaskId, nextStatus)
      .then(() => {
        removePendingMutation(mutationId);
      })
      .catch((err) => {
        console.error('Failed to toggle subtask:', err);
        removePendingMutation(mutationId);
        // Rollback
        if (setGoalsData) {
          setGoalsData((prev) => {
            const updated = (prev || []).map((g) => {
              if (g.id === goalId) {
                const subtasks = (g.subtasks || []).map((s) =>
                  s.id === subtaskId ? { ...s, is_completed: currentStatus } : s
                );
                const completedCount = subtasks.filter((s) => s.is_completed).length;
                const progress = subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0;
                return { ...g, subtasks, progress };
              }
              return g;
            });
            setCachedGoals(updated);
            return updated;
          });
        }
      });
  };

  const handleScheduleForToday = (goalId, subtaskId) => {
    const today = new Date().toISOString().split('T')[0];
    const mutationId = `schedule_subtask_${subtaskId}_${Date.now()}`;
    hapticFeedback('medium');

    let scheduledSubtask = null;

    if (setGoalsData) {
      setGoalsData((prev) => {
        const updated = (prev || []).map((g) => {
          if (g.id === goalId) {
            const subtasks = (g.subtasks || []).map((s) => {
              if (s.id === subtaskId) {
                scheduledSubtask = { ...s, scheduled_date: today };
                return scheduledSubtask;
              }
              return s;
            });
            return { ...g, subtasks };
          }
          return g;
        });
        setCachedGoals(updated);
        return updated;
      });
    }

    // Add to TodayTab list optimistically
    if (setDashboardData && scheduledSubtask) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        const exists = (prev.today_tasks || []).some((t) => t.id === subtaskId);
        if (exists) return prev;
        const updated = {
          ...prev,
          today_tasks: [scheduledSubtask, ...(prev.today_tasks || [])],
          total_count: (prev.total_count || 0) + 1,
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'postpone_task', taskId: subtaskId, dateStr: today, timestamp: Date.now() });

    postponeTask(subtaskId, today)
      .then(() => {
        removePendingMutation(mutationId);
      })
      .catch((err) => {
        console.error('Failed to schedule subtask for today:', err);
        removePendingMutation(mutationId);
      });
  };

  const handleDeleteGoal = (goalId) => {
    if (!window.confirm('Удалить эту цель со всеми подзадачами?')) return;
    const mutationId = `delete_goal_${goalId}_${Date.now()}`;
    hapticFeedback('warning');

    let deletedGoal = null;

    if (setGoalsData) {
      setGoalsData((prev) => {
        deletedGoal = (prev || []).find((g) => g.id === goalId);
        const updated = (prev || []).filter((g) => g.id !== goalId);
        setCachedGoals(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'delete_goal', goalId, timestamp: Date.now() });

    deleteGoal(goalId)
      .then(() => {
        removePendingMutation(mutationId);
      })
      .catch((err) => {
        console.error('Failed to delete goal:', err);
        removePendingMutation(mutationId);
        if (deletedGoal && setGoalsData) {
          setGoalsData((prev) => {
            const updated = [deletedGoal, ...(prev || [])];
            setCachedGoals(updated);
            return updated;
          });
        }
      });
  };

  const handleAiGoalSubmit = (e) => {
    if (e) e.preventDefault();
    const text = aiGoalInput.trim();
    if (!text) return;
    hapticFeedback('medium');
    if (onOpenQuickAdd) {
      onOpenQuickAdd({
        initialText: text,
        initialCategory: 'goal',
      });
      setAiGoalInput('');
    }
  };

  const handleVoiceGoalClick = () => {
    hapticFeedback('medium');
    if (onOpenQuickAdd) {
      onOpenQuickAdd({
        initialCategory: 'goal',
        autoStartVoice: true,
      });
    }
  };

  return (
    <div className="linear-section" style={{ paddingBottom: '30px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Проекты & Цели
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            {goalsData.length} {goalsData.length === 1 ? 'цель' : 'целей'} в работе
          </div>
        </div>

        <button
          onClick={() => {
            hapticFeedback('light');
            setIsCreatingGoal((prev) => !prev);
          }}
          className="filter-chip"
          style={{ padding: '6px 10px', fontSize: '12px' }}
        >
          <Plus size={14} />
          <span>Вручную</span>
        </button>
      </div>

      {/* AI Smart Goal Input Card */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <Sparkles size={14} color="var(--accent-primary)" />
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            ИИ-ввод цели с шагами
          </span>
        </div>
        <form onSubmit={handleAiGoalSubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="unified-textarea"
            placeholder="Опишите цель или надиктуйте её с шагами..."
            value={aiGoalInput}
            onChange={(e) => setAiGoalInput(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              fontSize: '13px',
              minHeight: '38px',
              height: '38px',
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="button"
            className="voice-recording-btn"
            onClick={handleVoiceGoalClick}
            title="Надиктовать цель голосом"
            style={{ height: '38px', padding: '0 12px' }}
          >
            <Mic size={15} />
            <span>Голос</span>
          </button>
          {aiGoalInput.trim() && (
            <button
              type="submit"
              className="submit-task-btn"
              title="Распознать через ИИ"
              style={{ height: '38px', padding: '0 12px' }}
            >
              <Sparkles size={14} />
              <span>Создать</span>
            </button>
          )}
        </form>
      </div>

      {/* Create Goal Form */}
      {isCreatingGoal && (
        <form
          onSubmit={handleCreateGoal}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            marginBottom: '16px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
            Создание цели
          </div>

          <input
            type="text"
            placeholder="Название цели (например, Запустить MVP)"
            value={newGoalTitle}
            onChange={(e) => setNewGoalTitle(e.target.value)}
            className="unified-textarea"
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              fontSize: '13px',
              color: 'var(--text-primary)',
              marginBottom: '10px',
              height: '38px',
            }}
            required
          />

          <textarea
            placeholder="Описание или критерии успеха (необязательно)"
            value={newGoalDesc}
            onChange={(e) => setNewGoalDesc(e.target.value)}
            className="unified-textarea"
            rows={2}
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              fontSize: '13px',
              color: 'var(--text-primary)',
              marginBottom: '10px',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Дедлайн:</span>
            <input
              type="date"
              value={newGoalDate}
              onChange={(e) => setNewGoalDate(e.target.value)}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '5px 10px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="filter-chip"
              onClick={() => setIsCreatingGoal(false)}
            >
              Отмена
            </button>
            <button type="submit" className="submit-task-btn">
              Создать
            </button>
          </div>
        </form>
      )}

      {/* Goals Empty State with Mascot */}
      {goalsData.length === 0 ? (
        <div className="empty-state-mascot-card">
          <Mascot state="idle" size={84} interactive={true} />
          <div className="empty-mascot-title">Целей пока нет</div>
          <div className="empty-mascot-desc">
            Разбивайте крупные проекты на понятные шаги и берите их в план дня.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {goalsData.map((goal) => {
            const isExpanded = expandedGoalId === goal.id;
            const deadlineText = goal.target_date
              ? new Date(goal.target_date).toLocaleDateString('ru-RU')
              : null;

            return (
              <div
                key={goal.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Goal summary card header */}
                <div
                  onClick={() => toggleExpand(goal.id)}
                  style={{
                    padding: '14px 16px',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {goal.title}
                        </span>
                        {deadlineText && (
                          <span className="item-tag">
                            <Clock size={10} /> {deadlineText}
                          </span>
                        )}
                      </div>

                      {goal.description && (
                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                          {goal.description}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        className="item-mini-btn btn-danger"
                        title="Удалить цель"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGoal(goal.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="item-mini-btn">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* Clean linear progress line */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
                    <div style={{ flex: 1, height: '4px', background: 'var(--bg-card)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${goal.progress_percentage}%`,
                          height: '100%',
                          background: goal.progress_percentage === 100 ? 'var(--accent-success)' : 'var(--accent-primary)',
                          borderRadius: '2px',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {goal.progress_percentage}% ({goal.completed_subtasks}/{goal.total_subtasks})
                    </span>
                  </div>
                </div>

                {/* Subtasks Accordion */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: '1px solid var(--border-subtle)',
                      background: 'var(--bg-card)',
                      padding: '12px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                        Шаги ({goal.completed_subtasks} из {goal.total_subtasks})
                      </div>
                      {onOpenQuickAdd && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="item-mini-btn"
                            title="Надиктовать шаги голосом"
                            onClick={(e) => {
                              e.stopPropagation();
                              hapticFeedback('medium');
                              onOpenQuickAdd({
                                initialCategory: 'subtask',
                                initialGoalId: goal.id,
                                initialGoalTitle: goal.title,
                                autoStartVoice: true,
                              });
                            }}
                            style={{ color: 'var(--accent-primary)', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px' }}
                          >
                            <Mic size={11} />
                            <span>Голос</span>
                          </button>
                          <button
                            type="button"
                            className="item-mini-btn"
                            title="Сгенерировать шаги через ИИ"
                            onClick={(e) => {
                              e.stopPropagation();
                              hapticFeedback('medium');
                              onOpenQuickAdd({
                                initialCategory: 'subtask',
                                initialGoalId: goal.id,
                                initialGoalTitle: goal.title,
                                initialText: `Шаги для цели «${goal.title}»: `,
                              });
                            }}
                            style={{ color: 'var(--accent-primary)', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px' }}
                          >
                            <Sparkles size={11} />
                            <span>ИИ</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {goal.subtasks && goal.subtasks.length > 0 ? (
                      <div className="linear-list" style={{ background: 'var(--bg-surface)' }}>
                        {goal.subtasks.map((st) => {
                          const isToday =
                            st.scheduled_date === new Date().toISOString().split('T')[0];

                          return (
                            <div key={st.id} className={`linear-list-item ${st.is_completed ? 'completed' : ''}`}>
                              <button
                                className={`linear-checkbox ${st.is_completed ? 'checked' : ''}`}
                                onClick={() => handleToggleSubtask(goal.id, st.id, st.is_completed)}
                              >
                                {st.is_completed && <Check size={12} strokeWidth={3} />}
                              </button>

                              <div className="item-content-col">
                                <span className="item-title">{st.title}</span>
                              </div>

                              {!st.is_completed && (
                                <button
                                  type="button"
                                  className={`filter-chip ${isToday ? 'active' : ''}`}
                                  style={{ padding: '3px 8px', fontSize: '11px' }}
                                  onClick={() => handleScheduleForToday(goal.id, st.id)}
                                >
                                  {isToday ? 'В плане дня' : '+ На сегодня'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '6px 0' }}>
                        В этой цели пока нет шагов.
                      </div>
                    )}

                    {/* Add subtask inline input */}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <input
                        type="text"
                        placeholder="Новый шаг..."
                        value={newSubtaskTitles[goal.id] || ''}
                        onChange={(e) =>
                          setNewSubtaskTitles((prev) => ({
                            ...prev,
                            [goal.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubtask(goal.id);
                          }
                        }}
                        style={{
                          flex: 1,
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '7px 10px',
                          fontSize: '12px',
                          color: 'var(--text-primary)',
                          outline: 'none',
                        }}
                      />
                      {onOpenQuickAdd && (
                        <button
                          type="button"
                          className="filter-chip"
                          title="Голосовой ввод шага"
                          onClick={() => {
                            hapticFeedback('medium');
                            onOpenQuickAdd({
                              initialCategory: 'subtask',
                              initialGoalId: goal.id,
                              initialGoalTitle: goal.title,
                              autoStartVoice: true,
                            });
                          }}
                          style={{ padding: '0 8px', height: '32px' }}
                        >
                          <Mic size={13} color="var(--accent-primary)" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="submit-task-btn"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={() => handleAddSubtask(goal.id)}
                      >
                        Добавить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
