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
  setCachedDashboard,
  setCachedGoals,
  addPendingMutation,
  removePendingMutation,
} from '../api';
import Mascot from './Mascot';

export default function QuickAddModal({
  onClose,
  onTaskCreated,
  setDashboardData,
  setGoalsData,
}) {
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
  const [editingTargetVal, setEditingTargetVal] = useState('');
  const [editingUnit, setEditingUnit] = useState('');
  const [editingStep, setEditingStep] = useState('');

  // Quantitative / numeric state
  const [isNumeric, setIsNumeric] = useState(false);
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('');
  const [step, setStep] = useState('');

  // AI Providers state
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('auto');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const speechTranscriptRef = useRef('');
  const inputRef = useRef(null);

  const loadProviders = useCallback(async () => {
    try {
      const data = await fetchAIProviders();
      if (data && data.providers) {
        setProviders(data.providers);
        setSelectedProvider(data.active_provider || 'auto');
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
      if (res && res.tasks && res.tasks.length > 0) {
        setExtractedTasks(
          res.tasks.map((t, i) => ({
            ...t,
            id: `task_${Date.now()}_${i}`,
            selected: true,
          }))
        );
        setIsProcessing(false);
        return;
      }
    } catch (err) {
      console.warn('Backend audio parse failed, trying browser speech recognition fallback:', err);
    }

    // Fallback: If client speech recognition captured speech (e.g. on GitHub Pages)
    const clientText = speechTranscriptRef.current && speechTranscriptRef.current.trim();
    if (clientText) {
      try {
        const res = await parseSmartText(clientText, selectedProvider);
        if (res && res.tasks && res.tasks.length > 0) {
          setExtractedTasks(
            res.tasks.map((t, i) => ({
              ...t,
              id: `task_${Date.now()}_${i}`,
              selected: true,
            }))
          );
          setIsProcessing(false);
          return;
        }
      } catch (e) {
        console.error('Fallback speech text parse error:', e);
      }
    }

    setErrorMsg('Не удалось расшифровать аудио. Проверьте микрофон или введите задачу текстом.');
    setIsProcessing(false);
  };

  // Start voice recording
  const startRecording = async () => {
    try {
      setErrorMsg('');
      hapticFeedback('medium');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      speechTranscriptRef.current = '';
      const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.lang = 'ru-RU';
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (event) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; ++i) {
              transcript += event.results[i][0].transcript + ' ';
            }
            speechTranscriptRef.current = transcript.trim();
          };
          rec.start();
          speechRecognitionRef.current = rec;
        } catch (e) {
          console.warn('SpeechRecognition failed to start:', e);
        }
      }

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
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (_) {}
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Cancel voice recording without submitting
  const cancelRecording = () => {
    hapticFeedback('warning');
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (_) {}
    }
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
  const handleDirectCreate = (e) => {
    if (e) e.preventDefault();
    const title = inputText.trim();
    if (!title) return;

    const tempId = `temp_${Date.now()}`;
    const selectedDate = getSelectedDate();
    const prioInt = priority === 'high' ? 1 : 0;
    const mutationId = `create_${category}_${tempId}`;

    const parsedTarget = isNumeric && targetValue ? parseFloat(targetValue.replace(',', '.')) : null;
    const parsedStep = isNumeric && step ? parseFloat(step.replace(',', '.')) : 1.0;
    const cleanUnit = isNumeric && unit.trim() ? unit.trim() : null;

    hapticFeedback('success');
    onClose();

    if (category === 'routine') {
      if (setDashboardData) {
        setDashboardData((prev) => {
          if (!prev) return prev;
          const optRoutine = {
            id: tempId,
            title,
            target_value: parsedTarget,
            current_value: 0.0,
            step: parsedStep,
            unit: cleanUnit,
            is_completed_today: false,
            current_streak: 0,
            best_streak: 0,
            is_optimistic: true,
          };
          const updated = {
            ...prev,
            routine_tasks: [...(prev.routine_tasks || []), optRoutine],
            total_count: (prev.total_count || 0) + 1,
          };
          setCachedDashboard(updated);
          return updated;
        });
      }

      addPendingMutation({ id: mutationId, type: 'create_routine', tempId, title, timestamp: Date.now() });

      createRoutine({
        title,
        target_value: parsedTarget,
        step: parsedStep,
        unit: cleanUnit,
      })
        .then((realRoutine) => {
          removePendingMutation(mutationId);
          if (setDashboardData && realRoutine) {
            setDashboardData((prev) => {
              if (!prev) return prev;
              const updated = {
                ...prev,
                routine_tasks: (prev.routine_tasks || []).map((r) =>
                  r.id === tempId ? { ...realRoutine, is_optimistic: false } : r
                ),
              };
              setCachedDashboard(updated);
              return updated;
            });
          }
        })
        .catch((err) => {
          console.error('Failed to create routine on server:', err);
          removePendingMutation(mutationId);
        });
    } else if (category === 'goal') {
      if (setGoalsData) {
        setGoalsData((prev) => {
          const optGoal = {
            id: tempId,
            title,
            target_date: selectedDate,
            progress: 0,
            subtasks: [],
            is_optimistic: true,
          };
          const updated = [optGoal, ...(prev || [])];
          setCachedGoals(updated);
          return updated;
        });
      }

      addPendingMutation({ id: mutationId, type: 'create_goal', tempId, title, timestamp: Date.now() });

      createGoal({ title, target_date: selectedDate })
        .then((realGoal) => {
          removePendingMutation(mutationId);
          if (setGoalsData && realGoal) {
            setGoalsData((prev) => {
              const updated = (prev || []).map((g) =>
                g.id === tempId ? { ...realGoal, is_optimistic: false } : g
              );
              setCachedGoals(updated);
              return updated;
            });
          }
        })
        .catch((err) => {
          console.error('Failed to create goal on server:', err);
          removePendingMutation(mutationId);
        });
    } else {
      if (setDashboardData) {
        setDashboardData((prev) => {
          if (!prev) return prev;
          const optTask = {
            id: tempId,
            title,
            category: 'one_time',
            priority: prioInt,
            is_completed: false,
            target_value: parsedTarget,
            current_value: 0.0,
            step: parsedStep,
            unit: cleanUnit,
            scheduled_date: selectedDate,
            created_at: new Date().toISOString(),
            is_optimistic: true,
          };
          const updated = {
            ...prev,
            today_tasks: [optTask, ...(prev.today_tasks || [])],
            total_count: (prev.total_count || 0) + 1,
          };
          setCachedDashboard(updated);
          return updated;
        });
      }

      addPendingMutation({ id: mutationId, type: 'create_task', tempId, title, timestamp: Date.now() });

      createTask({
        title,
        scheduled_date: selectedDate,
        priority: prioInt,
        target_value: parsedTarget,
        step: parsedStep,
        unit: cleanUnit,
      })
        .then((realTask) => {
          removePendingMutation(mutationId);
          if (setDashboardData && realTask) {
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
          console.error('Failed to create task on server:', err);
          removePendingMutation(mutationId);
        });
    }
  };

  // Inline editing handlers for recognized tasks
  const handleStartEdit = (task) => {
    hapticFeedback('selection');
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
    setEditingTargetVal(task.target_value ? String(task.target_value) : '');
    setEditingUnit(task.unit || '');
    setEditingStep(task.step ? String(task.step) : '');
  };

  const handleSaveTaskEdit = (taskId) => {
    hapticFeedback('light');
    if (editingTitle.trim()) {
      const parsedTarget = editingTargetVal ? parseFloat(editingTargetVal.replace(',', '.')) : null;
      const parsedStep = editingStep ? parseFloat(editingStep.replace(',', '.')) : 1.0;
      const cleanUnit = editingUnit.trim() || null;

      setExtractedTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                title: editingTitle.trim(),
                target_value: parsedTarget && parsedTarget > 0 ? parsedTarget : null,
                unit: cleanUnit,
                step: parsedStep && parsedStep > 0 ? parsedStep : 1.0,
              }
            : t
        )
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
  const handleSaveExtracted = () => {
    const selected = (extractedTasks || []).filter((t) => t.selected);
    if (selected.length === 0) {
      setErrorMsg('Выберите хотя бы одну задачу.');
      return;
    }

    // Instantly close modal and give feedback
    hapticFeedback('success');
    onClose();

    const todayStr = new Date().toISOString().split('T')[0];

    // Optimistically insert items into React state and local storage cache
    selected.forEach((t, i) => {
      const cleanTitle = (t.title || '').trim();
      if (!cleanTitle) return;

      const tempId = `temp_ai_${Date.now()}_${i}`;
      const mutationId = `create_ai_${tempId}`;

      if (t.category === 'routine') {
        if (setDashboardData) {
          setDashboardData((prev) => {
            if (!prev) return prev;
            const optRoutine = {
              id: tempId,
              title: cleanTitle,
              target_value: t.target_value || null,
              current_value: 0.0,
              step: t.step || 1.0,
              unit: t.unit || null,
              is_completed_today: false,
              current_streak: 0,
              best_streak: 0,
              is_optimistic: true,
            };
            const updated = {
              ...prev,
              routine_tasks: [...(prev.routine_tasks || []), optRoutine],
              total_count: (prev.total_count || 0) + 1,
            };
            setCachedDashboard(updated);
            return updated;
          });
        }
        addPendingMutation({ id: mutationId, type: 'create_routine', tempId, title: cleanTitle, timestamp: Date.now() });
        createRoutine({
          title: cleanTitle,
          description: t.description || null,
          target_value: t.target_value || null,
          step: t.step || 1.0,
          unit: t.unit || null,
        })
          .then((real) => {
            removePendingMutation(mutationId);
            if (setDashboardData && real) {
              setDashboardData((prev) => {
                if (!prev) return prev;
                const updated = {
                  ...prev,
                  routine_tasks: (prev.routine_tasks || []).map((r) =>
                    r.id === tempId ? { ...real, is_optimistic: false } : r
                  ),
                };
                setCachedDashboard(updated);
                return updated;
              });
            }
          })
          .catch(() => removePendingMutation(mutationId));
      } else if (t.category === 'goal') {
        if (setGoalsData) {
          setGoalsData((prev) => {
            const optGoal = {
              id: tempId,
              title: cleanTitle,
              description: t.description || null,
              target_date: t.target_date || null,
              progress: 0,
              subtasks: [],
              is_optimistic: true,
            };
            const updated = [optGoal, ...(prev || [])];
            setCachedGoals(updated);
            return updated;
          });
        }
        addPendingMutation({ id: mutationId, type: 'create_goal', tempId, title: cleanTitle, timestamp: Date.now() });
        createGoal({ title: cleanTitle, description: t.description || null, target_date: t.target_date || null })
          .then((real) => {
            removePendingMutation(mutationId);
            if (setGoalsData && real) {
              setGoalsData((prev) => {
                const updated = (prev || []).map((g) =>
                  g.id === tempId ? { ...real, is_optimistic: false } : g
                );
                setCachedGoals(updated);
                return updated;
              });
            }
          })
          .catch(() => removePendingMutation(mutationId));
      } else {
        const prioInt = t.priority === 'high' || t.priority === 1 || t.priority === '1' ? 1 : 0;
        const sched = t.scheduled_date || todayStr;
        if (setDashboardData) {
          setDashboardData((prev) => {
            if (!prev) return prev;
            const optTask = {
              id: tempId,
              title: cleanTitle,
              category: 'one_time',
              priority: prioInt,
              is_completed: false,
              target_value: t.target_value || null,
              current_value: 0.0,
              step: t.step || 1.0,
              unit: t.unit || null,
              scheduled_date: sched,
              created_at: new Date().toISOString(),
              is_optimistic: true,
            };
            const updated = {
              ...prev,
              today_tasks: [optTask, ...(prev.today_tasks || [])],
              total_count: (prev.total_count || 0) + 1,
            };
            setCachedDashboard(updated);
            return updated;
          });
        }
        addPendingMutation({ id: mutationId, type: 'create_task', tempId, title: cleanTitle, timestamp: Date.now() });
        createTask({
          title: cleanTitle,
          scheduled_date: sched,
          priority: prioInt,
          target_value: t.target_value || null,
          step: t.step || 1.0,
          unit: t.unit || null,
        })
          .then((real) => {
            removePendingMutation(mutationId);
            if (setDashboardData && real) {
              setDashboardData((prev) => {
                if (!prev) return prev;
                const updated = {
                  ...prev,
                  today_tasks: (prev.today_tasks || []).map((tk) =>
                    tk.id === tempId ? { ...real, is_optimistic: false } : tk
                  ),
                };
                setCachedDashboard(updated);
                return updated;
              });
            }
          })
          .catch(() => removePendingMutation(mutationId));
      }
    });
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

                        {task.category !== 'goal' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Цель:</span>
                            <input
                              type="number"
                              step="any"
                              className="quickadd-num-input"
                              placeholder="Кол-во"
                              value={editingTargetVal}
                              onChange={(e) => setEditingTargetVal(e.target.value)}
                            />
                            <input
                              type="text"
                              className="quickadd-num-input"
                              style={{ width: '60px' }}
                              placeholder="Ед."
                              value={editingUnit}
                              onChange={(e) => setEditingUnit(e.target.value)}
                            />
                            <input
                              type="number"
                              step="any"
                              className="quickadd-num-input"
                              placeholder="Шаг"
                              value={editingStep}
                              onChange={(e) => setEditingStep(e.target.value)}
                            />
                          </div>
                        )}
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
                            {task.target_value && (
                              <span className="item-tag tag-due">
                                🎯 {task.target_value} {task.unit || ''} (шаг {task.step || 1})
                              </span>
                            )}
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

              {/* Quantitative target options for one_time and routine */}
              {category !== 'goal' && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '5px' }}>
                    КОЛИЧЕСТВЕННАЯ ЦЕЛЬ
                  </div>
                  <div className="chips-row">
                    <button
                      type="button"
                      className={`filter-chip ${isNumeric ? 'active' : ''}`}
                      onClick={() => {
                        hapticFeedback('selection');
                        setIsNumeric((prev) => !prev);
                      }}
                    >
                      🎯 {isNumeric ? 'Количественная цель: Вкл' : '+ Задать количество'}
                    </button>
                  </div>

                  {isNumeric && (
                    <div className="quickadd-numeric-options">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Цель</span>
                        <input
                          type="number"
                          step="any"
                          className="quickadd-num-input"
                          placeholder="2"
                          value={targetValue}
                          onChange={(e) => setTargetValue(e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Единица</span>
                        <input
                          type="text"
                          className="quickadd-num-input"
                          style={{ width: '60px' }}
                          placeholder="л / шт"
                          value={unit}
                          onChange={(e) => setUnit(e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Шаг +/-</span>
                        <input
                          type="number"
                          step="any"
                          className="quickadd-num-input"
                          placeholder="0.25"
                          value={step}
                          onChange={(e) => setStep(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
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
