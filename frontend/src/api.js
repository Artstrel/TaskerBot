const getTelegramUser = () => {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user) {
    return window.Telegram.WebApp.initDataUnsafe.user;
  }
  // Fallback for regular browser preview / desktop testing
  return {
    id: 123456789,
    first_name: 'Пользователь',
    username: 'tasker_user',
  };
};

export const currentUser = getTelegramUser();

export const getCustomBackendUrl = () => {
  if (typeof window !== 'undefined') {
    // Check URL query param ?api=https://...
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const apiParam = urlParams.get('api') || urlParams.get('backend');
      if (apiParam) {
        localStorage.setItem('tasker_custom_backend', apiParam.trim());
        return apiParam.trim();
      }
    } catch (e) {}
    return localStorage.getItem('tasker_custom_backend') || '';
  }
  return '';
};

export const setCustomBackendUrl = (url) => {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('tasker_custom_backend', url.trim());
    } else {
      localStorage.removeItem('tasker_custom_backend');
    }
  }
};
export const getApiBase = () => {
  if (typeof window !== 'undefined') {
    if (import.meta.env.VITE_API_BASE) {
      return import.meta.env.VITE_API_BASE.replace(/\/+$/, '');
    }
    const custom = getCustomBackendUrl();
    if (custom) {
      return custom.replace(/\/+$/, '') + '/api';
    }
  }
  return '/api';
};

export const API_BASE = {
  toString() {
    return getApiBase();
  },
};

export const isDemoMode = () => {
  if (typeof window !== 'undefined') {
    return !!window.__tasker_is_demo;
  }
  return false;
};

export const hapticFeedback = (style = 'medium') => {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
    try {
      window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
    } catch (e) {
      // Ignore if not supported in client
    }
  }
};

// ==============================================================================
// Local Fallback Storage (Enables 100% functional Demo Mode on GitHub Pages)
// ==============================================================================
const LOCAL_STORAGE_KEY = 'tasker_local_db_v2';

const getLocalDb = () => {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
  }
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  return {
    tasks: [
      {
        id: 1,
        title: 'Запустить личного ассистента в Telegram',
        category: 'one_time',
        priority: 'high',
        is_completed: false,
        scheduled_date: yesterday,
        created_at: new Date().toISOString(),
      },
      {
        id: 2,
        title: 'Протестировать добавление задач и целей',
        category: 'one_time',
        priority: 'medium',
        is_completed: false,
        scheduled_date: todayStr,
        created_at: new Date().toISOString(),
      },
    ],
    routines: [
      {
        id: 101,
        title: 'Утренняя зарядка и стакан воды',
        is_completed_today: true,
        current_streak: 5,
        best_streak: 14,
      },
      {
        id: 102,
        title: 'Чтение профильной литературы 20 мин',
        is_completed_today: false,
        current_streak: 3,
        best_streak: 8,
      },
    ],
    goals: [
      {
        id: 201,
        title: 'Запуск TaskerBot в продакшн',
        description: 'Развернуть бэкенд на сервере и подключить к Telegram',
        target_date: '2026-11-01',
        progress: 67,
        subtasks: [
          { id: 301, title: 'Опубликовать WebApp на GitHub Pages', is_completed: true },
          { id: 302, title: 'Развернуть бэкенд на Render / VPS', is_completed: false },
          { id: 303, title: 'Привязать кнопку к боту @BotFather', is_completed: false },
        ],
      },
    ],
    settings: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
      day_end_time: '00:00',
      reminder_6h_enabled: true,
      reminder_3h_enabled: true,
      reminder_1h_enabled: true,
      morning_digest_enabled: true,
      evening_digest_enabled: true,
      ai_provider: 'groq',
    },
  };
};

const saveLocalDb = (db) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
    } catch (e) {}
  }
};

export const isDemoModeActive = () => {
  if (typeof window !== 'undefined') {
    return Boolean(window.__tasker_is_demo);
  }
  return false;
};

// ==============================================================================
// API Methods with seamless Offline/Demo Fallback
// ==============================================================================

export const syncUserTimezone = async () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
    await fetch(
      `${API_BASE}/user/sync?telegram_id=${currentUser.id}&timezone=${encodeURIComponent(
        tz
      )}&first_name=${encodeURIComponent(currentUser.first_name || '')}&username=${encodeURIComponent(
        currentUser.username || ''
      )}`,
      { method: 'POST' }
    );
  } catch (e) {
    // Ignore timezone sync errors on static demo
  }
};

export const fetchDashboard = async () => {
  try {
    const res = await fetch(
      `${API_BASE}/dashboard/today?telegram_id=${currentUser.id}&first_name=${encodeURIComponent(
        currentUser.first_name || ''
      )}`
    );
    if (res.ok) {
      if (typeof window !== 'undefined') window.__tasker_is_demo = false;
      return await res.json();
    }
  } catch (e) {
    // Fall back to local DB
  }

  if (typeof window !== 'undefined') window.__tasker_is_demo = true;
  const db = getLocalDb();
  const todayStr = new Date().toISOString().split('T')[0];

  const overdue = db.tasks.filter((t) => !t.is_completed && t.scheduled_date && t.scheduled_date < todayStr);
  const today = db.tasks.filter((t) => t.scheduled_date === todayStr || (!t.scheduled_date && !t.is_completed));
  const completedToday =
    today.filter((t) => t.is_completed).length + db.routines.filter((r) => r.is_completed_today).length;
  const totalToday = today.length + db.routines.length;

  return {
    today_formatted: new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date()),
    day_end_time: db.settings.day_end_time || '00:00',
    time_remaining_str: 'осталось 3 ч',
    overdue_tasks: overdue,
    routine_tasks: db.routines,
    today_tasks: today,
    completed_count: completedToday,
    total_count: totalToday,
    current_streak: 5,
    is_demo: true,
  };
};

export const fetchGoals = async () => {
  try {
    const res = await fetch(`${API_BASE}/goals?telegram_id=${currentUser.id}`);
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  return db.goals || [];
};

export const fetchUserSettings = async () => {
  try {
    const res = await fetch(`${API_BASE}/user/me?telegram_id=${currentUser.id}`);
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  return db.settings || {};
};

export const updateUserSettings = async (settingsData) => {
  try {
    const res = await fetch(`${API_BASE}/user/settings?telegram_id=${currentUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  db.settings = { ...db.settings, ...settingsData };
  saveLocalDb(db);
  return db.settings;
};

export const toggleTask = async (taskId, completed = null) => {
  hapticFeedback('light');
  try {
    const url = `${API_BASE}/tasks/${taskId}/toggle?telegram_id=${currentUser.id}${
      completed !== null ? `&completed=${completed}` : ''
    }`;
    const res = await fetch(url, { method: 'PATCH' });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const task = db.tasks.find((t) => t.id === taskId);
  if (task) {
    task.is_completed = completed !== null ? completed : !task.is_completed;
    saveLocalDb(db);
    return task;
  }
  return { id: taskId, is_completed: true };
};

export const postponeTask = async (taskId, newDateStr) => {
  hapticFeedback('medium');
  try {
    const res = await fetch(
      `${API_BASE}/tasks/${taskId}/postpone?telegram_id=${currentUser.id}&new_date=${newDateStr}`,
      { method: 'PATCH' }
    );
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const task = db.tasks.find((t) => t.id === taskId);
  if (task) {
    task.scheduled_date = newDateStr;
    saveLocalDb(db);
    return task;
  }
  return { id: taskId, scheduled_date: newDateStr };
};

export const deleteTask = async (taskId) => {
  hapticFeedback('warning');
  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}?telegram_id=${currentUser.id}`, {
      method: 'DELETE',
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  db.tasks = db.tasks.filter((t) => t.id !== taskId);
  saveLocalDb(db);
  return { success: true };
};

export const createTask = async (taskData) => {
  hapticFeedback('success');
  try {
    const res = await fetch(`${API_BASE}/tasks?telegram_id=${currentUser.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const newTask = {
    id: Date.now(),
    title: taskData.title,
    category: taskData.category || 'one_time',
    priority: taskData.priority || 'medium',
    scheduled_date: taskData.scheduled_date || new Date().toISOString().split('T')[0],
    is_completed: false,
    created_at: new Date().toISOString(),
  };
  db.tasks.unshift(newTask);
  saveLocalDb(db);
  return newTask;
};

export const updateTask = async (taskId, updateData) => {
  hapticFeedback('selection');
  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}?telegram_id=${currentUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const task = db.tasks.find((t) => t.id === taskId);
  if (task) {
    Object.assign(task, updateData);
    saveLocalDb(db);
    return task;
  }
  return { id: taskId, ...updateData };
};

export const toggleRoutine = async (routineId, completed = null) => {
  hapticFeedback('light');
  try {
    const url = `${API_BASE}/routines/${routineId}/toggle?telegram_id=${currentUser.id}${
      completed !== null ? `&completed=${completed}` : ''
    }`;
    const res = await fetch(url, { method: 'PATCH' });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const r = db.routines.find((item) => item.id === routineId);
  if (r) {
    const newState = completed !== null ? completed : !r.is_completed_today;
    r.is_completed_today = newState;
    if (newState) {
      r.current_streak = (r.current_streak || 0) + 1;
      if (r.current_streak > (r.best_streak || 0)) r.best_streak = r.current_streak;
    } else {
      r.current_streak = Math.max(0, (r.current_streak || 1) - 1);
    }
    saveLocalDb(db);
    return r;
  }
  return { id: routineId, is_completed_today: true };
};

export const deleteRoutine = async (routineId) => {
  hapticFeedback('warning');
  try {
    const res = await fetch(`${API_BASE}/routines/${routineId}?telegram_id=${currentUser.id}`, {
      method: 'DELETE',
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  db.routines = db.routines.filter((r) => r.id !== routineId);
  saveLocalDb(db);
  return { success: true };
};

export const createRoutine = async (routineData) => {
  hapticFeedback('success');
  try {
    const res = await fetch(`${API_BASE}/routines?telegram_id=${currentUser.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(routineData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const newRoutine = {
    id: Date.now(),
    title: routineData.title,
    is_completed_today: false,
    current_streak: 0,
    best_streak: 0,
  };
  db.routines.unshift(newRoutine);
  saveLocalDb(db);
  return newRoutine;
};

export const createGoal = async (goalData) => {
  hapticFeedback('success');
  try {
    const res = await fetch(`${API_BASE}/goals?telegram_id=${currentUser.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goalData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const newGoal = {
    id: Date.now(),
    title: goalData.title,
    description: goalData.description || '',
    target_date: goalData.target_date || null,
    progress: 0,
    subtasks: [],
  };
  db.goals.unshift(newGoal);
  saveLocalDb(db);
  return newGoal;
};

export const addGoalSubtask = async (goalId, title, scheduledDate = null) => {
  hapticFeedback('light');
  try {
    let url = `${API_BASE}/goals/${goalId}/subtasks?telegram_id=${currentUser.id}&title=${encodeURIComponent(
      title
    )}`;
    if (scheduledDate) {
      url += `&scheduled_date=${scheduledDate}`;
    }
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const goal = db.goals.find((g) => g.id === goalId);
  if (goal) {
    if (!goal.subtasks) goal.subtasks = [];
    goal.subtasks.push({
      id: Date.now(),
      title,
      is_completed: false,
      scheduled_date: scheduledDate,
    });
    saveLocalDb(db);
    return goal;
  }
  return { success: true };
};

export const deleteGoal = async (goalId) => {
  hapticFeedback('warning');
  try {
    const res = await fetch(`${API_BASE}/goals/${goalId}?telegram_id=${currentUser.id}`, {
      method: 'DELETE',
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  db.goals = db.goals.filter((g) => g.id !== goalId);
  saveLocalDb(db);
  return { success: true };
};

export const fetchAIProviders = async () => {
  try {
    const res = await fetch(`${API_BASE}/ai/providers?telegram_id=${currentUser.id}`);
    if (res.ok) return await res.json();
  } catch (e) {}

  return {
    providers: [
      { id: 'groq', name: 'Groq (Whisper + Llama 3)', is_default: true },
      { id: 'gemini', name: 'Google Gemini Flash', is_default: false },
    ],
  };
};

export const parseSmartText = async (text, provider = null) => {
  try {
    const formData = new FormData();
    formData.append('text', text);
    if (provider) {
      formData.append('provider', provider);
    }
    const res = await fetch(`${API_BASE}/ai/parse-text?telegram_id=${currentUser.id}`, {
      method: 'POST',
      body: formData,
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  // Fallback parser on GitHub Pages demo
  const lines = text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const tasks = lines.map((line, idx) => {
    const lower = line.toLowerCase();
    const isRoutine = lower.includes('каждый день') || lower.includes('ежедневно') || lower.includes('привычка');
    const isGoal = lower.includes('цель') || lower.includes('проект');
    return {
      id: Date.now() + idx,
      title: line.replace(/^(каждый день|ежедневно|цель:?)\s*/i, ''),
      category: isRoutine ? 'routine' : isGoal ? 'goal' : 'one_time',
      scheduled_date: new Date().toISOString().split('T')[0],
      selected: true,
    };
  });
  return {
    tasks: tasks.length > 0 ? tasks : [{ id: Date.now(), title: text, category: 'one_time', selected: true }],
  };
};

export const parseSmartAudio = async (audioBlob, provider = null) => {
  try {
    const formData = new FormData();
    const ext = audioBlob.type && audioBlob.type.includes('webm') ? 'voice.webm' : 'voice.ogg';
    formData.append('audio', audioBlob, ext);
    if (provider) {
      formData.append('provider', provider);
    }
    const res = await fetch(`${API_BASE}/ai/parse-audio?telegram_id=${currentUser.id}`, {
      method: 'POST',
      body: formData,
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  // Audio transcription requires Python backend AI API key
  throw new Error('Голосовая AI транскрипция требует подключения живого бэкенда (Render / ngrok). Для демо используйте текстовый ввод.');
};
