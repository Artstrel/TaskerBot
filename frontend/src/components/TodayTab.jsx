import React, { useState, useEffect } from 'react';
import AnimatedCheckbox from './ui/AnimatedCheckbox';
import AnimatedChevron from './ui/AnimatedChevron';
import AnimatedAccordion from './ui/AnimatedAccordion';
import {
  AlertTriangle,
  Flame,
  Check,
  Clock,
  ArrowRight,
  Trash2,
  ChevronDown,
  ChevronUp,
  Target,
  Plus,
  Minus,
  Trophy,
  Pencil,
  X,
  RotateCw,
  Zap,
} from 'lucide-react';
import {
  toggleTask,
  postponeTask,
  deleteTask,
  updateTask,
  updateTaskProgress,
  toggleRoutine,
  updateRoutine,
  updateRoutineProgress,
  deleteRoutine,
  createTask,
  hapticFeedback,
  calculateDayEndAndUrgency,
  setCachedDashboard,
  setCachedGoals,
  addPendingMutation,
  removePendingMutation,
  recordUserAction,
} from '../api';
import Mascot from './Mascot';
import ViewHeader from './ViewHeader';
import QuickAddBar from './QuickAddBar';

export default function TodayTab({
  dashboardData,
  setDashboardData,
  goalsData,
  setGoalsData,
  onRefresh,
  onForceRefresh,
  isSyncing,
  isInitialLoading = false,
  onTaskCompleted,
  warmupTimerElapsed,
  onOpenQuickAdd,
}) {
  const [quickTitle, setQuickTitle] = useState('');
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);
  const [isOverdueOpen, setIsOverdueOpen] = useState(true);
  const [isRoutinesOpenUserOverridden, setIsRoutinesOpenUserOverridden] = useState(false);
  const [isRoutinesOpen, setIsRoutinesOpen] = useState(true);
  const [isTodayOpen, setIsTodayOpen] = useState(true);
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);

  // Inline task title editing state
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');

  // Inline routine title editing state
  const [editingRoutineId, setEditingRoutineId] = useState(null);
  const [editRoutineTitle, setEditRoutineTitle] = useState('');

  // Direct numeric value editing state
  const [editingNumericId, setEditingNumericId] = useState(null);
  const [directNumericVal, setDirectNumericVal] = useState('');

  // Live countdown timer state (MUST be called before any early return)
  const [liveHoursLeft, setLiveHoursLeft] = useState(
    dashboardData?.hours_left_in_day !== undefined ? dashboardData.hours_left_in_day : 0
  );
  const [liveUrgency, setLiveUrgency] = useState(dashboardData?.urgency_level || 'normal');

  useEffect(() => {
    if (!dashboardData) return;
    const updateCountdown = () => {
      const dayEndTime = dashboardData.day_end_time || '00:00';
      const calc = calculateDayEndAndUrgency(dayEndTime);
      setLiveHoursLeft(calc.hours_left_in_day);
      setLiveUrgency(calc.urgency_level);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [dashboardData?.day_end_time, dashboardData?.hours_left_in_day]);

  const handleStartEdit = (task) => {
    hapticFeedback('selection');
    if (onOpenQuickAdd) {
      onOpenQuickAdd({
        editingItem: task,
        editingType: 'task',
      });
    } else {
      setEditingTaskId(task.id);
      setEditTaskTitle(task.title);
    }
  };

  const handleSaveEdit = (taskId) => {
    const title = editTaskTitle.trim();
    if (!title) {
      setEditingTaskId(null);
      return;
    }
    const mutationId = `edit_task_${taskId}_${Date.now()}`;
    setEditingTaskId(null);
    hapticFeedback('light');

    let oldTitle = '';

    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        const updateList = (list) =>
          (list || []).map((t) => {
            if (t.id === taskId) {
              oldTitle = t.title;
              return { ...t, title };
            }
            return t;
          });
        const updated = {
          ...prev,
          today_tasks: updateList(prev.today_tasks),
          overdue_tasks: updateList(prev.overdue_tasks),
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'edit_task', taskId, title, timestamp: Date.now() });

    updateTask(taskId, { title })
      .then(() => {
        removePendingMutation(mutationId);
      })
      .catch((err) => {
        console.error('Failed to update task:', err);
        removePendingMutation(mutationId);
        if (oldTitle && setDashboardData) {
          setDashboardData((prev) => {
            if (!prev) return prev;
            const updateList = (list) =>
              (list || []).map((t) => (t.id === taskId ? { ...t, title: oldTitle } : t));
            const rolledBack = {
              ...prev,
              today_tasks: updateList(prev.today_tasks),
              overdue_tasks: updateList(prev.overdue_tasks),
            };
            setCachedDashboard(rolledBack);
            return rolledBack;
          });
        }
      });
  };

  const now = new Date();
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(now);
  const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(now);
  const todayDateSubtitle = `${weekday}, ${dayMonth}`;

  if (!dashboardData) {
    return (
      <div className="today-tab-container today-skeleton-screen">
        <ViewHeader
          title="Сегодня"
          subtitle={todayDateSubtitle}
          actions={
            <span className="sync-indicator-pill">
              <RotateCw size={12} className="spin-sync-icon" />
              <span>Синхронизация...</span>
            </span>
          }
        />
        <div className="today-desktop-grid">
          <div className="today-col-left">
            <section className="linear-section">
              <div className="linear-section-header">
                <div className="linear-section-title">
                  <div className="skeleton-shimmer" style={{ width: '130px', height: '16px' }} />
                </div>
              </div>
              <div className="linear-list">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="skeleton-list-item">
                    <div className="skeleton-shimmer skeleton-checkbox" />
                    <div className="skeleton-content">
                      <div className="skeleton-shimmer skeleton-title" style={{ width: n === 1 ? '70%' : '55%' }} />
                      <div className="skeleton-shimmer skeleton-subtitle" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="today-col-right">
            {warmupTimerElapsed && (
              <div style={{ padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <Zap size={14} style={{ color: 'var(--accent-warning, #f59e0b)', flexShrink: 0 }} />
                <span>Сервер просыпается после перерыва. Ваши задачи загрузятся через несколько секунд!</span>
              </div>
            )}
            <section className="linear-section">
              <div className="linear-section-header">
                <div className="linear-section-title">
                  <div className="skeleton-shimmer" style={{ width: '110px', height: '16px' }} />
                </div>
              </div>
              <div className="linear-list">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="skeleton-list-item">
                    <div className="skeleton-shimmer skeleton-checkbox" />
                    <div className="skeleton-content">
                      <div className="skeleton-shimmer skeleton-title" style={{ width: n === 1 ? '75%' : n === 2 ? '60%' : '85%' }} />
                      <div className="skeleton-shimmer skeleton-subtitle" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  const {
    hours_left_in_day = 0,
    urgency_level = 'normal',
    overdue_tasks = [],
    routine_tasks = [],
    today_tasks = [],
    completed_count = 0,
    total_count = 0,
  } = dashboardData;

  const activeTodayTasks = today_tasks.filter((t) => !t.is_completed);
  const completedTodayTasks = today_tasks.filter((t) => t.is_completed);

  const allRoutinesDone = routine_tasks.length > 0 && routine_tasks.every((r) => r.is_completed_today);
  const hasUnfinishedRoutines = routine_tasks.some((r) => !r.is_completed_today);
  const hasUnfinishedTasks = activeTodayTasks.length > 0 || overdue_tasks.some((t) => !t.is_completed);

  const totalEntityCount = routine_tasks.length + today_tasks.length + overdue_tasks.length;
  const isRoutinesSectionOpen = isRoutinesOpenUserOverridden ? isRoutinesOpen : !allRoutinesDone;

  const progressPct = total_count > 0 ? Math.round((completed_count / total_count) * 100) : 0;
  // Day is all done strictly when there are items and NONE are unfinished
  const isDayAllDone = totalEntityCount > 0 && !hasUnfinishedRoutines && !hasUnfinishedTasks;
  const isDayCompletelyEmpty = totalEntityCount === 0;

  const handleToggleTask = (taskId, currentStatus) => {
    const nextStatus = !currentStatus;
    const mutationId = `toggle_task_${taskId}_${Date.now()}`;

    // 1. Instant 0ms Haptic & Mascot Celebration
    hapticFeedback(nextStatus ? 'medium' : 'light');
    if (nextStatus && onTaskCompleted) {
      onTaskCompleted();
    }

    // 2. Instant 0ms Optimistic State & Local Cache
    const targetTask = [
      ...(dashboardData?.today_tasks || []),
      ...(dashboardData?.overdue_tasks || []),
    ].find((t) => t.id === taskId);
    const goalId = targetTask?.goal_id;

    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        const updateList = (list) =>
          (list || []).map((t) => {
            if (t.id === taskId) {
              const target = t.target_value;
              const nextVal = target ? (nextStatus ? target : 0) : t.current_value;
              return { ...t, is_completed: nextStatus, current_value: nextVal };
            }
            return t;
          });
        const newToday = updateList(prev.today_tasks);
        const newOverdue = updateList(prev.overdue_tasks);
        const delta = nextStatus ? 1 : -1;
        const newCompletedCount = Math.max(0, Math.min(prev.total_count, (prev.completed_count || 0) + delta));
        const updated = {
          ...prev,
          today_tasks: newToday,
          overdue_tasks: newOverdue,
          completed_count: newCompletedCount,
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    if (goalId && setGoalsData) {
      setGoalsData((prevGoals) => {
        if (!prevGoals || !Array.isArray(prevGoals)) return prevGoals;
        const updated = prevGoals.map((g) => {
          if (g.id !== goalId) return g;
          const updatedSubtasks = (g.subtasks || []).map((st) =>
            st.id === taskId ? { ...st, is_completed: nextStatus } : st
          );
          const total = updatedSubtasks.length;
          const completed = updatedSubtasks.filter((st) => st.is_completed).length;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          const isDone = total > 0 && completed === total;
          return {
            ...g,
            subtasks: updatedSubtasks,
            total_subtasks: total,
            completed_subtasks: completed,
            progress_percentage: pct,
            is_completed: isDone,
            completed_at: isDone ? (g.completed_at || new Date().toISOString()) : null,
          };
        });
        setCachedGoals(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'toggle_task', taskId, nextStatus, timestamp: Date.now() });

    // 3. Background Async Server Call
    toggleTask(taskId, nextStatus)
      .then(() => {
        removePendingMutation(mutationId);
      })
      .catch((err) => {
        console.error('Failed to toggle task:', err);
        hapticFeedback('error');
        removePendingMutation(mutationId);
        // Rollback state on error
        if (setDashboardData) {
          setDashboardData((prev) => {
            if (!prev) return prev;
            const updateList = (list) =>
              (list || []).map((t) => (t.id === taskId ? { ...t, is_completed: currentStatus } : t));
            const newToday = updateList(prev.today_tasks);
            const newOverdue = updateList(prev.overdue_tasks);
            const delta = currentStatus ? 1 : -1;
            const newCompletedCount = Math.max(0, Math.min(prev.total_count, (prev.completed_count || 0) + delta));
            const rolledBack = {
              ...prev,
              today_tasks: newToday,
              overdue_tasks: newOverdue,
              completed_count: newCompletedCount,
            };
            setCachedDashboard(rolledBack);
            return rolledBack;
          });
        }
        if (goalId && setGoalsData) {
          setGoalsData((prevGoals) => {
            if (!prevGoals || !Array.isArray(prevGoals)) return prevGoals;
            const rolledBack = prevGoals.map((g) => {
              if (g.id !== goalId) return g;
              const updatedSubtasks = (g.subtasks || []).map((st) =>
                st.id === taskId ? { ...st, is_completed: currentStatus } : st
              );
              const total = updatedSubtasks.length;
              const completed = updatedSubtasks.filter((st) => st.is_completed).length;
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
              const isDone = total > 0 && completed === total;
              return {
                ...g,
                subtasks: updatedSubtasks,
                total_subtasks: total,
                completed_subtasks: completed,
                progress_percentage: pct,
                is_completed: isDone,
                completed_at: isDone ? (g.completed_at || new Date().toISOString()) : null,
              };
            });
            setCachedGoals(rolledBack);
            return rolledBack;
          });
        }
      });
  };

  const handleToggleRoutine = (routineId, currentStatus) => {
    const nextStatus = !currentStatus;
    const mutationId = `toggle_routine_${routineId}_${Date.now()}`;

    hapticFeedback(nextStatus ? 'medium' : 'light');
    if (nextStatus && onTaskCompleted) {
      onTaskCompleted();
    }

    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        const newRoutines = (prev.routine_tasks || []).map((r) => {
          if (r.id === routineId) {
            const currentStreak = r.current_streak || 0;
            const newStreak = nextStatus ? currentStreak + 1 : Math.max(0, currentStreak - 1);
            const target = r.target_value;
            const nextVal = target ? (nextStatus ? target : 0) : r.current_value;
            return {
              ...r,
              is_completed_today: nextStatus,
              current_value: nextVal,
              current_streak: newStreak,
              best_streak: Math.max(r.best_streak || 0, newStreak),
            };
          }
          return r;
        });
        const delta = nextStatus ? 1 : -1;
        const newCompletedCount = Math.max(0, Math.min(prev.total_count, (prev.completed_count || 0) + delta));
        const updated = {
          ...prev,
          routine_tasks: newRoutines,
          completed_count: newCompletedCount,
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'toggle_routine', routineId, nextStatus, timestamp: Date.now() });

    toggleRoutine(routineId, nextStatus)
      .then(() => {
        removePendingMutation(mutationId);
      })
      .catch((err) => {
        console.error('Failed to toggle routine:', err);
        hapticFeedback('error');
        removePendingMutation(mutationId);
        // Rollback state on error
        if (setDashboardData) {
          setDashboardData((prev) => {
            if (!prev) return prev;
            const newRoutines = (prev.routine_tasks || []).map((r) => {
              if (r.id === routineId) {
                const currentStreak = r.current_streak || 0;
                const newStreak = currentStatus ? currentStreak + 1 : Math.max(0, currentStreak - 1);
                return {
                  ...r,
                  is_completed_today: currentStatus,
                  current_streak: newStreak,
                };
              }
              return r;
            });
            const delta = currentStatus ? 1 : -1;
            const newCompletedCount = Math.max(0, Math.min(prev.total_count, (prev.completed_count || 0) + delta));
            const rolledBack = {
              ...prev,
              routine_tasks: newRoutines,
              completed_count: newCompletedCount,
            };
            setCachedDashboard(rolledBack);
            return rolledBack;
          });
        }
      });
  };

  const handleStartRoutineEdit = (routine) => {
    hapticFeedback('selection');
    if (onOpenQuickAdd) {
      onOpenQuickAdd({
        editingItem: routine,
        editingType: 'routine',
      });
    } else {
      setEditingRoutineId(routine.id);
      setEditRoutineTitle(routine.title);
    }
  };

  const handleSaveRoutineEdit = (routineId) => {
    const title = editRoutineTitle.trim();
    if (!title) {
      setEditingRoutineId(null);
      return;
    }
    const mutationId = `edit_routine_${routineId}_${Date.now()}`;
    setEditingRoutineId(null);
    hapticFeedback('light');

    let oldTitle = '';

    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        const newRoutines = (prev.routine_tasks || []).map((r) => {
          if (r.id === routineId) {
            oldTitle = r.title;
            return { ...r, title };
          }
          return r;
        });
        const updated = { ...prev, routine_tasks: newRoutines };
        setCachedDashboard(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'edit_routine', routineId, title, timestamp: Date.now() });

    updateRoutine(routineId, { title })
      .then(() => {
        removePendingMutation(mutationId);
      })
      .catch((err) => {
        console.error('Failed to update routine:', err);
        removePendingMutation(mutationId);
        if (oldTitle && setDashboardData) {
          setDashboardData((prev) => {
            if (!prev) return prev;
            const newRoutines = (prev.routine_tasks || []).map((r) =>
              r.id === routineId ? { ...r, title: oldTitle } : r
            );
            const rolledBack = { ...prev, routine_tasks: newRoutines };
            setCachedDashboard(rolledBack);
            return rolledBack;
          });
        }
      });
  };

  const handleDeleteRoutine = (routineId) => {
    if (!window.confirm('Удалить эту привычку?')) return;
    const mutationId = `delete_routine_${routineId}_${Date.now()}`;
    hapticFeedback('warning');

    let deletedRoutine = null;

    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        deletedRoutine = (prev.routine_tasks || []).find((r) => r.id === routineId);
        const wasCompleted = deletedRoutine?.is_completed_today || false;
        const updated = {
          ...prev,
          routine_tasks: (prev.routine_tasks || []).filter((r) => r.id !== routineId),
          total_count: Math.max(0, (prev.total_count || 0) - 1),
          completed_count: wasCompleted
            ? Math.max(0, (prev.completed_count || 0) - 1)
            : prev.completed_count,
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'delete_routine', routineId, timestamp: Date.now() });

    deleteRoutine(routineId)
      .then(() => {
        removePendingMutation(mutationId);
      })
      .catch((err) => {
        console.error('Failed to delete routine:', err);
        removePendingMutation(mutationId);
        if (deletedRoutine && setDashboardData) {
          setDashboardData((prev) => {
            if (!prev) return prev;
            const wasCompleted = deletedRoutine.is_completed_today;
            const updated = {
              ...prev,
              routine_tasks: [deletedRoutine, ...(prev.routine_tasks || [])],
              total_count: (prev.total_count || 0) + 1,
              completed_count: wasCompleted ? (prev.completed_count || 0) + 1 : prev.completed_count,
            };
            setCachedDashboard(updated);
            return rolledBack;
          });
        }
      });
  };

  const formatNumericVal = (val) => {
    if (val === null || val === undefined) return '0';
    const num = Number(val);
    if (Number.isInteger(num)) return num.toString();
    return num.toFixed(2).replace(/\.?0+$/, '');
  };

  const handleTaskProgress = (taskId, delta) => {
    hapticFeedback('light');
    recordUserAction();
    let willComplete = false;
    let computedNextVal = 0;
    let targetGoalId = null;

    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        let deltaCompleted = 0;
        const updateList = (list) =>
          (list || []).map((t) => {
            if (t.id === taskId) {
              const target = t.target_value || 1;
              const cur = t.current_value || 0;
              const nextVal = Math.max(0, Math.round((cur + delta) * 100) / 100);
              computedNextVal = nextVal;
              targetGoalId = t.goal_id;
              const nextCompleted = nextVal >= target;
              if (!t.is_completed && nextCompleted) {
                willComplete = true;
                deltaCompleted = 1;
              } else if (t.is_completed && !nextCompleted) {
                deltaCompleted = -1;
              }
              return { ...t, current_value: nextVal, is_completed: nextCompleted };
            }
            return t;
          });
        const newToday = updateList(prev.today_tasks);
        const newOverdue = updateList(prev.overdue_tasks);
        const newCompletedCount = Math.max(0, Math.min(prev.total_count, (prev.completed_count || 0) + deltaCompleted));
        const updated = {
          ...prev,
          today_tasks: newToday,
          overdue_tasks: newOverdue,
          completed_count: newCompletedCount,
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    if (targetGoalId && setGoalsData) {
      setGoalsData((prevGoals) => {
        if (!prevGoals || !Array.isArray(prevGoals)) return prevGoals;
        const updated = prevGoals.map((g) => {
          if (g.id !== targetGoalId) return g;
          const updatedSubtasks = (g.subtasks || []).map((st) => {
            if (st.id === taskId) {
              const target = st.target_value || 1;
              const isDone = computedNextVal >= target;
              return { ...st, current_value: computedNextVal, is_completed: isDone };
            }
            return st;
          });
          const total = updatedSubtasks.length;
          const completed = updatedSubtasks.filter((st) => st.is_completed).length;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          const isDone = total > 0 && completed === total;
          return {
            ...g,
            subtasks: updatedSubtasks,
            total_subtasks: total,
            completed_subtasks: completed,
            progress_percentage: pct,
            is_completed: isDone,
          };
        });
        setCachedGoals(updated);
        return updated;
      });
    }

    if (willComplete && onTaskCompleted) {
      onTaskCompleted();
      hapticFeedback('medium');
    }

    updateTaskProgress(taskId, { current_value: computedNextVal, delta }).catch((err) => {
      console.error('Failed to update task progress:', err);
      onRefresh?.();
    });
  };

  const handleTaskDirectValue = (taskId, valStr) => {
    const val = parseFloat(valStr.replace(',', '.'));
    setEditingNumericId(null);
    if (isNaN(val) || val < 0) return;
    hapticFeedback('light');
    recordUserAction();
    let willComplete = false;
    let targetGoalId = null;

    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        let deltaCompleted = 0;
        const updateList = (list) =>
          (list || []).map((t) => {
            if (t.id === taskId) {
              const target = t.target_value || 1;
              targetGoalId = t.goal_id;
              const nextCompleted = val >= target;
              if (!t.is_completed && nextCompleted) {
                willComplete = true;
                deltaCompleted = 1;
              } else if (t.is_completed && !nextCompleted) {
                deltaCompleted = -1;
              }
              return { ...t, current_value: val, is_completed: nextCompleted };
            }
            return t;
          });
        const newToday = updateList(prev.today_tasks);
        const newOverdue = updateList(prev.overdue_tasks);
        const newCompletedCount = Math.max(0, Math.min(prev.total_count, (prev.completed_count || 0) + deltaCompleted));
        const updated = {
          ...prev,
          today_tasks: newToday,
          overdue_tasks: newOverdue,
          completed_count: newCompletedCount,
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    if (targetGoalId && setGoalsData) {
      setGoalsData((prevGoals) => {
        if (!prevGoals || !Array.isArray(prevGoals)) return prevGoals;
        const updated = prevGoals.map((g) => {
          if (g.id !== targetGoalId) return g;
          const updatedSubtasks = (g.subtasks || []).map((st) => {
            if (st.id === taskId) {
              const target = st.target_value || 1;
              const isDone = val >= target;
              return { ...st, current_value: val, is_completed: isDone };
            }
            return st;
          });
          const total = updatedSubtasks.length;
          const completed = updatedSubtasks.filter((st) => st.is_completed).length;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          const isDone = total > 0 && completed === total;
          return {
            ...g,
            subtasks: updatedSubtasks,
            total_subtasks: total,
            completed_subtasks: completed,
            progress_percentage: pct,
            is_completed: isDone,
          };
        });
        setCachedGoals(updated);
        return updated;
      });
    }

    if (willComplete && onTaskCompleted) {
      onTaskCompleted();
      hapticFeedback('medium');
    }

    updateTaskProgress(taskId, { current_value: val }).catch((err) => {
      console.error('Failed to update task progress:', err);
      onRefresh?.();
    });
  };

  const handleRoutineProgress = (routineId, delta) => {
    hapticFeedback('light');
    recordUserAction();
    let willComplete = false;
    let computedNextVal = 0;

    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        let deltaCompleted = 0;
        const newRoutines = (prev.routine_tasks || []).map((r) => {
          if (r.id === routineId) {
            const target = r.target_value || 1;
            const cur = r.current_value || 0;
            const nextVal = Math.max(0, Math.round((cur + delta) * 100) / 100);
            computedNextVal = nextVal;
            const nextCompleted = nextVal >= target;
            const currentStreak = r.current_streak || 0;
            let newStreak = currentStreak;
            if (!r.is_completed_today && nextCompleted) {
              willComplete = true;
              deltaCompleted = 1;
              newStreak = currentStreak + 1;
            } else if (r.is_completed_today && !nextCompleted) {
              deltaCompleted = -1;
              newStreak = Math.max(0, currentStreak - 1);
            }
            return {
              ...r,
              current_value: nextVal,
              is_completed_today: nextCompleted,
              current_streak: newStreak,
              best_streak: Math.max(r.best_streak || 0, newStreak),
            };
          }
          return r;
        });
        const newCompletedCount = Math.max(0, Math.min(prev.total_count, (prev.completed_count || 0) + deltaCompleted));
        const updated = {
          ...prev,
          routine_tasks: newRoutines,
          completed_count: newCompletedCount,
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    if (willComplete && onTaskCompleted) {
      onTaskCompleted();
      hapticFeedback('medium');
    }

    updateRoutineProgress(routineId, { current_value: computedNextVal, delta }).catch((err) => {
      console.error('Failed to update routine progress:', err);
      onRefresh?.();
    });
  };

  const handleRoutineDirectValue = (routineId, valStr) => {
    const val = parseFloat(valStr.replace(',', '.'));
    setEditingNumericId(null);
    if (isNaN(val) || val < 0) return;
    hapticFeedback('light');
    recordUserAction();
    let willComplete = false;

    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        let deltaCompleted = 0;
        const newRoutines = (prev.routine_tasks || []).map((r) => {
          if (r.id === routineId) {
            const target = r.target_value || 1;
            const nextCompleted = val >= target;
            const currentStreak = r.current_streak || 0;
            let newStreak = currentStreak;
            if (!r.is_completed_today && nextCompleted) {
              willComplete = true;
              deltaCompleted = 1;
              newStreak = currentStreak + 1;
            } else if (r.is_completed_today && !nextCompleted) {
              deltaCompleted = -1;
              newStreak = Math.max(0, currentStreak - 1);
            }
            return {
              ...r,
              current_value: val,
              is_completed_today: nextCompleted,
              current_streak: newStreak,
              best_streak: Math.max(r.best_streak || 0, newStreak),
            };
          }
          return r;
        });
        const newCompletedCount = Math.max(0, Math.min(prev.total_count, (prev.completed_count || 0) + deltaCompleted));
        const updated = {
          ...prev,
          routine_tasks: newRoutines,
          completed_count: newCompletedCount,
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    if (willComplete && onTaskCompleted) {
      onTaskCompleted();
      hapticFeedback('medium');
    }

    updateRoutineProgress(routineId, { current_value: val }).catch((err) => {
      console.error('Failed to update routine progress:', err);
      onRefresh?.();
    });
  };

  const handlePostponeTomorrow = (taskId) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    const mutationId = `postpone_task_${taskId}_${Date.now()}`;
    hapticFeedback('medium');

    let postponedTask = null;

    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        postponedTask =
          (prev.today_tasks || []).find((t) => t.id === taskId) ||
          (prev.overdue_tasks || []).find((t) => t.id === taskId);
        const wasCompleted = postponedTask?.is_completed || false;
        const updated = {
          ...prev,
          today_tasks: (prev.today_tasks || []).filter((t) => t.id !== taskId),
          overdue_tasks: (prev.overdue_tasks || []).filter((t) => t.id !== taskId),
          total_count: Math.max(0, (prev.total_count || 0) - 1),
          completed_count: wasCompleted
            ? Math.max(0, (prev.completed_count || 0) - 1)
            : prev.completed_count,
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'postpone_task', taskId, dateStr, timestamp: Date.now() });

    postponeTask(taskId, dateStr)
      .then(() => {
        removePendingMutation(mutationId);
      })
      .catch((err) => {
        console.error('Failed to postpone task:', err);
        removePendingMutation(mutationId);
        if (postponedTask && setDashboardData) {
          setDashboardData((prev) => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              today_tasks: [postponedTask, ...(prev.today_tasks || [])],
              total_count: (prev.total_count || 0) + 1,
            };
            setCachedDashboard(updated);
            return updated;
          });
        }
      });
  };

  const handleDeleteTask = (taskId) => {
    if (!window.confirm('Удалить эту задачу?')) return;
    const mutationId = `delete_task_${taskId}_${Date.now()}`;
    hapticFeedback('warning');

    let deletedTask = null;

    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        deletedTask =
          (prev.today_tasks || []).find((t) => t.id === taskId) ||
          (prev.overdue_tasks || []).find((t) => t.id === taskId);
        const wasCompleted = deletedTask?.is_completed || false;
        const updated = {
          ...prev,
          today_tasks: (prev.today_tasks || []).filter((t) => t.id !== taskId),
          overdue_tasks: (prev.overdue_tasks || []).filter((t) => t.id !== taskId),
          total_count: Math.max(0, (prev.total_count || 0) - 1),
          completed_count: wasCompleted
            ? Math.max(0, (prev.completed_count || 0) - 1)
            : prev.completed_count,
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'delete_task', taskId, timestamp: Date.now() });

    deleteTask(taskId)
      .then(() => {
        removePendingMutation(mutationId);
      })
      .catch((err) => {
        console.error('Failed to delete task:', err);
        removePendingMutation(mutationId);
        if (deletedTask && setDashboardData) {
          setDashboardData((prev) => {
            if (!prev) return prev;
            const wasCompleted = deletedTask.is_completed;
            const updated = {
              ...prev,
              today_tasks: [deletedTask, ...(prev.today_tasks || [])],
              total_count: (prev.total_count || 0) + 1,
              completed_count: wasCompleted ? (prev.completed_count || 0) + 1 : prev.completed_count,
            };
            setCachedDashboard(updated);
            return updated;
          });
        }
      });
  };

  const handleQuickSubmit = (e) => {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title || isSubmittingQuick) return;

    const tempId = `temp_task_${Date.now()}`;
    const mutationId = `create_task_${tempId}`;
    const todayStr = new Date().toISOString().split('T')[0];

    const optimisticTask = {
      id: tempId,
      title,
      category: 'one_time',
      priority: 0,
      is_completed: false,
      scheduled_date: todayStr,
      created_at: new Date().toISOString(),
      is_optimistic: true,
    };

    setQuickTitle('');
    hapticFeedback('success');

    if (setDashboardData) {
      setDashboardData((prev) => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          today_tasks: [optimisticTask, ...(prev.today_tasks || [])],
          total_count: (prev.total_count || 0) + 1,
        };
        setCachedDashboard(updated);
        return updated;
      });
    }

    addPendingMutation({ id: mutationId, type: 'create_task', tempId, title, timestamp: Date.now() });

    createTask({ title, scheduled_date: todayStr })
      .then((realTask) => {
        removePendingMutation(mutationId);
        if (setDashboardData && realTask && realTask.id) {
          setDashboardData((prev) => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              today_tasks: (prev.today_tasks || []).map((t) =>
                t.id === tempId ? { ...realTask, is_optimistic: false } : t
              ),
            };
            setCachedDashboard(updated);
            return updated;
          });
        }
      })
      .catch((err) => {
        console.error('Failed to create quick task:', err);
        removePendingMutation(mutationId);
        if (setDashboardData) {
          setDashboardData((prev) => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              today_tasks: (prev.today_tasks || []).filter((t) => t.id !== tempId),
              total_count: Math.max(0, (prev.total_count || 0) - 1),
            };
            setCachedDashboard(updated);
            return updated;
          });
        }
      });
  };

  // Time remaining chip configuration with live ticking clock (minimalist text badge)
  const renderTimeChip = () => {
    const totalSeconds = Math.max(0, Math.floor(liveHoursLeft * 3600));
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    let label = '';
    if (hours > 0) {
      label = `${hours}ч ${mins}м`;
    } else {
      label = `${mins}м ${secs}с`;
    }

    const fullTooltip = `До сброса дня: ${label}`;

    if (liveUrgency === 'critical_1h') {
      return (
        <span className="time-left-chip chip-danger" title={fullTooltip}>
          {label}
        </span>
      );
    }
    if (liveUrgency.startsWith('warning')) {
      return (
        <span className="time-left-chip chip-warning" title={fullTooltip}>
          {label}
        </span>
      );
    }
    return (
      <span className="time-left-chip" title={fullTooltip}>
        {label}
      </span>
    );
  };

  const renderNumericStepper = (item, type = 'task') => {
    if (!item.target_value || item.target_value <= 0) return null;

    const cur = item.current_value || 0;
    const target = item.target_value;
    const step = item.step || 1;
    const unit = item.unit ? ` ${item.unit}` : '';
    const pct = Math.min(100, Math.round((cur / target) * 100));
    const isEditing = editingNumericId === `${type}_${item.id}`;

    return (
      <div className="numeric-task-stepper-wrap" onClick={(e) => e.stopPropagation()}>
        {/* Full width progress bar */}
        <div className="numeric-progress-container-full">
          <div className="numeric-progress-track">
            <div
              className={`numeric-progress-fill ${pct >= 100 ? 'completed' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="numeric-percent-text">{pct}%</span>
        </div>

        {/* Stepper controls */}
        <div className="numeric-stepper-controls">
          <button
            type="button"
            className="numeric-btn"
            disabled={cur <= 0}
            onClick={(e) => {
              e.stopPropagation();
              type === 'routine' ? handleRoutineProgress(item.id, -step) : handleTaskProgress(item.id, -step);
            }}
            title={`Уменьшить на ${step}`}
          >
            <Minus size={14} strokeWidth={2.5} />
          </button>

          {isEditing ? (
            <div className="numeric-direct-edit-box" onClick={(e) => e.stopPropagation()}>
              <input
                type="number"
                step="any"
                className="numeric-direct-input"
                value={directNumericVal}
                onChange={(e) => setDirectNumericVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    type === 'routine'
                      ? handleRoutineDirectValue(item.id, directNumericVal)
                      : handleTaskDirectValue(item.id, directNumericVal);
                  }
                  if (e.key === 'Escape') setEditingNumericId(null);
                }}
                autoFocus
              />
              <button
                type="button"
                className="numeric-direct-btn"
                onClick={() =>
                  type === 'routine'
                    ? handleRoutineDirectValue(item.id, directNumericVal)
                    : handleTaskDirectValue(item.id, directNumericVal)
                }
              >
                <Check size={13} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <span
              className="numeric-val-badge"
              onClick={(e) => {
                e.stopPropagation();
                setEditingNumericId(`${type}_${item.id}`);
                setDirectNumericVal(cur.toString());
              }}
              title="Нажмите для ввода точного числа"
            >
              <strong>{formatNumericVal(cur)}</strong>/{formatNumericVal(target)}{unit}
            </span>
          )}

          <button
            type="button"
            className="numeric-btn"
            onClick={(e) => {
              e.stopPropagation();
              type === 'routine' ? handleRoutineProgress(item.id, step) : handleTaskProgress(item.id, step);
            }}
            title={`Добавить ${step}`}
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="today-tab-container">
      <ViewHeader
        title="Сегодня"
        subtitle={todayDateSubtitle}
        actions={
          isSyncing ? (
            <span className="sync-indicator-pill">
              <RotateCw size={12} className="spin-sync-icon" />
              <span>Синхронизация...</span>
            </span>
          ) : null
        }
      />

      {/* Day Progress & Time remaining card: hidden when all completed or 0 tasks */}
      {total_count > 0 && completed_count < total_count && (
        <div className="day-status-card">
          <div className="day-progress-horizontal-group">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="day-progress-metric">
              {completed_count} из {total_count} ({progressPct}%)
            </span>
          </div>
          <div className="day-status-actions">
            {renderTimeChip()}
          </div>
        </div>
      )}

      {/* Top Quick Add Bar with Direct Voice Button */}
      <QuickAddBar
        placeholder="Быстрая задача на сегодня..."
        value={quickTitle}
        onChange={setQuickTitle}
        onSubmit={handleQuickSubmit}
        isSubmitting={isSubmittingQuick}
        onVoiceClick={() => {
          if (onOpenQuickAdd) {
            onOpenQuickAdd({
              initialCategory: 'one_time',
              autoStartVoice: true,
            });
          }
        }}
        voiceTitle="Надиктовать задачу голосом"
        submitTitle="Создать задачу"
        className="today-quick-add-wrap"
      />

      <div className="today-desktop-grid">
        {/* LEFT COLUMN: Habits */}
        <div className="today-col-left">
          {/* SECTION 2: Daily Routines / Habits */}
          {routine_tasks.length > 0 && (
            <section className="linear-section today-routines-section">
              <div
                className="linear-section-header"
                onClick={() => {
                  setIsRoutinesOpenUserOverridden(true);
                  setIsRoutinesOpen(!isRoutinesSectionOpen);
                }}
              >
                <div className="linear-section-title">
                  <span>Привычки & Рутины</span>
                  <span className={`linear-count-badge badge-streak ${allRoutinesDone ? 'badge-success' : ''}`}>
                    {routine_tasks.filter((r) => r.is_completed_today).length}/{routine_tasks.length}
                  </span>
                </div>
                <AnimatedChevron isOpen={isRoutinesSectionOpen} size={16} />
              </div>

              <AnimatedAccordion isOpen={isRoutinesSectionOpen}>
                <div className="linear-list">
                  {routine_tasks.map((routine) => (
                    <div
                      key={routine.id}
                      className={`linear-list-item ${routine.is_completed_today ? 'completed' : ''}`}
                      style={{ alignItems: 'flex-start' }}
                    >
                      <AnimatedCheckbox
                        checked={!!routine.is_completed_today}
                        onChange={() => handleToggleRoutine(routine.id, routine.is_completed_today)}
                        className="habit-streak"
                        ariaLabel="Отметить привычку"
                        style={{ marginTop: '3px' }}
                      />

                      {editingRoutineId === routine.id ? (
                        <div className="task-inline-edit-box">
                          <input
                            type="text"
                            className="task-inline-input"
                            value={editRoutineTitle}
                            onChange={(e) => setEditRoutineTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRoutineEdit(routine.id);
                              if (e.key === 'Escape') setEditingRoutineId(null);
                            }}
                            autoFocus
                          />
                          <div style={{ display: 'flex', gap: '4px', marginTop: '6px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="item-mini-btn"
                              title="Отмена"
                              onClick={() => setEditingRoutineId(null)}
                            >
                              <X size={13} />
                            </button>
                            <button
                              type="button"
                              className="item-mini-btn btn-success"
                              title="Сохранить"
                              onClick={() => handleSaveRoutineEdit(routine.id)}
                            >
                              <Check size={13} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="item-content-col">
                            <div className="item-title">
                              {routine.title}
                            </div>
                            <div className="item-meta-row">
                              {routine.current_streak > 0 && (
                                <span className="item-tag" style={{ color: 'var(--text-primary)' }}>
                                  <Flame size={11} fill="var(--text-primary)" color="var(--text-primary)" />
                                  {routine.current_streak} дн. подряд
                                </span>
                              )}
                              {routine.best_streak > routine.current_streak && (
                                <span className="item-tag">
                                  <Trophy size={10} /> рекорд {routine.best_streak}
                                </span>
                              )}
                              {routine.frequency_type === 'interval' && routine.interval_days > 1 && (
                                <span className="item-tag" title="Интервал повторения">
                                  <RotateCw size={10} /> раз в {routine.interval_days} дн.
                                </span>
                              )}
                              {routine.frequency_type === 'weekly' && routine.days_of_week && routine.days_of_week.length > 0 && (
                                <span className="item-tag" title="Дни недели">
                                  <RotateCw size={10} /> {
                                    routine.days_of_week.length === 5 && [0, 1, 2, 3, 4].every(d => routine.days_of_week.includes(d))
                                      ? 'Будни'
                                      : routine.days_of_week.length === 2 && [5, 6].every(d => routine.days_of_week.includes(d))
                                        ? 'Выходные'
                                        : routine.days_of_week.map(d => ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][d]).filter(Boolean).join(', ')
                                  }
                                </span>
                              )}
                            </div>
                            {renderNumericStepper(routine, 'routine')}
                          </div>

                          <div className="item-action-btns">
                            <button
                              className="item-mini-btn"
                              title="Редактировать"
                              onClick={() => handleStartRoutineEdit(routine)}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className="item-mini-btn btn-danger"
                              title="Удалить"
                              onClick={() => handleDeleteRoutine(routine.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </AnimatedAccordion>
            </section>
          )}
        </div>

        {/* RIGHT COLUMN: Overdue & Today Tasks */}
        <div className="today-col-right">

          {/* All Done Celebration State with Mascot */}
          {isDayAllDone && (
            <div className="empty-state-mascot-card">
              <Mascot state="done" size={96} interactive={true} />
              <div className="empty-mascot-title">День закрыт!</div>
              <div className="empty-mascot-desc">
                Все задачи и привычки на сегодня выполнены. Отличная работа!
              </div>
            </div>
          )}

          {/* Completely Empty State (only when not syncing) */}
          {isDayCompletelyEmpty && !isSyncing && (
            <div className="empty-state-mascot-card">
              <Mascot state="sleep" size={96} interactive={true} />
              <div className="empty-mascot-title">На сегодня пусто</div>
              <div className="empty-mascot-desc">
                Запланируйте задачи через строку выше или нажмите «+» для умного голосового ввода.
              </div>
            </div>
          )}

          {/* Syncing Skeleton placeholder when empty */}
          {isDayCompletelyEmpty && isSyncing && (
            <section className="linear-section">
              <div className="linear-section-header">
                <div className="linear-section-title">
                  <div className="skeleton-shimmer" style={{ width: '120px', height: '16px' }} />
                </div>
              </div>
              <div className="linear-list">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="skeleton-list-item">
                    <div className="skeleton-shimmer skeleton-checkbox" />
                    <div className="skeleton-content">
                      <div className="skeleton-shimmer skeleton-title" style={{ width: n === 1 ? '65%' : n === 2 ? '80%' : '50%' }} />
                      <div className="skeleton-shimmer skeleton-subtitle" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* SECTION 1: Overdue Tasks */}
          {overdue_tasks.length > 0 && (
            <section className="linear-section today-overdue-section">
              <div
                className="linear-section-header"
                onClick={() => setIsOverdueOpen((prev) => !prev)}
              >
                <div className="linear-section-title">
                  <AlertTriangle size={15} color="var(--text-primary)" />
                  <span>Просрочено</span>
                  <span className="linear-count-badge badge-danger">
                    {overdue_tasks.length}
                  </span>
                </div>
                <AnimatedChevron isOpen={isOverdueOpen} size={16} />
              </div>

              <AnimatedAccordion isOpen={isOverdueOpen}>
                <div className="linear-list">
                  {overdue_tasks.map((task) => (
                    <div key={task.id} className={`linear-list-item ${task.is_completed ? 'completed' : ''}`} style={{ alignItems: 'flex-start' }}>
                      <AnimatedCheckbox
                        checked={!!task.is_completed}
                        onChange={() => handleToggleTask(task.id, task.is_completed)}
                        ariaLabel="Выполнить задачу"
                        style={{ marginTop: '3px' }}
                      />

                      {editingTaskId === task.id ? (
                        <div className="task-inline-edit-box">
                          <input
                            type="text"
                            className="task-inline-input"
                            value={editTaskTitle}
                            onChange={(e) => setEditTaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(task.id);
                              if (e.key === 'Escape') setEditingTaskId(null);
                            }}
                            autoFocus
                          />
                          <div style={{ display: 'flex', gap: '4px', marginTop: '6px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="item-mini-btn"
                              title="Отмена"
                              onClick={() => setEditingTaskId(null)}
                            >
                              <X size={13} />
                            </button>
                            <button
                              type="button"
                              className="item-mini-btn btn-success"
                              title="Сохранить"
                              onClick={() => handleSaveEdit(task.id)}
                            >
                              <Check size={13} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="item-content-col">
                            <div className="item-title">
                              {task.title}
                            </div>
                            <div className="item-meta-row">
                              <span className="item-tag tag-overdue">
                                {task.overdue_days > 0 ? `+${task.overdue_days} дн.` : 'со вчера'}
                              </span>
                              {task.goal_title && (
                                <span className="item-tag">
                                  <Target size={10} />
                                  {task.goal_title}
                                </span>
                              )}
                            </div>
                            {renderNumericStepper(task, 'task')}
                          </div>

                          <div className="item-action-btns">
                            <button
                              className="item-mini-btn"
                              title="Редактировать"
                              onClick={() => handleStartEdit(task)}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className="item-mini-btn"
                              title="Перенести на завтра"
                              onClick={() => handlePostponeTomorrow(task.id)}
                            >
                              <ArrowRight size={14} />
                            </button>
                            <button
                              className="item-mini-btn btn-danger"
                              title="Удалить"
                              onClick={() => handleDeleteTask(task.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </AnimatedAccordion>
            </section>
          )}

          {/* SECTION 3: Active Today's Tasks */}
          {activeTodayTasks.length > 0 && (
            <section className="linear-section today-tasks-section">
              <div
                className="linear-section-header"
                onClick={() => setIsTodayOpen((prev) => !prev)}
              >
                <div className="linear-section-title">
                  <span>Задачи</span>
                  <span className="linear-count-badge">
                    {activeTodayTasks.length}
                  </span>
                </div>
                <AnimatedChevron isOpen={isTodayOpen} size={16} />
              </div>

              <AnimatedAccordion isOpen={isTodayOpen}>
                <div className="linear-list">
                  {activeTodayTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`linear-list-item ${task.is_completed ? 'completed' : ''}`}
                      style={{ alignItems: 'flex-start' }}
                    >
                      <AnimatedCheckbox
                        checked={!!task.is_completed}
                        onChange={() => handleToggleTask(task.id, task.is_completed)}
                        ariaLabel="Выполнить задачу"
                        style={{ marginTop: '3px' }}
                      />

                      {editingTaskId === task.id ? (
                        <div className="task-inline-edit-box">
                          <input
                            type="text"
                            className="task-inline-input"
                            value={editTaskTitle}
                            onChange={(e) => setEditTaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(task.id);
                              if (e.key === 'Escape') setEditingTaskId(null);
                            }}
                            autoFocus
                          />
                          <div style={{ display: 'flex', gap: '4px', marginTop: '6px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="item-mini-btn"
                              title="Отмена"
                              onClick={() => setEditingTaskId(null)}
                            >
                              <X size={13} />
                            </button>
                            <button
                              type="button"
                              className="item-mini-btn btn-success"
                              title="Сохранить"
                              onClick={() => handleSaveEdit(task.id)}
                            >
                              <Check size={13} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="item-content-col">
                            <div className="item-title">
                              {task.title}
                            </div>
                            <div className="item-meta-row">
                              {task.scheduled_time && (
                                <span className="item-tag tag-due">
                                  <Clock size={10} />
                                  {task.scheduled_time}
                                </span>
                              )}
                              {task.goal_title && (
                                <span className="item-tag">
                                  <Target size={10} />
                                  {task.goal_title}
                                </span>
                              )}
                            </div>
                            {renderNumericStepper(task, 'task')}
                          </div>

                          <div className="item-action-btns">
                            <button
                              className="item-mini-btn"
                              title="Редактировать"
                              onClick={() => handleStartEdit(task)}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className="item-mini-btn"
                              title="Перенести на завтра"
                              onClick={() => handlePostponeTomorrow(task.id)}
                            >
                              <ArrowRight size={14} />
                            </button>
                            <button
                              className="item-mini-btn btn-danger"
                              title="Удалить"
                              onClick={() => handleDeleteTask(task.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </AnimatedAccordion>
            </section>
          )}

          {/* SECTION 4: Completed Tasks Accordion (Выполненные) */}
          {completedTodayTasks.length > 0 && (
            <section className="linear-section today-completed-section">
              <div
                className="linear-section-header"
                onClick={() => setIsCompletedOpen((prev) => !prev)}
                style={{ cursor: 'pointer' }}
              >
                <div className="linear-section-title">
                  <span style={{ color: 'var(--text-secondary)' }}>Выполненные</span>
                  <span className="linear-count-badge badge-success">
                    {completedTodayTasks.length}
                  </span>
                </div>
                <AnimatedChevron isOpen={isCompletedOpen} size={16} />
              </div>

              <AnimatedAccordion isOpen={isCompletedOpen}>
                <div className="linear-list">
                  {completedTodayTasks.map((task) => (
                    <div
                      key={task.id}
                      className="linear-list-item completed"
                      style={{ alignItems: 'flex-start' }}
                    >
                      <AnimatedCheckbox
                        checked={true}
                        onChange={() => handleToggleTask(task.id, task.is_completed)}
                        ariaLabel="Вернуть в активные задачи"
                        style={{ marginTop: '3px' }}
                      />

                      {editingTaskId === task.id ? (
                        <div className="task-inline-edit-box">
                          <input
                            type="text"
                            className="task-inline-input"
                            value={editTaskTitle}
                            onChange={(e) => setEditTaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(task.id);
                              if (e.key === 'Escape') setEditingTaskId(null);
                            }}
                            autoFocus
                          />
                          <div style={{ display: 'flex', gap: '4px', marginTop: '6px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="item-mini-btn"
                              title="Отмена"
                              onClick={() => setEditingTaskId(null)}
                            >
                              <X size={13} />
                            </button>
                            <button
                              type="button"
                              className="item-mini-btn btn-success"
                              title="Сохранить"
                              onClick={() => handleSaveEdit(task.id)}
                            >
                              <Check size={13} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="item-content-col">
                            <div className="item-title" style={{ textDecoration: 'line-through', opacity: 0.65 }}>
                              {task.title}
                            </div>
                            <div className="item-meta-row">
                              {task.scheduled_time && (
                                <span className="item-tag tag-due">
                                  <Clock size={10} />
                                  {task.scheduled_time}
                                </span>
                              )}
                              {task.goal_title && (
                                <span className="item-tag">
                                  <Target size={10} />
                                  {task.goal_title}
                                </span>
                              )}
                            </div>
                            {renderNumericStepper(task, 'task')}
                          </div>

                          <div className="item-action-btns">
                            <button
                              className="item-mini-btn"
                              title="Редактировать"
                              onClick={() => handleStartEdit(task)}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className="item-mini-btn"
                              title="Перенести на завтра"
                              onClick={() => handlePostponeTomorrow(task.id)}
                            >
                              <ArrowRight size={14} />
                            </button>
                            <button
                              className="item-mini-btn btn-danger"
                              title="Удалить"
                              onClick={() => handleDeleteTask(task.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </AnimatedAccordion>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
