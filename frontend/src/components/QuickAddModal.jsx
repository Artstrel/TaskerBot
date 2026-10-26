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
  ShoppingCart,
  RotateCw,
  Milestone,
  Hash,
} from 'lucide-react';
import {
  fetchAIProviders,
  parseSmartAudio,
  parseSmartText,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  createTask,
  updateTask,
  deleteTask,
  createGoal,
  createGroceryItem,
  hapticFeedback,
  setCachedDashboard,
  setCachedGoals,
  setCachedGroceries,
  addPendingMutation,
  removePendingMutation,
  capitalizeFirst,
  isGroceryText,
  cleanGroceryTitle,
  stripWhisperHallucinations,
  isHallucinationOrNoise,
} from '../api';
import Mascot from './Mascot';
import BarVisualizer from './BarVisualizer';

export default function QuickAddModal({
  onClose,
  onTaskCreated,
  setDashboardData,
  setGoalsData,
  setGroceriesData,
  goalsData = [],
  groceriesData = null,
  initialCategory,
  initialGoalId,
  initialGoalTitle,
  initialText,
  autoStartVoice = false,
  editingItem = null,
  editingType = null,
}) {
  const isEditMode = Boolean(editingItem);

  const initialCat = editingItem
    ? (editingType === 'routine' || editingItem.frequency_type ? 'routine' : (editingItem.goal_id ? 'subtask' : 'one_time'))
    : (initialCategory || (initialGoalId ? 'subtask' : 'one_time'));

  const [inputText, setInputText] = useState(
    editingItem ? (editingItem.title || '') : (initialText || '')
  );
  const [category, setCategory] = useState(initialCat);
  const [selectedGoalId, setSelectedGoalId] = useState(
    editingItem ? (editingItem.goal_id || null) : (initialGoalId || null)
  );
  const [selectedGoalTitle, setSelectedGoalTitle] = useState(
    editingItem ? (editingItem.goal_title || (editingItem.goal ? editingItem.goal.title : '')) : (initialGoalTitle || '')
  );

  // Compute initial due date option for tasks
  const computeInitialDueDateOption = () => {
    if (!editingItem) return 'today';
    if (!editingItem.scheduled_date) return 'none';
    const todayStr = new Date().toISOString().split('T')[0];
    const tomDate = new Date();
    tomDate.setDate(tomDate.getDate() + 1);
    const tomorrowStr = tomDate.toISOString().split('T')[0];
    if (editingItem.scheduled_date === todayStr) return 'today';
    if (editingItem.scheduled_date === tomorrowStr) return 'tomorrow';
    return 'custom';
  };

  const [dueDateOption, setDueDateOption] = useState(computeInitialDueDateOption);
  const [customDueDate, setCustomDueDate] = useState(
    editingItem && editingItem.scheduled_date ? editingItem.scheduled_date : ''
  );

  // Frequency and routine state
  const computeDaysOfWeek = () => {
    if (!editingItem || !editingItem.days_of_week) return [0, 2, 4];
    if (Array.isArray(editingItem.days_of_week)) return editingItem.days_of_week;
    if (typeof editingItem.days_of_week === 'string') {
      return editingItem.days_of_week.split(',').map((d) => parseInt(d.trim(), 10)).filter((n) => !isNaN(n));
    }
    return [0, 2, 4];
  };

  const [frequencyType, setFrequencyType] = useState(
    editingItem ? (editingItem.frequency_type || 'daily') : 'daily'
  );
  const [intervalDays, setIntervalDays] = useState(
    editingItem ? (editingItem.interval_days || 3) : 3
  );
  const [daysOfWeek, setDaysOfWeek] = useState(computeDaysOfWeek);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStream, setActiveStream] = useState(null);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Extracted tasks preview & editing
  const [extractedTasks, setExtractedTasks] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingTargetVal, setEditingTargetVal] = useState('');
  const [editingUnit, setEditingUnit] = useState('');
  const [editingStep, setEditingStep] = useState('');

  // Quantitative / numeric state
  const [isNumeric, setIsNumeric] = useState(
    Boolean(editingItem && editingItem.target_value && editingItem.target_value > 0)
  );
  const [targetValue, setTargetValue] = useState(
    editingItem && editingItem.target_value != null ? String(editingItem.target_value) : ''
  );
  const [unit, setUnit] = useState(
    editingItem && editingItem.unit ? editingItem.unit : ''
  );
  const [step, setStep] = useState(
    editingItem && editingItem.step != null ? String(editingItem.step) : ''
  );

  // AI Providers state
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('auto');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const speechTranscriptRef = useRef('');
  const inputRef = useRef(null);
  const stopRecordingRef = useRef(null);
  const hasAutoStartedRef = useRef(false);

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
    if (inputRef.current && !autoStartVoice) {
      inputRef.current.focus();
    }
  }, [loadProviders, autoStartVoice]);

  // Dedicated timer effect that starts/stops with isRecording and enforces 120s limit for long dictation
  useEffect(() => {
    let interval = null;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev >= 119) {
            if (stopRecordingRef.current) stopRecordingRef.current();
            return 120;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      setRecordSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // Dedicated cleanup ONLY on unmount of QuickAddModal
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.onstop = null;
          if (mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        } catch (_) {}
      }
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((track) => track.stop());
        } catch (_) {}
      }
    };
  }, []);

  // Escape keydown listener
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
    };
  }, [editingTaskId, onClose]);

  // Compute scheduled_date based on chip
  const getSelectedDate = () => {
    if (dueDateOption === 'none') return null;
    if (dueDateOption === 'custom') {
      return customDueDate || new Date().toISOString().split('T')[0];
    }
    const d = new Date();
    if (dueDateOption === 'tomorrow') {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
  };

  // Map and attach goal associations to extracted AI tasks
  const mapExtractedTask = useCallback(
    (t, i) => {
      let rawTitle = stripWhisperHallucinations(t.title || '');
      let cat = t.category || 'one_time';
      let gId = t.goal_id || null;
      let gTitle = t.goal_title || null;
      let schedDate = t.scheduled_date;

      if (cat === 'grocery' || isGroceryText(rawTitle)) {
        cat = 'grocery';
        rawTitle = cleanGroceryTitle(rawTitle);
        schedDate = null;
      } else {
        rawTitle = capitalizeFirst(rawTitle);
      }

      if (initialGoalId && !gId && cat !== 'routine' && cat !== 'goal' && cat !== 'grocery') {
        gId = initialGoalId;
        gTitle = initialGoalTitle || gTitle;
        cat = 'subtask';
      } else if (gTitle && !gId) {
        const matched =
          (goalsData || []).find(
            (g) => g.title && g.title.toLowerCase() === gTitle.toLowerCase()
          ) ||
          (goalsData || []).find(
            (g) => g.title && g.title.toLowerCase().includes(gTitle.toLowerCase())
          );
        if (matched) {
          gId = matched.id;
          gTitle = matched.title;
        }
      }

      return {
        ...t,
        title: rawTitle,
        category: cat,
        scheduled_date: schedDate,
        goal_id: gId,
        goal_title: gTitle ? capitalizeFirst(gTitle) : null,
        id: `task_${Date.now()}_${i}`,
        selected: true,
      };
    },
    [initialGoalId, initialGoalTitle, goalsData]
  );

  const handleUpdateTaskGoal = (taskId, goalId, goalTitle) => {
    hapticFeedback('selection');
    setExtractedTasks((prev) =>
      (prev || []).map((t) => {
        if (t.id === taskId) {
          return {
            ...t,
            goal_id: goalId,
            goal_title: goalTitle,
            category:
              goalId || goalTitle
                ? 'subtask'
                : t.category === 'subtask'
                  ? 'one_time'
                  : t.category,
          };
        }
        return t;
      })
    );
  };

  // Helper to validate extracted task title
  const isValidTaskTitle = (title) => {
    if (!title || typeof title !== 'string') return false;
    const stripped = stripWhisperHallucinations(title);
    if (!stripped) return false;
    const clean = stripped.replace(/[^\p{L}\d]/gu, '').trim();
    if (clean.length < 2) return false;
    if (/^[\s\.\,\!\?\-—\:\;]+$/.test(stripped)) return false;
    if (isHallucinationOrNoise(stripped)) return false;
    return true;
  };

  // Process audio: Priority #1 Server/Whisper.cpp audio upload (with FFT noise filtering & VAD), Priority #2 Fallback to Web Speech API
  const handleAudioProcess = async (audioBlob) => {
    setIsProcessing(true);
    setIsTranscribingAudio(true);
    setErrorMsg('');

    try {
      if (isEditMode) {
        let textResult = '';
        if (audioBlob && audioBlob.size > 0) {
          try {
            const res = await parseSmartAudio(audioBlob, selectedProvider);
            if (res?.tasks && res.tasks.length > 0 && res.tasks[0]?.title) {
              textResult = res.tasks.map((t) => t.title).filter(Boolean).join(', ');
            }
          } catch (err) {
            console.warn('Backend audio parse failed in edit mode:', err);
          }
        }
        if (!textResult) {
          const clientText = speechTranscriptRef.current && speechTranscriptRef.current.trim();
          if (clientText) textResult = clientText;
        }

        if (textResult) {
          hapticFeedback('success');
          setInputText(capitalizeFirst(textResult.trim()));
          return;
        }

        hapticFeedback('warning');
        setErrorMsg('🎙 Не удалось распознать речь. Попробуйте надиктовать ближе к микрофону или введите текстом.');
        return;
      }

      // 1. Приоритет №1: Серверный whisper.cpp с аппаратным VAD и шумоподавлением FFmpeg (afftdn)
      if (audioBlob && audioBlob.size > 0) {
        try {
          const res = await parseSmartAudio(audioBlob, selectedProvider);
          const validTasks = (res?.tasks || []).filter((t) => t && isValidTaskTitle(t.title));
          if (validTasks.length > 0) {
            hapticFeedback('success');
            setExtractedTasks(validTasks.map(mapExtractedTask));
            return;
          }
        } catch (err) {
          console.warn('Backend whisper.cpp / Whisper audio parse failed:', err);
        }
      }

      // 2. Резервный Fallback: Системный диктант устройства (Web Speech API - iOS Siri / Android Google Speech)
      const clientText = speechTranscriptRef.current && speechTranscriptRef.current.trim();
      const cleanSpeech = clientText ? clientText.replace(/[^\p{L}\d]/gu, '').trim() : '';

      if (cleanSpeech.length >= 2) {
        try {
          const res = await parseSmartText(clientText, selectedProvider);
          const validTasks = (res?.tasks || []).filter((t) => t && isValidTaskTitle(t.title));
          if (validTasks.length > 0) {
            hapticFeedback('success');
            setExtractedTasks(validTasks.map(mapExtractedTask));
            return;
          }
        } catch (speechErr) {
          console.warn('Fallback parse of device speech failed:', speechErr);
        }
      }

      hapticFeedback('warning');
      setErrorMsg('🎙 Слишком много фонового шума. Попробуйте надиктовать ближе к микрофону или введите текстом.');
    } finally {
      setIsProcessing(false);
      setIsTranscribingAudio(false);
    }
  };

  // Safe MediaRecorder builder across iOS Safari, Android Chrome and Desktop
  const createSafeMediaRecorder = (stream) => {
    const candidateTypes = [
      'audio/mp4', // Best for iOS Safari / WKWebView
      'audio/webm;codecs=opus', // Best for Android Chrome & Desktop
      'audio/webm',
      'audio/aac',
      'audio/ogg;codecs=opus',
    ];
    for (const t of candidateTypes) {
      try {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
          const rec = new MediaRecorder(stream, { mimeType: t });
          return { recorder: rec, mimeType: rec.mimeType || t };
        }
      } catch (_) {}
    }
    // Browser default fallback if no explicit codec matches
    const rec = new MediaRecorder(stream);
    return { recorder: rec, mimeType: rec.mimeType || 'audio/webm' };
  };

  // Start voice recording
  const startRecording = async () => {
    if (isRecording || (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording')) {
      return;
    }
    try {
      setErrorMsg('');
      hapticFeedback('medium');

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        hapticFeedback('warning');
        setErrorMsg('🎙 Запись микрофона недоступна: требуется защищённое HTTPS-соединение.');
        return;
      }

      // Clean up previous stream if any
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((track) => track.stop());
        } catch (_) {}
        streamRef.current = null;
      }

      // Step 1: Request microphone with constraints fallback to prevent OverconstrainedError on iOS
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (constraintErr) {
        console.warn('Advanced audio constraints rejected, retrying with raw audio:', constraintErr);
        // Fallback without constraints (essential for older iOS WebKit versions)
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      streamRef.current = stream;
      setActiveStream(stream);
      audioChunksRef.current = [];

      // Step 2: Initialize MediaRecorder with safe format detection
      const { recorder, mimeType } = createSafeMediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        setActiveStream(null);
        const actualMime = recorder.mimeType || mimeType;
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        if (!audioBlob || audioBlob.size < 300) {
          setIsTranscribingAudio(false);
          setIsProcessing(false);
          setErrorMsg('🎙 Запись слишком короткая. Нажмите «Голос», надиктуйте задачу и нажмите «Готово».');
          return;
        }
        await handleAudioProcess(audioBlob);
      };

      // Collect audio chunks every 500ms so data is always buffered (with fallback if timeslice not supported)
      try {
        recorder.start(500);
      } catch (startErr) {
        console.warn('recorder.start(500) fallback to recorder.start():', startErr);
        recorder.start();
      }
      setIsRecording(true);
    } catch (err) {
      console.error('Audio recording failed:', err);
      hapticFeedback('warning');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMsg('🎙 Микрофон заблокирован. Разрешите доступ: Настройки iPhone -> Telegram -> включите «Микрофон».');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMsg('🎙 Микрофон не обнаружен на вашем устройстве.');
      } else if (err.name === 'NotSupportedError') {
        setErrorMsg('🎙 Запись звука не поддерживается в этой версии браузера.');
      } else {
        setErrorMsg(`🎙 Ошибка микрофона: ${err.message || 'нажмите на кнопку ещё раз'}`);
      }
    }
  };

  // Stop voice recording and submit
  const stopRecording = () => {
    hapticFeedback('medium');
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      setIsTranscribingAudio(true);
      setActiveStream(null);
      try {
        // Request final audio chunk to ensure trailing speech before "Готово" is captured
        if (typeof mediaRecorderRef.current.requestData === 'function') {
          mediaRecorderRef.current.requestData();
        }
      } catch (_) {}
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
      setIsRecording(false);
    }
  };
  stopRecordingRef.current = stopRecording;

  // Cancel voice recording without submitting
  const cancelRecording = () => {
    hapticFeedback('warning');
    setIsTranscribingAudio(false);
    setActiveStream(null);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.onstop = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
      setIsRecording(false);
    }
  };

  // Auto start voice if requested (e.g. from Goals tab voice action)
  useEffect(() => {
    if (autoStartVoice && !hasAutoStartedRef.current) {
      hasAutoStartedRef.current = true;
      // Immediate call without arbitrary setTimeout delay so it keeps user activation context
      startRecording().catch(() => {});
    }
  }, [autoStartVoice]);

  // Auto parse initial text if passed (e.g. from Goals tab AI input)
  useEffect(() => {
    if (initialText && initialText.trim()) {
      const t = setTimeout(() => {
        handleSmartAiParse(initialText.trim());
      }, 250);
      return () => clearTimeout(t);
    }
  }, [initialText]);

  // Submit via Smart AI parse
  const handleSmartAiParse = async (overrideText) => {
    const textToParse = typeof overrideText === 'string' ? overrideText.trim() : inputText.trim();
    if (!textToParse) return;
    setIsProcessing(true);
    setErrorMsg('');
    try {
      const res = await parseSmartText(textToParse, selectedProvider);
      if (res && res.tasks && res.tasks.length > 0) {
        setExtractedTasks(res.tasks.map(mapExtractedTask));
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

  // Save edit for existing task or routine
  const handleSaveEdit = (e) => {
    if (e) e.preventDefault();
    const title = capitalizeFirst(inputText.trim());
    if (!title || !editingItem) return;

    const parsedTarget = isNumeric && targetValue ? parseFloat(targetValue.replace(',', '.')) : null;
    const parsedStep = isNumeric && step ? parseFloat(step.replace(',', '.')) : 1.0;
    const cleanUnit = isNumeric && unit.trim() ? unit.trim() : null;

    hapticFeedback('success');
    onClose();

    if (category === 'routine' || editingType === 'routine' || editingItem.frequency_type) {
      const routineFreq = frequencyType || 'daily';
      const routineInterval = routineFreq === 'interval' ? (parseInt(intervalDays, 10) || 1) : 1;
      const routineDays = routineFreq === 'weekly' ? daysOfWeek : null;

      if (setDashboardData) {
        setDashboardData((prev) => {
          if (!prev) return prev;
          const updatedList = (prev.routine_tasks || []).map((r) =>
            r.id === editingItem.id
              ? {
                  ...r,
                  title,
                  target_value: parsedTarget,
                  step: parsedStep,
                  unit: cleanUnit,
                  frequency_type: routineFreq,
                  interval_days: routineInterval,
                  days_of_week: routineDays,
                }
              : r
          );
          const updated = { ...prev, routine_tasks: updatedList };
          setCachedDashboard(updated);
          return updated;
        });
      }

      updateRoutine(editingItem.id, {
        title,
        target_value: parsedTarget,
        step: parsedStep,
        unit: cleanUnit,
        frequency_type: routineFreq,
        interval_days: routineInterval,
        days_of_week: routineDays,
      })
        .then(() => {
          onTaskCreated?.();
        })
        .catch((err) => {
          console.error('Failed to update routine:', err);
          onTaskCreated?.();
        });
    } else {
      // One-time task / subtask
      const selectedDate = getSelectedDate();
      const gId = category === 'subtask' || selectedGoalId ? selectedGoalId : null;
      const goalObj = (goalsData || []).find((g) => g.id === gId);
      const goalTitle = goalObj ? goalObj.title : (selectedGoalTitle || null);
      const todayStr = new Date().toISOString().split('T')[0];
      const isDueToday = selectedDate === todayStr;

      if (setDashboardData) {
        setDashboardData((prev) => {
          if (!prev) return prev;

          const foundInToday = (prev.today_tasks || []).some((t) => t.id === editingItem.id);
          const foundInOverdue = (prev.overdue_tasks || []).some((t) => t.id === editingItem.id);

          const updatedTask = {
            ...editingItem,
            title,
            scheduled_date: selectedDate,
            goal_id: gId,
            goal_title: goalTitle,
            target_value: parsedTarget,
            step: parsedStep,
            unit: cleanUnit,
          };

          let newToday = prev.today_tasks || [];
          let newOverdue = prev.overdue_tasks || [];

          if (isDueToday) {
            if (foundInToday) {
              newToday = newToday.map((t) => (t.id === editingItem.id ? updatedTask : t));
            } else if (foundInOverdue) {
              newOverdue = newOverdue.filter((t) => t.id !== editingItem.id);
              newToday = [updatedTask, ...newToday];
            } else {
              newToday = [updatedTask, ...newToday];
            }
          } else {
            // Task is scheduled for another date or null (без срока) -> Remove from today/overdue
            newToday = newToday.filter((t) => t.id !== editingItem.id);
            newOverdue = newOverdue.filter((t) => t.id !== editingItem.id);
          }

          const countDiff = (foundInToday || foundInOverdue) && !isDueToday ? -1 : (!foundInToday && !foundInOverdue && isDueToday ? 1 : 0);

          const updated = {
            ...prev,
            today_tasks: newToday,
            overdue_tasks: newOverdue,
            total_count: Math.max(0, (prev.total_count || 0) + countDiff),
          };
          setCachedDashboard(updated);
          return updated;
        });
      }

      if (setGoalsData && gId) {
        setGoalsData((prev) => {
          if (!prev) return prev;
          const updated = (prev || []).map((g) => {
            if (g.id === gId) {
              const subtasks = (g.subtasks || []).map((s) =>
                s.id === editingItem.id
                  ? {
                      ...s,
                      title,
                      scheduled_date: selectedDate,
                      target_value: parsedTarget,
                      step: parsedStep,
                      unit: cleanUnit,
                    }
                  : s
              );
              return { ...g, subtasks };
            }
            return g;
          });
          setCachedGoals(updated);
          return updated;
        });
      }

      updateTask(editingItem.id, {
        title,
        scheduled_date: selectedDate,
        goal_id: typeof gId === 'number' ? gId : null,
        target_value: parsedTarget,
        step: parsedStep,
        unit: cleanUnit,
      })
        .then(() => {
          onTaskCreated?.();
        })
        .catch((err) => {
          console.error('Failed to update task:', err);
          onTaskCreated?.();
        });
    }
  };

  // Direct deletion from inside edit modal
  const handleDeleteCurrent = async () => {
    if (!editingItem) return;
    hapticFeedback('warning');
    onClose();

    if (category === 'routine' || editingType === 'routine' || editingItem.frequency_type) {
      if (setDashboardData) {
        setDashboardData((prev) => {
          if (!prev) return prev;
          const updated = {
            ...prev,
            routine_tasks: (prev.routine_tasks || []).filter((r) => r.id !== editingItem.id),
            total_count: Math.max(0, (prev.total_count || 0) - 1),
          };
          setCachedDashboard(updated);
          return updated;
        });
      }
      try {
        await deleteRoutine(editingItem.id);
      } catch (err) {
        console.error('Failed to delete routine:', err);
      }
      onTaskCreated?.();
    } else {
      if (setDashboardData) {
        setDashboardData((prev) => {
          if (!prev) return prev;
          const wasCompleted = editingItem.is_completed;
          const updated = {
            ...prev,
            today_tasks: (prev.today_tasks || []).filter((t) => t.id !== editingItem.id),
            overdue_tasks: (prev.overdue_tasks || []).filter((t) => t.id !== editingItem.id),
            total_count: Math.max(0, (prev.total_count || 0) - 1),
            completed_count: wasCompleted ? Math.max(0, (prev.completed_count || 0) - 1) : prev.completed_count,
          };
          setCachedDashboard(updated);
          return updated;
        });
      }
      if (setGoalsData && editingItem.goal_id) {
        setGoalsData((prev) => {
          if (!prev) return prev;
          const updated = (prev || []).map((g) => {
            if (g.id === editingItem.goal_id) {
              const subtasks = (g.subtasks || []).filter((s) => s.id !== editingItem.id);
              const completedCount = subtasks.filter((s) => s.is_completed).length;
              const progress = subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0;
              return {
                ...g,
                subtasks,
                progress,
                total_subtasks: subtasks.length,
                completed_subtasks: completedCount,
                progress_percentage: progress,
              };
            }
            return g;
          });
          setCachedGoals(updated);
          return updated;
        });
      }
      try {
        await deleteTask(editingItem.id);
      } catch (err) {
        console.error('Failed to delete task:', err);
      }
      onTaskCreated?.();
    }
  };

  // Direct Create (Zero AI latency)
  const handleDirectCreate = (e) => {
    if (e) e.preventDefault();
    const title = capitalizeFirst(inputText.trim());
    if (!title) return;

    const tempId = `temp_${Date.now()}`;
    const selectedDate = getSelectedDate();
    const prioInt = 0;
    const mutationId = `create_${category}_${tempId}`;

    const parsedTarget = isNumeric && targetValue ? parseFloat(targetValue.replace(',', '.')) : null;
    const parsedStep = isNumeric && step ? parseFloat(step.replace(',', '.')) : 1.0;
    const cleanUnit = isNumeric && unit.trim() ? unit.trim() : null;

    hapticFeedback('success');
    onClose();

    if (category === 'routine') {
      const routineFreq = frequencyType || 'daily';
      const routineInterval = routineFreq === 'interval' ? (parseInt(intervalDays, 10) || 1) : 1;
      const routineDays = routineFreq === 'weekly' ? daysOfWeek : null;

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
            frequency_type: routineFreq,
            interval_days: routineInterval,
            days_of_week: routineDays,
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
        frequency_type: routineFreq,
        interval_days: routineInterval,
        days_of_week: routineDays,
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
    } else if (category === 'subtask' || selectedGoalId) {
      const gId = selectedGoalId;
      const goalObj = (goalsData || []).find((g) => g.id === gId);
      const goalTitle = goalObj ? goalObj.title : (selectedGoalTitle || null);
      const todayStr = new Date().toISOString().split('T')[0];
      const sched = selectedDate || todayStr;

      if (setGoalsData && gId) {
        setGoalsData((prev) => {
          const optSubtask = {
            id: tempId,
            title,
            is_completed: false,
            scheduled_date: sched,
            goal_id: gId,
            goal_title: goalTitle,
            is_optimistic: true,
          };
          const updated = (prev || []).map((g) => {
            if (g.id === gId) {
              const subtasks = [...(g.subtasks || []), optSubtask];
              const completedCount = subtasks.filter((s) => s.is_completed).length;
              const progress = subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0;
              return {
                ...g,
                subtasks,
                progress,
                total_subtasks: subtasks.length,
                completed_subtasks: completedCount,
                progress_percentage: progress,
              };
            }
            return g;
          });
          setCachedGoals(updated);
          return updated;
        });
      }

      if (setDashboardData && sched === todayStr) {
        setDashboardData((prev) => {
          if (!prev) return prev;
          const optTask = {
            id: tempId,
            title,
            category: 'one_time',
            goal_id: gId,
            goal_title: goalTitle,
            priority: prioInt,
            is_completed: false,
            target_value: parsedTarget,
            current_value: 0.0,
            step: parsedStep,
            unit: cleanUnit,
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

      addPendingMutation({ id: mutationId, type: 'create_subtask', tempId, title, timestamp: Date.now() });

      createTask({
        title,
        scheduled_date: sched,
        goal_id: typeof gId === 'number' ? gId : null,
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
          if (setGoalsData && realTask && gId) {
            setGoalsData((prev) => {
              const updated = (prev || []).map((g) => {
                if (g.id === gId) {
                  const subtasks = (g.subtasks || []).map((st) =>
                    st.id === tempId ? { ...realTask, is_optimistic: false } : st
                  );
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
          console.error('Failed to create subtask on server:', err);
          removePendingMutation(mutationId);
        });
    } else if (category === 'grocery') {
      if (setGroceriesData) {
        setGroceriesData((prev) => {
          const prevActive = prev?.active_items || [];
          const optItem = {
            id: tempId,
            user_id: 0,
            title,
            target_value: parsedTarget,
            current_value: 0.0,
            step: parsedStep,
            unit: cleanUnit,
            is_completed: false,
            created_at: new Date().toISOString(),
            is_optimistic: true,
          };
          const updated = {
            active_items: [optItem, ...prevActive],
            completed_items: prev?.completed_items || [],
            total_count: (prev?.total_count || 0) + 1,
            completed_count: prev?.completed_count || 0,
          };
          setCachedGroceries(updated);
          return updated;
        });
      }

      addPendingMutation({ id: mutationId, type: 'create_grocery', tempId, title, timestamp: Date.now() });

      createGroceryItem({
        title,
        target_value: parsedTarget,
        step: parsedStep,
        unit: cleanUnit,
      })
        .then((realItem) => {
          removePendingMutation(mutationId);
          if (setGroceriesData && realItem) {
            setGroceriesData((prev) => {
              if (!prev) return prev;
              const updated = {
                ...prev,
                active_items: (prev.active_items || []).map((i) =>
                  i.id === tempId ? { ...realItem, is_optimistic: false } : i
                ),
              };
              setCachedGroceries(updated);
              return updated;
            });
          }
        })
        .catch((err) => {
          console.error('Failed to create grocery item on server:', err);
          removePendingMutation(mutationId);
        });
    } else {
      if (setDashboardData && (!selectedDate || selectedDate === todayStr)) {
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
              title: capitalizeFirst(editingTitle.trim()),
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
      prev.map((t) => {
        if (t.id === taskId) {
          let updated = { ...t, category: newCategory };
          if (newCategory === 'subtask' && !updated.goal_id && !updated.goal_title) {
            if (goalsData && goalsData.length > 0) {
              updated.goal_id = goalsData[0].id;
              updated.goal_title = goalsData[0].title;
            }
          }
          return updated;
        }
        return t;
      })
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
    const createdGoalsMap = {};

    // 1. Pass 1: Goals
    selected.forEach((t, i) => {
      if (t.category !== 'goal') return;
      const cleanTitle = capitalizeFirst((t.title || '').trim());
      if (!cleanTitle) return;

      const tempId = `temp_ai_goal_${Date.now()}_${i}`;
      const mutationId = `create_ai_goal_${tempId}`;

      const optGoal = {
        id: tempId,
        title: cleanTitle,
        description: t.description || null,
        target_date: t.target_date || null,
        progress: 0,
        subtasks: [],
        total_subtasks: 0,
        completed_subtasks: 0,
        progress_percentage: 0,
        is_optimistic: true,
      };

      if (setGoalsData) {
        setGoalsData((prev) => {
          const updated = [optGoal, ...(prev || [])];
          setCachedGoals(updated);
          return updated;
        });
      }

      createdGoalsMap[cleanTitle.toLowerCase()] = { id: tempId, title: cleanTitle };

      addPendingMutation({ id: mutationId, type: 'create_goal', tempId, title: cleanTitle, timestamp: Date.now() });

      createGoal({ title: cleanTitle, description: t.description || null, target_date: t.target_date || null })
        .then((real) => {
          removePendingMutation(mutationId);
          if (setGoalsData && real && real.id) {
            setGoalsData((prev) => {
              const updated = (prev || []).map((g) =>
                g.id === tempId ? { ...real, is_optimistic: false } : g
              );
              setCachedGoals(updated);
              return updated;
            });
            createdGoalsMap[cleanTitle.toLowerCase()] = real;
          }
        })
        .catch(() => removePendingMutation(mutationId));
    });

    // 2. Pass 2: Routines, Subtasks, One-Time tasks
    selected.forEach((t, i) => {
      const cleanTitle = capitalizeFirst((t.title || '').trim());
      if (!cleanTitle || t.category === 'goal') return;

      const tempId = `temp_ai_${Date.now()}_${i}`;
      const mutationId = `create_ai_${tempId}`;

      if (t.category === 'routine') {
        const routineFreq = t.frequency_type || 'daily';
        const routineInterval = routineFreq === 'interval' ? (parseInt(t.interval_days, 10) || 1) : 1;
        const routineDays = routineFreq === 'weekly' ? t.days_of_week : null;

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
              frequency_type: routineFreq,
              interval_days: routineInterval,
              days_of_week: routineDays,
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
          frequency_type: routineFreq,
          interval_days: routineInterval,
          days_of_week: routineDays,
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
      } else if (t.category === 'subtask' || t.goal_id || t.goal_title) {
        let targetGoalId = t.goal_id || null;
        let targetGoalTitle = t.goal_title ? capitalizeFirst(t.goal_title) : null;

        if (!targetGoalId && targetGoalTitle) {
          const matchedNew = createdGoalsMap[targetGoalTitle.toLowerCase()];
          if (matchedNew) {
            targetGoalId = matchedNew.id;
          } else {
            const matchedExisting = (goalsData || []).find(
              (g) => g.title && g.title.toLowerCase().includes(targetGoalTitle.toLowerCase())
            );
            if (matchedExisting) {
              targetGoalId = matchedExisting.id;
              targetGoalTitle = matchedExisting.title;
            }
          }
        } else if (targetGoalId && !targetGoalTitle) {
          const gObj = (goalsData || []).find((g) => g.id === targetGoalId);
          if (gObj) targetGoalTitle = gObj.title;
        }

        const prioInt = 0;
        const sched = t.scheduled_date || todayStr;

        if (targetGoalId && setGoalsData) {
          const optSubtask = {
            id: tempId,
            title: cleanTitle,
            is_completed: false,
            scheduled_date: sched,
            goal_id: targetGoalId,
            goal_title: targetGoalTitle,
            is_optimistic: true,
          };
          setGoalsData((prev) => {
            const updated = (prev || []).map((g) => {
              if (g.id === targetGoalId || (g.title && targetGoalTitle && g.title.toLowerCase() === targetGoalTitle.toLowerCase())) {
                const subtasks = [...(g.subtasks || []), optSubtask];
                const completedCount = subtasks.filter((s) => s.is_completed).length;
                const progress = subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0;
                return {
                  ...g,
                  subtasks,
                  progress,
                  total_subtasks: subtasks.length,
                  completed_subtasks: completedCount,
                  progress_percentage: progress,
                };
              }
              return g;
            });
            setCachedGoals(updated);
            return updated;
          });
        }

        if (sched === todayStr && setDashboardData) {
          setDashboardData((prev) => {
            if (!prev) return prev;
            const optTask = {
              id: tempId,
              title: cleanTitle,
              category: 'one_time',
              goal_id: targetGoalId,
              goal_title: targetGoalTitle,
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

        addPendingMutation({ id: mutationId, type: 'create_subtask', tempId, title: cleanTitle, timestamp: Date.now() });

        createTask({
          title: cleanTitle,
          scheduled_date: sched,
          goal_id: typeof targetGoalId === 'number' ? targetGoalId : null,
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
            if (setGoalsData && real && targetGoalId) {
              setGoalsData((prev) => {
                const updated = (prev || []).map((g) => {
                  if (g.id === targetGoalId || g.id === real.goal_id) {
                    const subtasks = (g.subtasks || []).map((st) =>
                      st.id === tempId ? { ...real, is_optimistic: false } : st
                    );
                    return { ...g, subtasks };
                  }
                  return g;
                });
                setCachedGoals(updated);
                return updated;
              });
            }
          })
          .catch(() => removePendingMutation(mutationId));
      } else if (t.category === 'grocery') {
        if (setGroceriesData) {
          setGroceriesData((prev) => {
            const prevActive = prev?.active_items || [];
            const optItem = {
              id: tempId,
              user_id: 0,
              title: cleanTitle,
              target_value: t.target_value || null,
              current_value: 0.0,
              step: t.step || 1.0,
              unit: t.unit || null,
              is_completed: false,
              created_at: new Date().toISOString(),
              is_optimistic: true,
            };
            const updated = {
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
          target_value: t.target_value || null,
          step: t.step || 1.0,
          unit: t.unit || null,
        })
          .then((real) => {
            removePendingMutation(mutationId);
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
          .catch(() => removePendingMutation(mutationId));
      } else {
        const prioInt = 0;
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
        if (e.target === e.currentTarget && !isProcessing && !isRecording && !isTranscribingAudio) {
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
            ) : isProcessing || isTranscribingAudio ? (
              <Mascot state="thinking" size={26} interactive={false} />
            ) : isEditMode ? (
              <Pencil size={18} color="var(--accent-primary)" />
            ) : (
              <Sparkles size={18} color="var(--accent-primary)" />
            )}
            <span>
              {isRecording
                ? 'Запись голоса...'
                : isTranscribingAudio
                  ? 'Расшифровка аудио...'
                  : extractedTasks
                    ? 'Подтверждение задач'
                    : isEditMode
                      ? (category === 'routine' || editingType === 'routine' ? 'Редактирование привычки' : 'Редактирование задачи')
                      : initialGoalTitle
                        ? `Шаг к цели: ${initialGoalTitle}`
                        : category === 'goal'
                          ? 'Новая цель'
                          : 'Создать задачу'}
            </span>
          </div>

          <button
            className="sheet-close-btn"
            onClick={isRecording ? cancelRecording : onClose}
            title="Закрыть"
            disabled={isProcessing || isTranscribingAudio}
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        <div className="sheet-body">
          {errorMsg && (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                marginBottom: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
                <span>{errorMsg}</span>
              </div>
              {errorMsg.toLowerCase().includes('микрофон') && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: '2px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onClick={startRecording}
                >
                  <Mic size={14} />
                  <span>Попробовать снова</span>
                </button>
              )}
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
                              className={`mini-cat-chip ${task.category === 'subtask' ? 'active' : ''}`}
                              onClick={() => handleUpdateTaskCategory(task.id, 'subtask')}
                            >
                              <Target size={10} /> Подзадача
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
                          <div className="item-meta-row" style={{ flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                            <span className="item-tag">
                              {task.category === 'routine' ? (
                                <><Flame size={10} /> Привычка</>
                              ) : task.category === 'goal' ? (
                                <><Target size={10} /> Цель</>
                              ) : task.category === 'grocery' ? (
                                <><ShoppingCart size={10} /> Продукт</>
                              ) : task.category === 'subtask' || task.goal_id || task.goal_title ? (
                                <><Target size={10} /> Подзадача</>
                              ) : (
                                <><Calendar size={10} /> Задача</>
                              )}
                            </span>

                            {/* Goal association selector for non-goals */}
                            {task.category !== 'goal' && ((goalsData && goalsData.length > 0) || (extractedTasks && extractedTasks.some(et => et.category === 'goal' && et.id !== task.id))) && (
                              <select
                                className="quickadd-goal-select-mini"
                                value={task.goal_id ? String(task.goal_id) : (task.goal_title ? `title:${task.goal_title}` : '')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (!val) {
                                    handleUpdateTaskGoal(task.id, null, null);
                                  } else if (val.startsWith('title:')) {
                                    handleUpdateTaskGoal(task.id, null, val.replace('title:', ''));
                                  } else {
                                    const gObj = goalsData.find((g) => String(g.id) === val);
                                    handleUpdateTaskGoal(task.id, gObj ? gObj.id : val, gObj ? gObj.title : null);
                                  }
                                }}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.08)',
                                  border: '1px solid rgba(255, 255, 255, 0.15)',
                                  borderRadius: '4px',
                                  color: task.goal_id || task.goal_title ? 'var(--accent-primary, #60a5fa)' : 'var(--text-tertiary)',
                                  fontSize: '11px',
                                  padding: '1px 5px',
                                  maxWidth: '150px',
                                  cursor: 'pointer',
                                }}
                                title="Привязать к цели"
                              >
                                <option value="">Без цели</option>
                                {(extractedTasks || [])
                                  .filter((et) => et.category === 'goal' && et.id !== task.id && et.title)
                                  .map((eg) => (
                                    <option key={eg.id} value={`title:${eg.title}`}>
                                      {eg.title} (новая цель)
                                    </option>
                                  ))}
                                {(goalsData || []).map((g) => (
                                  <option key={g.id} value={String(g.id)}>
                                    {g.title}
                                  </option>
                                ))}
                              </select>
                            )}

                            {task.target_value && (
                              <span className="item-tag tag-due">
                                <Target size={10} /> {task.target_value} {task.unit || ''} (шаг {task.step || 1})
                              </span>
                            )}
                            {task.scheduled_date && (
                              <span className="item-tag">
                                <Clock size={10} /> {task.scheduled_date}
                              </span>
                            )}
                            {task.category === 'routine' && task.frequency_type === 'interval' && task.interval_days > 1 && (
                              <span className="item-tag">
                                <RotateCw size={10} /> раз в {task.interval_days} дн.
                              </span>
                            )}
                            {task.category === 'routine' && task.frequency_type === 'weekly' && task.days_of_week && task.days_of_week.length > 0 && (
                              <span className="item-tag">
                                <RotateCw size={10} /> {
                                  task.days_of_week.length === 5 && [0, 1, 2, 3, 4].every(d => task.days_of_week.includes(d))
                                    ? 'Будни'
                                    : task.days_of_week.length === 2 && [5, 6].every(d => task.days_of_week.includes(d))
                                      ? 'Выходные'
                                      : task.days_of_week.map(d => ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][d]).filter(Boolean).join(', ')
                                }
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
          ) : (isRecording || isTranscribingAudio) ? (
            /* VIEW B1: Dedicated spacious live voice recording & transcription state */
            <div className="voice-recording-card voice-recording-dialog-stage">
              <div className="voice-stage-top">
                <div className="voice-stage-status-badge">
                  {isRecording ? (
                    <>
                      <span className="voice-record-dot live" />
                      <span className="voice-status-label">Идёт запись</span>
                    </>
                  ) : (
                    <>
                      <RotateCw size={12} className="spin-icon" style={{ color: '#ffffff' }} />
                      <span className="voice-status-label">Расшифровка AI</span>
                    </>
                  )}
                </div>

                <div className="voice-timer-pill">
                  <Clock size={12} style={{ opacity: 0.7 }} />
                  <span className="voice-timer-display">{formatTimer(recordSeconds)}</span>
                  <span className="voice-timer-limit">/ 02:00</span>
                </div>
              </div>

              {/* Central Audio Waveform Visualizer */}
              <div className="voice-visualizer-center-stage">
                <BarVisualizer
                  stream={activeStream}
                  state={isRecording ? 'recording' : 'processing'}
                  barCount={7}
                  height={80}
                  barWidth={10}
                  gap={7}
                />

                <p className="voice-stage-hint">
                  {isRecording
                    ? 'Говорите чётко — надиктуйте задачи, привычки или цели'
                    : 'AI Whisper распознаёт аудио и формирует структуру задач...'}
                </p>
              </div>

              {/* Bottom Actions Bar */}
              <div className="voice-card-actions voice-stage-actions">
                <button
                  type="button"
                  className="voice-stage-cancel-btn"
                  onClick={cancelRecording}
                  disabled={isTranscribingAudio}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="voice-stage-submit-btn"
                  onClick={stopRecording}
                  disabled={isTranscribingAudio}
                >
                  {isTranscribingAudio ? (
                    <>
                      <RotateCw size={14} className="spin-icon" />
                      <span>Обработка...</span>
                    </>
                  ) : (
                    <>
                      <Square size={12} fill="currentColor" />
                      <span>Готово ({formatTimer(recordSeconds)})</span>
                    </>
                  )}
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
                  placeholder="Напишите или надиктуйте задачу..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={isProcessing}
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (isEditMode) {
                        handleSaveEdit();
                      } else {
                        handleDirectCreate();
                      }
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
                    <Mic size={15} />
                    <span>Голос</span>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Compact Smart AI parse icon button - ONLY in create mode */}
                    {!isEditMode && inputText.trim().length > 12 && (
                      <button
                        type="button"
                        className="ai-parse-icon-btn"
                        onClick={handleSmartAiParse}
                        disabled={isProcessing}
                        title="Распознать несколько задач через AI"
                        aria-label="AI парсинг"
                      >
                        <Sparkles size={16} color="var(--accent-primary)" />
                      </button>
                    )}

                    <button
                      type="submit"
                      className="submit-task-btn"
                      onClick={isEditMode ? handleSaveEdit : handleDirectCreate}
                      disabled={!inputText.trim() || isProcessing}
                    >
                      {isEditMode ? <Check size={15} /> : <Send size={15} />}
                      <span>{isProcessing ? 'Сохраняю...' : isEditMode ? 'Сохранить' : 'Создать'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Chips: Category - only in creation mode */}
              {!isEditMode && (
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
                      <Calendar size={14} /> Задача
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${category === 'grocery' ? 'active' : ''}`}
                      onClick={() => {
                        hapticFeedback('selection');
                        setCategory('grocery');
                      }}
                    >
                      <ShoppingCart size={14} /> Продукт
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${category === 'routine' ? 'active' : ''}`}
                      onClick={() => {
                        hapticFeedback('selection');
                        setCategory('routine');
                      }}
                    >
                      <Flame size={14} /> Привычка
                    </button>
                    {goalsData && goalsData.length > 0 && (
                      <button
                        type="button"
                        className={`filter-chip ${category === 'subtask' ? 'active' : ''}`}
                        onClick={() => {
                          hapticFeedback('selection');
                          setCategory('subtask');
                          if (!selectedGoalId && goalsData.length > 0) {
                            setSelectedGoalId(goalsData[0].id);
                            setSelectedGoalTitle(goalsData[0].title);
                          }
                        }}
                      >
                        <Milestone size={14} /> Шаг цели
                      </button>
                    )}
                    <button
                      type="button"
                      className={`filter-chip ${category === 'goal' ? 'active' : ''}`}
                      onClick={() => {
                        hapticFeedback('selection');
                        setCategory('goal');
                      }}
                    >
                      <Target size={14} /> Проект / Цель
                    </button>
                  </div>
                </div>
              )}

              {/* Goal selector for subtask */}
              {category === 'subtask' && goalsData && goalsData.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '5px' }}>
                    ЦЕЛЬ
                  </div>
                  <select
                    className="form-input"
                    value={selectedGoalId || ''}
                    onChange={(e) => {
                      const val = e.target.value ? (isNaN(e.target.value) ? e.target.value : Number(e.target.value)) : null;
                      setSelectedGoalId(val);
                      const gObj = (goalsData || []).find((g) => String(g.id) === String(e.target.value));
                      setSelectedGoalTitle(gObj ? gObj.title : '');
                    }}
                    style={{
                      width: '100%',
                      fontSize: '13px',
                      padding: '8px 10px',
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-full)',
                    }}
                  >
                    <option value="">Без цели</option>
                    {goalsData.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Chips: Due Date (for one_time and subtask tasks) */}
              {(category === 'one_time' || category === 'subtask') && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '5px' }}>
                    СРОК ИСПОЛНЕНИЯ
                  </div>
                  <div className="chips-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                    <button
                      type="button"
                      className={`filter-chip ${dueDateOption === 'custom' ? 'active' : ''}`}
                      onClick={() => {
                        hapticFeedback('selection');
                        setDueDateOption('custom');
                        if (!customDueDate) {
                          const d = new Date();
                          d.setDate(d.getDate() + 2);
                          setCustomDueDate(d.toISOString().split('T')[0]);
                        }
                      }}
                    >
                      <Calendar size={13} />
                      <span>{dueDateOption === 'custom' && customDueDate ? customDueDate : 'Выбрать дату'}</span>
                    </button>
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
                  </div>

                  {dueDateOption === 'custom' && (
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="date"
                        className="quick-add-input"
                        style={{
                          padding: '6px 14px',
                          fontSize: '13px',
                          colorScheme: 'dark',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-full)',
                          color: 'var(--text-primary)',
                          outline: 'none',
                        }}
                        value={customDueDate || new Date().toISOString().split('T')[0]}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => {
                          setCustomDueDate(e.target.value);
                          setDueDateOption('custom');
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Recurrence Options for Routine */}
              {category === 'routine' && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '5px' }}>
                    ПЕРИОДИЧНОСТЬ ПОВТОРЕНИЯ
                  </div>
                  <div className="chips-row" style={{ flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    <button
                      type="button"
                      className={`filter-chip ${frequencyType === 'daily' ? 'active' : ''}`}
                      onClick={() => {
                        hapticFeedback('selection');
                        setFrequencyType('daily');
                      }}
                    >
                      Каждый день
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${frequencyType === 'interval' ? 'active' : ''}`}
                      onClick={() => {
                        hapticFeedback('selection');
                        setFrequencyType('interval');
                      }}
                    >
                      Каждые N дней
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${frequencyType === 'weekly' ? 'active' : ''}`}
                      onClick={() => {
                        hapticFeedback('selection');
                        setFrequencyType('weekly');
                      }}
                    >
                      По дням недели
                    </button>
                  </div>

                  {frequencyType === 'interval' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', padding: '6px 10px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Повторять раз в:</span>
                      <input
                        type="number"
                        min="2"
                        max="365"
                        value={intervalDays}
                        onChange={(e) => setIntervalDays(Math.max(2, parseInt(e.target.value, 10) || 2))}
                        style={{
                          width: '60px',
                          padding: '4px 8px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          textAlign: 'center',
                        }}
                      />
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>дн. (например: 2, 3, 7)</span>
                    </div>
                  )}

                  {frequencyType === 'weekly' && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {[
                        { id: 0, label: 'Пн' },
                        { id: 1, label: 'Вт' },
                        { id: 2, label: 'Ср' },
                        { id: 3, label: 'Чт' },
                        { id: 4, label: 'Пт' },
                        { id: 5, label: 'Сб' },
                        { id: 6, label: 'Вс' },
                      ].map((day) => {
                        const isSelected = daysOfWeek.includes(day.id);
                        return (
                          <button
                            key={day.id}
                            type="button"
                            className={`filter-chip ${isSelected ? 'active' : ''}`}
                            style={{ minWidth: '38px', textAlign: 'center', padding: '6px 8px' }}
                            onClick={() => {
                              hapticFeedback('selection');
                              setDaysOfWeek((prev) => {
                                if (prev.includes(day.id)) {
                                  if (prev.length === 1) return prev; // Keep at least one
                                  return prev.filter((d) => d !== day.id);
                                } else {
                                  return [...prev, day.id].sort((a, b) => a - b);
                                }
                              });
                            }}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
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
                      <Hash size={13} />
                      <span>{isNumeric ? 'Количественная цель: Вкл' : '+ Задать количество'}</span>
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

              {/* Bottom Delete Button for Edit Mode */}
              {isEditMode && (
                <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    type="button"
                    className="modal-danger-btn"
                    onClick={handleDeleteCurrent}
                    disabled={isProcessing}
                  >
                    <Trash2 size={15} />
                    <span>
                      {category === 'routine' || editingType === 'routine'
                        ? 'Удалить привычку'
                        : 'Удалить задачу'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
