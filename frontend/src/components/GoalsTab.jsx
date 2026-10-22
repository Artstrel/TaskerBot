import React, { useState } from 'react';
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Check,
  Trash2,
  Clock,
} from 'lucide-react';
import {
  createGoal,
  deleteGoal,
  addGoalSubtask,
  toggleTask,
  postponeTask,
  hapticFeedback,
} from '../api';
import Mascot from './Mascot';

export default function GoalsTab({ goalsData = [], onRefresh }) {
  const [expandedGoalId, setExpandedGoalId] = useState(null);
  const [isCreatingGoal, setIsCreatingGoal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDesc, setNewGoalDesc] = useState('');
  const [newGoalDate, setNewGoalDate] = useState('');
  const [newSubtaskTitles, setNewSubtaskTitles] = useState({});

  const toggleExpand = (id) => {
    hapticFeedback('selection');
    setExpandedGoalId((prev) => (prev === id ? null : id));
  };

  const handleCreateGoal = async (e) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;
    await createGoal({
      title: newGoalTitle.trim(),
      description: newGoalDesc.trim() || null,
      target_date: newGoalDate || null,
    });
    setNewGoalTitle('');
    setNewGoalDesc('');
    setNewGoalDate('');
    setIsCreatingGoal(false);
    onRefresh();
  };

  const handleAddSubtask = async (goalId) => {
    const title = newSubtaskTitles[goalId];
    if (!title || !title.trim()) return;
    await addGoalSubtask(goalId, title.trim());
    setNewSubtaskTitles((prev) => ({ ...prev, [goalId]: '' }));
    onRefresh();
  };

  const handleScheduleForToday = async (subtaskId) => {
    const today = new Date().toISOString().split('T')[0];
    await postponeTask(subtaskId, today);
    onRefresh();
  };

  const handleDeleteGoal = async (goalId) => {
    if (window.confirm('Удалить эту цель со всеми подзадачами?')) {
      await deleteGoal(goalId);
      onRefresh();
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
          className="submit-task-btn"
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          <Plus size={14} />
          <span>Новая цель</span>
        </button>
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
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Шаги ({goal.completed_subtasks} из {goal.total_subtasks})
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
                                onClick={async () => {
                                  await toggleTask(st.id);
                                  onRefresh();
                                }}
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
                                  onClick={() => handleScheduleForToday(st.id)}
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
