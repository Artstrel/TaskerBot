import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Mic,
  Square,
  Sparkles,
  Send,
  Check,
  Calendar,
  Flame,
  Target,
  Clock,
  AlertCircle,
  Trash2,
  Pencil,
} from 'lucide-react';
import {
  fetchAIProviders,
  parseSmartAudio,
  parseSmartText,
  createRoutine,
  createTask,
  createGoal,
  hapticFeedback,
} from '../api';
import Mascot from './Mascot';

export default function QuickAddModal({ onClose, onTaskCreated }) {
  const [inputText, setInputText] = useState('');
  const [category, setCategory] = useState('one_time'); // 'one_time' | 'routine' | 'goal'
  const [dueDateOption, setDueDateOption] = useState('today'); // 'today' | 'tomorrow' | 'none'
  const [priority, setPriority] = useState('medium'); // 'medium' | 'high'

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Extracted tasks preview & editing
  const [extractedTasks, setExtractedTasks] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  // AI Providers state
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('groq');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const inputRef = useRef(null);

  const loadProviders = useCallback(async () => {
    try {
      const data = await fetchAIProviders();
      if (data && data.providers) {
        setProviders(data.providers);
        setSelectedProvider(data.active_provider || 'groq');
      }
    } catch (e) {
      console.warn('Could not load AI providers:', e);
    }
  }, []);

  useEffect(() => {
    loadProviders();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [loadProviders]);

  // Dedicated timer effect that starts/stops with isRecording
  useEffect(() => {
    let interval = null;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // Keydown & cleanup effect
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editingTaskId) {
          setEditingTaskId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch (_) {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [editingTaskId, onClose]);

  // Compute scheduled_date based on chip
  const getSelectedDate = () => {
    if (dueDateOption === 'none') return null;
    const d = new Date();
    if (dueDateOption === 'tomorrow') {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
  };

  // Process audio with backend AI
  const handleAudioProcess = async (audioBlob) => {
    setIsProcessing(true);
    setErrorMsg('');
    try {
      const res = await parseSmartAudio(audioBlob, selectedProvider);
      if (res.tasks && res.tasks.length > 0) {
        setExtractedTasks(
          res.tasks.map((t, i) => ({
            ...t,
            id: `task_${Date.now()}_${i}`,
            selected: true,
          }))
        );
      } else {
        setErrorMsg('Не удалось распознать задачи в аудио. Попробуйте еще раз или напишите текстом.');
      }
    } catch (err) {
      console.error('Failed to parse audio:', err);
      setErrorMsg('Ошибка связи с сервером при обработке аудио.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Start voice recording
  const startRecording = async () => {
    try {
      setErrorMsg('');
      hapticFeedback('medium');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await handleAudioProcess(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Audio recording failed:', err);
      setErrorMsg('Нет доступа к микрофону. Разрешите микрофон в браузере.');
    }
  };

  // Stop voice recording and submit
  const stopRecording = () => {
    hapticFeedback('medium');
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Cancel voice recording without submitting
  const cancelRecording = () => {
    hapticFeedback('warning');
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }
      };
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
      setIsRecording(false);
    }
  };

  // Submit via Smart AI parse
  const handleSmartAiParse = async () => {
    if (!inputText.trim()) return;
    setIsProcessing(true);
    setErrorMsg('');
    try {
      const res = await parseSmartText(inputText.trim(), selectedProvider);
      if (res.tasks && res.tasks.length > 0) {
        setExtractedTasks(
          res.tasks.map((t, i) => ({
            ...t,
            id: `task_${Date.now()}_${i}`,
            selected: true,
          }))
        );
      } else {
        setErrorMsg('Не удалось распознать структуру задачи. Добавьте напрямую через «Создать».');
      }
    } catch (err) {
      console.error('Failed to parse text with AI:', err);
      setErrorMsg('Ошибка AI-парсинга.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Direct Create (Zero AI latency)
  const handleDirectCreate = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isProcessing) return;

    setIsProcessing(true);
    setErrorMsg('');
    try {
      if (category === 'routine') {
        await createRoutine({
          title: inputText.trim(),
        });
      } else if (category === 'goal') {
        await createGoal({
          title: inputText.trim(),
          target_date: getSelectedDate(),
        });
      } else {
        await createTask({
          title: inputText.trim(),
          scheduled_date: getSelectedDate(),
          priority: priority === 'high' ? 1 : 0,
        });
      }
      hapticFeedback('success');
      onTaskCreated();
      onClose();
    } catch (err) {
      console.error('Failed to create task directly:', err);
      setErrorMsg('Не удалось сохранить задачу.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Inline editing handlers for recognized tasks
  const handleStartEdit = (task) => {
    hapticFeedback('selection');
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
  };

  const handleSaveTaskEdit = (taskId) => {
    hapticFeedback('light');
    if (editingTitle.trim()) {
      setExtractedTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, title: editingTitle.trim() } : t))
      );
    }
    setEditingTaskId(null);
  };

  const handleUpdateTaskCategory = (taskId, newCategory) => {
    hapticFeedback('selection');
    setExtractedTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, category: newCategory } : t))
    );
  };

  // Review Screen: Save selected extracted tasks
  const handleSaveExtracted = async () => {
    const selected = (extractedTasks || []).filter((t) => t.selected);
    if (selected.length === 0) {
      setErrorMsg('Выберите хотя бы одну задачу.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');
    try {
      for (const t of selected) {
        const cleanTitle = (t.title || '').trim();
        if (!cleanTitle) continue;

        if (t.category === 'routine') {
          await createRoutine({
            title: cleanTitle,
            description: t.description || null,
          });
        } else if (t.category === 'goal') {
          await createGoal({
            title: cleanTitle,
            description: t.description || null,
            target_date: t.target_date || null,
          });
        } else {
          // Normalize priority to int 0 or 1
          const prioInt =
            t.priority === 'high' || t.priority === 1 || t.priority === '1' ? 1 : 0;
          await createTask({
            title: cleanTitle,
            scheduled_date: t.scheduled_date || null,
            priority: prioInt,
          });
        }
      }
      hapticFeedback('success');
      onTaskCreated();
      onClose();
    } catch (err) {
      console.error('Failed to save extracted tasks:', err);
      setErrorMsg('Ошибка сохранения распознанных задач.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTimer = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing && !isRecording) {
          onClose();
        }
      }}
    >
      <div className="bottom-sheet-content">
        <div className="sheet-handle-bar" />

        <div className="sheet-header-row">
          <div className="sheet-title">
            {isRecording ? (
              <Mascot state="happy" size={26} interactive={false} />
            ) : isProcessing ? (
              <Mascot state="thinking" size={26} interactive={false} />
            ) : (
              <Sparkles size={18} color="var(--accent-primary)" />
            )}
            <span>
              {isRecording
                ? 'Запись голоса...'
                : extractedTasks
                ? 'Подтверждение задач'
                : 'Создать задачу'}
            </span>
          </div>

          <button
            className="sheet-close-btn"
            onClick={isRecording ? cancelRecording : onClose}
            title="Закрыть"
            disabled={isProcessing}
          >
            <X size={18} />
          </button>
        </div>

        <div className="sheet-body">
          {errorMsg && (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: '#ffffff',
                padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* VIEW A: Extracted tasks preview review list with editing */}
          {extractedTasks ? (
            <div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                AI распознал следующие задачи. Нажмите на текст или карандаш, чтобы отредактировать:
              </p>

              <div className="linear-list" style={{ marginBottom: '16px' }}>
                {extractedTasks.map((task) => (
                  <div key={task.id} className="linear-list-item" style={{ alignItems: 'flex-start' }}>
                    <button
                      className={`linear-checkbox ${task.selected ? 'checked' : ''}`}
                      onClick={() => {
                        setExtractedTasks((prev) =>
                          prev.map((t) => (t.id === task.id ? { ...t, selected: !t.selected } : t))
                        );
                      }}
                      style={{ marginTop: '3px' }}
                    >
                      {task.selected && <Check size={12} strokeWidth={3} />}
                    </button>

                    {editingTaskId === task.id ? (
                      /* Inline task editing box */
                      <div className="task-inline-edit-box">
                        <input
                          type="text"
                          className="task-inline-input"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTaskEdit(task.id);
                            if (e.key === 'Escape') setEditingTaskId(null);
                          }}
                          placeholder="Название задачи..."
                          autoFocus
                        />
                        <div className="task-inline-toolbar">
                          <div className="task-inline-chips">
                            <button
                              type="button"
                              className={`mini-cat-chip ${task.category === 'one_time' ? 'active' : ''}`}
                              onClick={() => handleUpdateTaskCategory(task.id, 'one_time')}
                            >
                              <Calendar size={10} /> Задача
                            </button>
                            <button
                              type="button"
                              className={`mini-cat-chip ${task.category === 'routine' ? 'active' : ''}`}
                              onClick={() => handleUpdateTaskCategory(task.id, 'routine')}
                            >
                              <Flame size={10} /> Привычка
                            </button>
                            <button
                              type="button"
                              className={`mini-cat-chip ${task.category === 'goal' ? 'active' : ''}`}
                              onClick={() => handleUpdateTaskCategory(task.id, 'goal')}
                            >
                              <Target size={10} /> Цель
                            </button>
                          </div>

                          <div style={{ display: 'flex', gap: '4px' }}>
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
                              onClick={() => handleSaveTaskEdit(task.id)}
                            >
                              <Check size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Normal task item view with clickable title */
                      <>
                        <div className="item-content-col">
                          <div
                            className="item-title editable-title"
                            onClick={() => handleStartEdit(task)}
                            title="Нажмите, чтобы отредактировать"
                          >
                            {task.title}
                          </div>
                          <div className="item-meta-row">
                            <span className="item-tag">
                              {task.category === 'routine' ? (
                                <><Flame size={10} /> Привычка</>
                              ) : task.category === 'goal' ? (
                                <><Target size={10} /> Цель</>
                              ) : (
                                <><Calendar size={10} /> Задача</>
                              )}
                            </span>
                            {task.scheduled_date && (
                              <span className="item-tag">
                                <Clock size={10} /> {task.scheduled_date}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="item-action-btns" style={{ opacity: 1 }}>
                          <button
                            type="button"
                            className="item-mini-btn"
                            onClick={() => handleStartEdit(task)}
                            title="Редактировать"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            className="item-mini-btn btn-danger"
                            onClick={() => {
                              setExtractedTasks((prev) => {
                                const next = prev.filter((t) => t.id !== task.id);
                                return next.length > 0 ? next : null;
                              });
                            }}
                            title="Удалить"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="filter-chip"
                  onClick={() => setExtractedTasks(null)}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Назад к вводу
                </button>
                <button
                  type="button"
                  className="submit-task-btn"
                  onClick={handleSaveExtracted}
                  disabled={isProcessing}
                  style={{ flex: 2, justifyContent: 'center' }}
                >
                  {isProcessing ? 'Сохранение...' : 'Сохранить выбранные'}
                </button>
              </div>
            </div>
          ) : isRecording ? (
            /* VIEW B1: Dedicated compact live voice recording state */
            <div className="voice-recording-card">
              <div className="voice-recording-main">
                <div className="voice-status-group">
                  <span className="voice-record-dot" />
                  <span className="voice-timer-display">{formatTimer(recordSeconds)}</span>
                </div>

                <div className="voice-wave-container" title="Идёт запись звука">
                  <span className="wave-bar wb-1" />
                  <span className="wave-bar wb-2" />
                  <span className="wave-bar wb-3" />
                  <span className="wave-bar wb-4" />
                </div>

                <span className="voice-hint-text">Слушаю...</span>
              </div>

              <div className="voice-card-actions">
                <button
                  type="button"
                  className="filter-chip"
                  onClick={cancelRecording}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="submit-task-btn"
                  onClick={stopRecording}
                >
                  <Square size={12} fill="#000000" />
                  <span>Готово ({formatTimer(recordSeconds)})</span>
                </button>
              </div>
            </div>
          ) : (
            /* VIEW B2: Unified input box & smart options */
            <div>
              <div className="unified-input-box">
                <textarea
                  ref={inputRef}
                  className="unified-textarea"
                  placeholder="Напишите задачу или нажмите на микрофон для записи..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={isProcessing}
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleDirectCreate();
                    }
                  }}
                />

                <div className="input-actions-bar">
                  <button
                    type="button"
                    className="voice-recording-btn"
                    onClick={startRecording}
                    disabled={isProcessing}
                  >
                    <Mic size={14} />
                    <span>Голос</span>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Optional Smart AI parse button */}
                    {inputText.trim().length > 12 && (
                      <button
                        type="button"
                        className="filter-chip"
                        onClick={handleSmartAiParse}
                        disabled={isProcessing}
                        title="Распознать несколько задач и дат через AI"
                        style={{ height: '32px' }}
                      >
                        <Sparkles size={13} color="var(--accent-primary)" />
                        <span>AI парсинг</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="submit-task-btn"
                      onClick={handleDirectCreate}
                      disabled={!inputText.trim() || isProcessing}
                    >
                      <Send size={13} />
                      <span>{isProcessing ? 'Сохраняю...' : 'Создать'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Chips: Category */}
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '5px' }}>
                  ТИП
                </div>
                <div className="chips-row">
                  <button
                    type="button"
                    className={`filter-chip ${category === 'one_time' ? 'active' : ''}`}
                    onClick={() => {
                      hapticFeedback('selection');
                      setCategory('one_time');
                    }}
                  >
                    <Calendar size={12} /> Задача
                  </button>
                  <button
                    type="button"
                    className={`filter-chip ${category === 'routine' ? 'active' : ''}`}
                    onClick={() => {
                      hapticFeedback('selection');
                      setCategory('routine');
                    }}
                  >
                    <Flame size={12} /> Привычка
                  </button>
                  <button
                    type="button"
                    className={`filter-chip ${category === 'goal' ? 'active' : ''}`}
                    onClick={() => {
                      hapticFeedback('selection');
                      setCategory('goal');
                    }}
                  >
                    <Target size={12} /> Проект / Цель
                  </button>
                </div>
              </div>

              {/* Chips: Due Date & Priority (for one_time tasks) */}
              {category === 'one_time' && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '5px' }}>
                    СРОК И ПРИОРИТЕТ
                  </div>
                  <div className="chips-row">
                    <button
                      type="button"
                      className={`filter-chip ${dueDateOption === 'today' ? 'active' : ''}`}
                      onClick={() => {
                        hapticFeedback('selection');
                        setDueDateOption('today');
                      }}
                    >
                      Сегодня
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${dueDateOption === 'tomorrow' ? 'active' : ''}`}
                      onClick={() => {
                        hapticFeedback('selection');
                        setDueDateOption('tomorrow');
                      }}
                    >
                      Завтра
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${dueDateOption === 'none' ? 'active' : ''}`}
                      onClick={() => {
                        hapticFeedback('selection');
                        setDueDateOption('none');
                      }}
                    >
                      Без срока
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${priority === 'high' ? 'active' : ''}`}
                      onClick={() => {
                        hapticFeedback('selection');
                        setPriority((prev) => (prev === 'high' ? 'medium' : 'high'));
                      }}
                      style={{ marginLeft: 'auto' }}
                    >
                      {priority === 'high' ? '🔥 Высокий' : 'Обычный'}
                    </button>
                  </div>
                </div>
              )}

              {/* AI Provider selector */}
              {providers.length > 1 && (
                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    AI провайдер:
                  </span>
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      padding: '3px 8px',
                      outline: 'none',
                    }}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
