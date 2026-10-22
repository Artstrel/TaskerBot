import React, { useState } from 'react';
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
  Trophy,
} from 'lucide-react';
import {
  toggleTask,
  postponeTask,
  deleteTask,
  toggleRoutine,
  createTask,
  hapticFeedback,
} from '../api';
import Mascot from './Mascot';

export default function TodayTab({ dashboardData, onRefresh, onTaskCompleted }) {
  const [quickTitle, setQuickTitle] = useState('');
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);
  const [isOverdueOpen, setIsOverdueOpen] = useState(true);
  const [isRoutinesOpen, setIsRoutinesOpen] = useState(true);
  const [isTodayOpen, setIsTodayOpen] = useState(true);

  if (!dashboardData) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
        Загрузка задач...
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

  const progressPct = total_count > 0 ? Math.round((completed_count / total_count) * 100) : 0;
  const isDayAllDone = total_count > 0 && completed_count === total_count;
  const isDayCompletelyEmpty = total_count === 0 && overdue_tasks.length === 0;

  const handleToggleTask = async (taskId, currentStatus) => {
    try {
      if (!currentStatus && onTaskCompleted) {
        onTaskCompleted();
      }
      await toggleTask(taskId);
      onRefresh();
    } catch (e) {
      console.error('Failed to toggle task:', e);
    }
  };

  const handleToggleRoutine = async (routineId, currentStatus) => {
    try {
      if (!currentStatus && onTaskCompleted) {
        onTaskCompleted();
      }
      await toggleRoutine(routineId);
      onRefresh();
    } catch (e) {
      console.error('Failed to toggle routine:', e);
    }
  };

  const handlePostponeTomorrow = async (taskId) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    await postponeTask(taskId, dateStr);
    onRefresh();
  };

  const handleDeleteTask = async (taskId) => {
    if (window.confirm('Удалить эту задачу?')) {
      await deleteTask(taskId);
      onRefresh();
    }
  };

  const handleQuickSubmit = async (e) => {
    e.preventDefault();
    if (!quickTitle.trim() || isSubmittingQuick) return;
    setIsSubmittingQuick(true);
    try {
      await createTask({ title: quickTitle.trim() });
      setQuickTitle('');
      hapticFeedback('success');
      onRefresh();
    } catch (err) {
      console.error('Failed to create quick task:', err);
    } finally {
      setIsSubmittingQuick(false);
    }
  };

  // Time remaining chip configuration
  const renderTimeChip = () => {
    const hours = Math.floor(hours_left_in_day);
    const mins = Math.round((hours_left_in_day % 1) * 60);
    const label = `${hours}ч ${mins}м до сброса`;

    if (urgency_level === 'critical_1h') {
      return (
        <span className="time-left-chip chip-danger" title="Критическое время до сброса дня">
          <AlertTriangle size={12} />
          {label}
        </span>
      );
    }
    if (urgency_level.startsWith('warning')) {
      return (
        <span className="time-left-chip chip-warning">
          <Clock size={12} />
          {label}
        </span>
      );
    }
    return (
      <span className="time-left-chip">
        <Clock size={12} />
        {label}
      </span>
    );
  };

  return (
    <div className="today-tab-container">
      {/* Day Progress & Time remaining card */}
      <div className="day-status-card">
        <div className="day-progress-bar-wrap">
          <div className="day-progress-label">
            <span>
              {completed_count} из {total_count} выполнено ({progressPct}%)
            </span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <div>{renderTimeChip()}</div>
      </div>

      {/* Inline Quick Add Task input */}
      <div style={{ margin: '0 16px 14px 16px' }}>
        <form onSubmit={handleQuickSubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="unified-textarea"
            placeholder="Быстрая задача на сегодня..."
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-surface)',
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
            type="submit"
            disabled={!quickTitle.trim() || isSubmittingQuick}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: quickTitle.trim() ? 'var(--text-primary)' : 'var(--text-tertiary)',
              padding: '0 12px',
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

      {/* Completely Empty State */}
      {isDayCompletelyEmpty && (
        <div className="empty-state-mascot-card">
          <Mascot state="sleep" size={96} interactive={true} />
          <div className="empty-mascot-title">На сегодня пусто</div>
          <div className="empty-mascot-desc">
            Запланируйте задачи через строку выше или нажмите «+» для умного голосового ввода.
          </div>
        </div>
      )}

      {/* SECTION 1: Overdue Tasks */}
      {overdue_tasks.length > 0 && (
        <section className="linear-section">
          <div
            className="linear-section-header"
            onClick={() => setIsOverdueOpen((prev) => !prev)}
          >
            <div className="linear-section-title">
              <AlertTriangle size={15} color="#fb7185" />
              <span>Просрочено</span>
              <span className="linear-count-badge badge-danger">
                {overdue_tasks.length}
              </span>
            </div>
            {isOverdueOpen ? <ChevronUp size={16} color="var(--text-tertiary)" /> : <ChevronDown size={16} color="var(--text-tertiary)" />}
          </div>

          {isOverdueOpen && (
            <div className="linear-list">
              {overdue_tasks.map((task) => (
                <div key={task.id} className={`linear-list-item ${task.is_completed ? 'completed' : ''}`}>
                  <button
                    className={`linear-checkbox ${task.is_completed ? 'checked' : ''}`}
                    onClick={() => handleToggleTask(task.id, task.is_completed)}
                    aria-label="Выполнить задачу"
                  >
                    {task.is_completed && <Check size={12} strokeWidth={3} />}
                  </button>

                  <div className="item-content-col">
                    <div className="item-title">{task.title}</div>
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
                  </div>

                  <div className="item-action-btns">
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
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION 2: Daily Routines / Habits */}
      {routine_tasks.length > 0 && (
        <section className="linear-section">
          <div
            className="linear-section-header"
            onClick={() => setIsRoutinesOpen((prev) => !prev)}
          >
            <div className="linear-section-title">
              <Flame size={15} color="#fb923c" />
              <span>Привычки & Рутины</span>
              <span className="linear-count-badge badge-streak">
                {routine_tasks.filter((r) => r.is_completed_today).length}/{routine_tasks.length}
              </span>
            </div>
            {isRoutinesOpen ? <ChevronUp size={16} color="var(--text-tertiary)" /> : <ChevronDown size={16} color="var(--text-tertiary)" />}
          </div>

          {isRoutinesOpen && (
            <div className="linear-list">
              {routine_tasks.map((routine) => (
                <div
                  key={routine.id}
                  className={`linear-list-item ${routine.is_completed_today ? 'completed' : ''}`}
                >
                  <button
                    className={`linear-checkbox habit-streak ${routine.is_completed_today ? 'checked' : ''}`}
                    onClick={() => handleToggleRoutine(routine.id, routine.is_completed_today)}
                    aria-label="Отметить привычку"
                  >
                    {routine.is_completed_today && <Check size={12} strokeWidth={3} />}
                  </button>

                  <div className="item-content-col">
                    <div className="item-title">{routine.title}</div>
                    <div className="item-meta-row">
                      {routine.current_streak > 0 && (
                        <span className="item-tag" style={{ color: '#fb923c' }}>
                          <Flame size={11} fill="#fb923c" />
                          {routine.current_streak} дн. подряд
                        </span>
                      )}
                      {routine.best_streak > routine.current_streak && (
                        <span className="item-tag">
                          <Trophy size={10} /> рекорд {routine.best_streak}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION 3: Today's Tasks */}
      {today_tasks.length > 0 && (
        <section className="linear-section">
          <div
            className="linear-section-header"
            onClick={() => setIsTodayOpen((prev) => !prev)}
          >
            <div className="linear-section-title">
              <span>Задачи</span>
              <span className="linear-count-badge">
                {today_tasks.filter((t) => t.is_completed).length}/{today_tasks.length}
              </span>
            </div>
            {isTodayOpen ? <ChevronUp size={16} color="var(--text-tertiary)" /> : <ChevronDown size={16} color="var(--text-tertiary)" />}
          </div>

          {isTodayOpen && (
            <div className="linear-list">
              {today_tasks.map((task) => (
                <div
                  key={task.id}
                  className={`linear-list-item ${task.is_completed ? 'completed' : ''}`}
                >
                  <button
                    className={`linear-checkbox ${task.is_completed ? 'checked' : ''}`}
                    onClick={() => handleToggleTask(task.id, task.is_completed)}
                    aria-label="Выполнить задачу"
                  >
                    {task.is_completed && <Check size={12} strokeWidth={3} />}
                  </button>

                  <div className="item-content-col">
                    <div className="item-title">{task.title}</div>
                    <div className="item-meta-row">
                      {task.priority === 'high' && (
                        <span className="item-tag tag-priority-high">Высокий</span>
                      )}
                      {task.priority === 'medium' && (
                        <span className="item-tag tag-priority-med">Средний</span>
                      )}
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
                  </div>

                  <div className="item-action-btns">
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
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
