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
// SWR (Stale-While-Revalidate) Cache for Instant Loading (0ms UI startup)
// ==============================================================================
export const getCachedDashboard = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`tasker_cache_dashboard_${currentUser.id}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
};

export const setCachedDashboard = (data) => {
  if (typeof window === 'undefined' || !data) return;
  try {
    localStorage.setItem(`tasker_cache_dashboard_${currentUser.id}`, JSON.stringify(data));
  } catch (e) {}
};

export const getCachedGoals = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`tasker_cache_goals_${currentUser.id}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
};

export const setCachedGoals = (data) => {
  if (typeof window === 'undefined' || !data) return;
  try {
    localStorage.setItem(`tasker_cache_goals_${currentUser.id}`, JSON.stringify(data));
  } catch (e) {}
};

// ==============================================================================
// Pending Sync Queue (Optimistic Offline/Online Buffer)
// ==============================================================================
const PENDING_SYNC_KEY = `tasker_pending_sync_${currentUser.id}`;

export const getPendingSyncQueue = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
};

export const addPendingMutation = (mutation) => {
  if (typeof window === 'undefined' || !mutation) return;
  try {
    const queue = getPendingSyncQueue();
    queue.push({ ...mutation, created_at: Date.now() });
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
  } catch (e) {}
};

export const removePendingMutation = (mutationId) => {
  if (typeof window === 'undefined' || !mutationId) return;
  try {
    const queue = getPendingSyncQueue().filter((m) => m.id !== mutationId);
    if (queue.length > 0) {
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
    } else {
      localStorage.removeItem(PENDING_SYNC_KEY);
    }
  } catch (e) {}
};

export const clearPendingSyncQueue = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_SYNC_KEY);
  } catch (e) {}
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

export const calculateDayEndAndUrgency = (dayEndTimeStr = '00:00') => {
  const now = new Date();
  let [endHour, endMinute] = (dayEndTimeStr || '00:00').split(':').map((s) => parseInt(s, 10));
  if (isNaN(endHour)) endHour = 0;
  if (isNaN(endMinute)) endMinute = 0;

  let target = new Date(now);
  if (endHour === 0 && endMinute === 0) {
    target.setHours(23, 59, 59, 999);
  } else {
    target.setHours(endHour, endMinute, 0, 0);
    if (now >= target) {
      target.setDate(target.getDate() + 1);
    }
  }

  const diffMs = Math.max(0, target.getTime() - now.getTime());
  const hoursLeft = diffMs / (1000 * 60 * 60);

  let urgency = 'normal';
  if (hoursLeft <= 1) urgency = 'critical_1h';
  else if (hoursLeft <= 3) urgency = 'warning_3h';
  else if (hoursLeft <= 6) urgency = 'warning_6h';

  return { hours_left_in_day: hoursLeft, urgency_level: urgency };
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
      const data = await res.json();
      setCachedDashboard(data);
      return data;
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

  const dayEndTime = db.settings?.day_end_time || '00:00';
  const { hours_left_in_day, urgency_level } = calculateDayEndAndUrgency(dayEndTime);
  const hours = Math.floor(hours_left_in_day);
  const mins = Math.round((hours_left_in_day % 1) * 60);

  const fallbackData = {
    today_formatted: new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date()),
    day_end_time: dayEndTime,
    hours_left_in_day,
    urgency_level,
    time_remaining_str: `${hours} ч ${mins} м до сброса`,
    overdue_tasks: overdue,
    routine_tasks: db.routines,
    today_tasks: today,
    completed_count: completedToday,
    total_count: totalToday,
    current_streak: 5,
    is_demo: true,
  };
  setCachedDashboard(fallbackData);
  return fallbackData;
};

export const fetchGoals = async () => {
  try {
    const res = await fetch(`${API_BASE}/goals?telegram_id=${currentUser.id}`);
    if (res.ok) {
      const data = await res.json();
      setCachedGoals(data);
      return data;
    }
  } catch (e) {}

  const db = getLocalDb();
  const goals = db.goals || [];
  setCachedGoals(goals);
  return goals;
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
    goal_id: taskData.goal_id || null,
    goal_title: taskData.goal_title || null,
    priority: taskData.priority || 'medium',
    scheduled_date: taskData.scheduled_date || new Date().toISOString().split('T')[0],
    target_value: taskData.target_value || null,
    current_value: 0.0,
    step: taskData.step || 1.0,
    unit: taskData.unit || null,
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

export const updateTaskProgress = async (taskId, { current_value, delta }) => {
  hapticFeedback('light');
  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/progress?telegram_id=${currentUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_value, delta }),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const task = db.tasks.find((t) => t.id === taskId);
  if (task) {
    let newVal = task.current_value || 0;
    if (current_value !== undefined) newVal = current_value;
    else if (delta !== undefined) newVal += delta;
    newVal = Math.max(0, Math.round(newVal * 100) / 100);
    task.current_value = newVal;
    if (task.target_value && newVal >= task.target_value) {
      task.is_completed = true;
    } else if (task.target_value && newVal < task.target_value) {
      task.is_completed = false;
    }
    saveLocalDb(db);
    return task;
  }
  return { id: taskId, current_value };
};

export const updateRoutine = async (routineId, updateData) => {
  hapticFeedback('selection');
  try {
    const res = await fetch(`${API_BASE}/routines/${routineId}?telegram_id=${currentUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const r = db.routines.find((item) => item.id === routineId);
  if (r) {
    Object.assign(r, updateData);
    saveLocalDb(db);
    return r;
  }
  return { id: routineId, ...updateData };
};

export const updateRoutineProgress = async (routineId, { current_value, delta }) => {
  hapticFeedback('light');
  try {
    const res = await fetch(`${API_BASE}/routines/${routineId}/progress?telegram_id=${currentUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_value, delta }),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const r = db.routines.find((item) => item.id === routineId);
  if (r) {
    let newVal = r.current_value || 0;
    if (current_value !== undefined) newVal = current_value;
    else if (delta !== undefined) newVal += delta;
    newVal = Math.max(0, Math.round(newVal * 100) / 100);
    r.current_value = newVal;
    if (r.target_value && newVal >= r.target_value) {
      r.is_completed_today = true;
    } else if (r.target_value && newVal < r.target_value) {
      r.is_completed_today = false;
    }
    saveLocalDb(db);
    return r;
  }
  return { id: routineId, current_value };
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
    target_value: routineData.target_value || null,
    current_value: 0.0,
    step: routineData.step || 1.0,
    unit: routineData.unit || null,
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

export const getGeminiKey = () => {
  if (typeof window !== 'undefined') {
    return (
      localStorage.getItem('tasker_gemini_key') ||
      import.meta.env.VITE_GEMINI_API_KEY ||
      import.meta.env.GEMINI_API_KEY ||
      ''
    );
  }
  return '';
};

export const setGeminiKey = (key) => {
  if (typeof window !== 'undefined') {
    if (key && key.trim()) localStorage.setItem('tasker_gemini_key', key.trim());
    else localStorage.removeItem('tasker_gemini_key');
  }
};

export const getGroqKey = () => {
  if (typeof window !== 'undefined') {
    return (
      localStorage.getItem('tasker_groq_key') ||
      import.meta.env.VITE_GROQ_API_KEY ||
      import.meta.env.GROQ_API_KEY ||
      ''
    );
  }
  return '';
};

export const setGroqKey = (key) => {
  if (typeof window !== 'undefined') {
    if (key && key.trim()) localStorage.setItem('tasker_groq_key', key.trim());
    else localStorage.removeItem('tasker_groq_key');
  }
};

export const getOpenRouterKey = () => {
  if (typeof window !== 'undefined') {
    return (
      localStorage.getItem('tasker_openrouter_key') ||
      import.meta.env.VITE_OPENROUTER_API_KEY ||
      import.meta.env.OPENROUTER_API_KEY ||
      ''
    );
  }
  return '';
};

export const setOpenRouterKey = (key) => {
  if (typeof window !== 'undefined') {
    if (key && key.trim()) localStorage.setItem('tasker_openrouter_key', key.trim());
    else localStorage.removeItem('tasker_openrouter_key');
  }
};

export const fetchAIProviders = async () => {
  try {
    const res = await fetch(`${API_BASE}/ai/providers?telegram_id=${currentUser.id}`);
    if (res.ok) return await res.json();
  } catch (e) {}

  return {
    active_provider: 'auto',
    providers: [
      { id: 'auto', name: 'Auto-Fast Cascade (Рекомендуется)', is_default: true },
      { id: 'groq', name: 'Groq LPU (Llama & Whisper)', is_default: false },
      { id: 'openrouter', name: 'OpenRouter Free Models', is_default: false },
      { id: 'gemini', name: 'Google Gemini (3.8 Flash / 3.5 Flash-Lite)', is_default: false },
    ],
  };
};

export const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3-flash-preview',
];

export const GROQ_CHAT_MODELS = [
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
];

export const OPENROUTER_FREE_MODELS = [
  'dots-studio/dots-3-note-preview:free',
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'liquid/lfm-2.5-2.6b:free',
  'openrouter/free',
];

export const normalizeTasks = (parsed, defaultCategory = 'one_time') => {
  if (!parsed) return null;
  let rawList = null;
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (Array.isArray(parsed.tasks)) {
    rawList = parsed.tasks;
  } else if (parsed.task) {
    rawList = [parsed.task];
  } else if (parsed.title) {
    rawList = [parsed];
  }

  if (!rawList || !Array.isArray(rawList) || rawList.length === 0) {
    return null;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const tasks = rawList
    .map((item, idx) => {
      if (!item) return null;
      if (typeof item === 'string') {
        const title = item.trim();
        if (!title) return null;
        const lower = title.toLowerCase();
        const isRoutine = /каждый день|ежедневно|по утрам|по вечерам|привычк/i.test(lower);
        const isGoal = /цель|проект|хочу/i.test(lower);
        let sched = todayStr;
        if (/завтра/i.test(lower)) sched = tomorrowStr;
        return {
          id: `task_${Date.now()}_${idx}`,
          title,
          category: isRoutine ? 'routine' : isGoal ? 'goal' : defaultCategory,
          scheduled_date: isRoutine ? null : sched,
          selected: true,
        };
      }
      if (typeof item === 'object') {
        const title = String(item.title || item.name || item.text || '').trim();
        if (!title) return null;
        let cat = item.category || defaultCategory;
        if (!['routine', 'one_time', 'goal'].includes(cat)) {
          cat = defaultCategory;
        }
        let sched = item.scheduled_date || null;
        if (cat === 'one_time' && !sched) {
          sched = todayStr;
        }
        return {
          id: item.id || `task_${Date.now()}_${idx}`,
          title,
          category: cat,
          scheduled_date: sched,
          description: item.description || null,
          target_value: item.target_value !== undefined && item.target_value !== null ? Number(item.target_value) : null,
          step: item.step !== undefined && item.step !== null ? Number(item.step) : (item.target_value ? 1.0 : null),
          unit: item.unit ? String(item.unit) : null,
          selected: item.selected !== false,
        };
      }
      return null;
    })
    .filter(Boolean);

  if (tasks.length === 0) return null;
  return { tasks };
};

export const parseTextWithDirectGemini = async (text) => {
  const key = getGeminiKey();
  if (!key) return null;
  const todayStr = new Date().toISOString().split('T')[0];
  const prompt = `Ты — интеллектуальный ассистент по планированию задач TaskerBot.
Твоя задача — внимательно проанализировать текст пользователя и извлечь ВСЕ упомянутые задачи.
Если в тексте несколько действий/задач, ОБЯЗАТЕЛЬНО разбей их на отдельные элементы массива "tasks"!
Категории:
1. "routine": регулярные привычки ("каждый день", "ежедневно", "утром")
2. "one_time": разовые задачи ("завтра", "сегодня", "купить", "позвонить")
3. "goal": глобальные цели ("цель", "проект")

Текущая дата: ${todayStr}.
Формат ответа строго валидный JSON с ключом "tasks".
Каждый элемент: {"category": "routine"|"one_time"|"goal", "title": "краткое название задачи", "scheduled_date": "YYYY-MM-DD"|null}
Пример структуры:
{
  "tasks": [
    {
      "title": "Купить молоко",
      "category": "one_time",
      "scheduled_date": "${todayStr}"
    }
  ]
}

Текст пользователя:
${text}`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        }
      );
      if (!res.ok) {
        console.warn(`Direct Gemini model ${model} HTTP status: ${res.status}`);
        continue;
      }
      const data = await res.json();
      const textContent = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
      if (!textContent) continue;
      let cleaned = textContent.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      }
      const parsed = JSON.parse(cleaned);
      const normalized = normalizeTasks(parsed);
      if (normalized && normalized.tasks.length > 0) {
        return normalized;
      }
    } catch (e) {
      console.warn(`Direct Gemini model ${model} error:`, e);
      continue;
    }
  }
  return null;
};

export const parseTextWithDirectGroq = async (text) => {
  const key = getGroqKey();
  if (!key) return null;
  const todayStr = new Date().toISOString().split('T')[0];
  const prompt = `Ты — интеллектуальный ассистент по планированию задач TaskerBot.
Твоя задача — внимательно проанализировать текст пользователя и извлечь ВСЕ упомянутые задачи.
Если в сообщении несколько задач, ОБЯЗАТЕЛЬНО разбей их на отдельные элементы массива "tasks"!
Категории: "routine" (привычки), "one_time" (разовые задачи), "goal" (цели).

Текущая дата: ${todayStr}.
Формат ответа: строгий JSON с ключом "tasks".
Каждый элемент объекта в "tasks": {"category": "routine"|"one_time"|"goal", "title": "краткое название задачи", "scheduled_date": "YYYY-MM-DD"|null}`;

  for (const model of GROQ_CHAT_MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt + ' Ответ должен быть строго в формате JSON с ключом "tasks".' },
            { role: 'user', content: `Текст пользователя:\n${text}` },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });
      if (!res.ok) {
        console.warn(`Direct Groq model ${model} status: ${res.status}`);
        continue;
      }
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content;
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const normalized = normalizeTasks(parsed);
      if (normalized && normalized.tasks.length > 0) {
        return normalized;
      }
    } catch (e) {
      console.warn(`Direct Groq model ${model} error:`, e);
      continue;
    }
  }
  return null;
};

export const parseAudioWithDirectGemini = async (audioBlob) => {
  const key = getGeminiKey();
  if (!key) return null;
  const todayStr = new Date().toISOString().split('T')[0];

  const base64Audio = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      const base64 = typeof result === 'string' ? result.split(',')[1] : '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(audioBlob);
  });

  if (!base64Audio) return null;

  const mimeType = (audioBlob.type || 'audio/webm').split(';')[0];
  const prompt = `Ты — голосовой ассистент по планированию задач TaskerBot.
Внимательно прослушай аудиозапись пользователя, транскрибируй её и извлеки ВСЕ задачи.
Если сказано несколько действий, разбей их на отдельные задачи в массиве "tasks".
Категории: "routine" (привычки), "one_time" (разовые задачи), "goal" (цели).
Текущая дата: ${todayStr}.
Формат ответа: строгий валидный JSON с ключом "tasks".
Каждый элемент: {"category": "routine"|"one_time"|"goal", "title": "название задачи", "scheduled_date": "YYYY-MM-DD"|null}`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: base64Audio,
                    },
                  },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const textContent = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
      if (!textContent) continue;
      let cleaned = textContent.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      }
      const parsed = JSON.parse(cleaned);
      const normalized = normalizeTasks(parsed);
      if (normalized && normalized.tasks.length > 0) {
        return normalized;
      }
    } catch (e) {
      console.warn(`Direct Gemini audio parse error on ${model}:`, e);
      continue;
    }
  }
  return null;
};

export const transcribeWithDirectGroqWhisper = async (audioBlob) => {
  const groqKey = getGroqKey();
  if (!groqKey) return null;

  for (const whisperModel of ['whisper-large-v3-turbo', 'whisper-large-v3']) {
    try {
      const gFormData = new FormData();
      const ext = audioBlob.type && audioBlob.type.includes('webm') ? 'voice.webm' : 'voice.ogg';
      gFormData.append('file', audioBlob, ext);
      gFormData.append('model', whisperModel);
      gFormData.append('response_format', 'json');

      const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
        },
        body: gFormData,
      });

      if (whisperRes.ok) {
        const whisperData = await whisperRes.json();
        const text = whisperData.text && whisperData.text.trim();
        if (text) return text;
      }
    } catch (we) {
      console.warn(`Direct Groq Whisper ${whisperModel} failed:`, we);
    }
  }
  return null;
};

export const parseTextWithDirectOpenRouter = async (text) => {
  const openRouterKey = getOpenRouterKey();
  if (!openRouterKey) return null;

  const todayStr = new Date().toISOString().split('T')[0];
  const systemPrompt = `Ты — интеллектуальный ассистент по планированию задач TaskerBot.
Твоя задача — извлечь ВСЕ упомянутые задачи из текста пользователя.
Текущая дата: ${todayStr}.
Категории:
- routine: регулярные ежедневные дела (каждый день, по утрам)
- one_time: разовые дела (сегодня, завтра, в пятницу)
- goal: глобальные цели и проекты
- subtask: подзадачи для цели

Верни ответ СТРОГО в формате JSON с ключом "tasks":
{"tasks": [{"category": "one_time", "title": "название", "scheduled_date": "YYYY-MM-DD"}]}`;

  for (const model of OPENROUTER_FREE_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://taskerbot.local',
          'X-Title': 'TaskerBot',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Текст пользователя:\n${text}` },
          ],
          temperature: 0.1,
        }),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      const content = msg?.content || msg?.reasoning;
      if (!content) continue;

      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      }
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        cleaned = match[0];
      }
      const parsed = JSON.parse(cleaned);
      const normalized = normalizeTasks(parsed);
      if (normalized && normalized.tasks.length > 0) {
        return normalized;
      }
    } catch (e) {
      console.warn(`Direct OpenRouter failed on model ${model}:`, e);
      continue;
    }
  }
  return null;
};

export const parseSmartText = async (text, provider = null) => {
  // 1. Try Backend API first if reachable
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
    if (res.ok) {
      const data = await res.json();
      const normalized = normalizeTasks(data);
      if (normalized && normalized.tasks.length > 0) return normalized;
    }
  } catch (e) {}

  // 2. Direct Neural AI call (OpenRouter, Groq, or Gemini)
  const chosen = provider || 'auto';

  if (chosen === 'openrouter') {
    // OpenRouter requested
    try {
      const orRes = await parseTextWithDirectOpenRouter(text);
      if (orRes && orRes.tasks && orRes.tasks.length > 0) return orRes;
    } catch (e) {
      console.warn('Direct OpenRouter failed, trying Groq fallback:', e);
    }
    try {
      const gRes = await parseTextWithDirectGroq(text);
      if (gRes && gRes.tasks && gRes.tasks.length > 0) return gRes;
    } catch (e) {}
    try {
      const gemRes = await parseTextWithDirectGemini(text);
      if (gemRes && gemRes.tasks && gemRes.tasks.length > 0) return gemRes;
    } catch (e) {}
  } else if (chosen === 'groq') {
    // Groq requested
    try {
      const gRes = await parseTextWithDirectGroq(text);
      if (gRes && gRes.tasks && gRes.tasks.length > 0) return gRes;
    } catch (e) {
      console.warn('Direct Groq failed, trying OpenRouter fallback:', e);
    }
    try {
      const orRes = await parseTextWithDirectOpenRouter(text);
      if (orRes && orRes.tasks && orRes.tasks.length > 0) return orRes;
    } catch (e) {}
    try {
      const gemRes = await parseTextWithDirectGemini(text);
      if (gemRes && gemRes.tasks && gemRes.tasks.length > 0) return gemRes;
    } catch (e) {}
  } else if (chosen === 'gemini') {
    // Gemini requested
    try {
      const gemRes = await parseTextWithDirectGemini(text);
      if (gemRes && gemRes.tasks && gemRes.tasks.length > 0) return gemRes;
    } catch (e) {
      console.warn('Direct Gemini failed, trying Groq fallback:', e);
    }
    try {
      const gRes = await parseTextWithDirectGroq(text);
      if (gRes && gRes.tasks && gRes.tasks.length > 0) return gRes;
    } catch (e) {}
    try {
      const orRes = await parseTextWithDirectOpenRouter(text);
      if (orRes && orRes.tasks && orRes.tasks.length > 0) return orRes;
    } catch (e) {}
  } else {
    // Auto-Fast cascade: Groq -> OpenRouter -> Gemini
    try {
      const gRes = await parseTextWithDirectGroq(text);
      if (gRes && gRes.tasks && gRes.tasks.length > 0) return gRes;
    } catch (e) {}
    try {
      const orRes = await parseTextWithDirectOpenRouter(text);
      if (orRes && orRes.tasks && orRes.tasks.length > 0) return orRes;
    } catch (e) {}
    try {
      const gemRes = await parseTextWithDirectGemini(text);
      if (gemRes && gemRes.tasks && gemRes.tasks.length > 0) return gemRes;
    } catch (e) {}
  }

  // 3. Fallback NLP rule-based task splitter (splits on Russian conjunctions & task keywords)
  const rawChunks = text
    .split(/(?:[\n;]+|\s+(?:а также|а еще|и еще|а потом|потом|также|плюс|кстати|и)\s+)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const tasks = rawChunks.map((chunk, idx) => {
    const lower = chunk.toLowerCase();
    const isRoutine = /каждый день|ежедневно|по утрам|по вечерам|привычк/i.test(lower);
    const isGoal = /цель|проект|хочу/i.test(lower);
    let schedDate = todayStr;
    if (/завтра/i.test(lower)) schedDate = tomorrowStr;

    const cleanTitle = chunk
      .replace(/^(?:завтра|сегодня|послезавтра|надо|нужно|каждый день|ежедневно|цель:?|проект:?)\s*/i, '')
      .replace(/\b(?:завтра|послезавтра)\b/gi, '')
      .trim();

    return {
      id: `task_${Date.now()}_${idx}`,
      title: cleanTitle || chunk,
      category: isRoutine ? 'routine' : isGoal ? 'goal' : 'one_time',
      scheduled_date: isRoutine ? null : schedDate,
      selected: true,
    };
  });

  return {
    tasks: tasks.length > 0 ? tasks : [{ id: `task_${Date.now()}_0`, title: text, category: 'one_time', selected: true }],
  };
};

export const parseSmartAudio = async (audioBlob, provider = null) => {
  // 1. Try Backend API first if reachable
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
    if (res.ok) {
      const data = await res.json();
      const normalized = normalizeTasks(data);
      if (normalized && normalized.tasks.length > 0) return normalized;
    }
  } catch (e) {}

  const chosen = provider || 'auto';

  // 2. Direct browser AI calls
  // Note: OpenRouter is a text LLM inference service (chat completions) and does not transcribe voice directly.
  // We use Groq Whisper (lightning-fast ~300ms) or Gemini Multimodal Audio to transcribe speech,
  // then pass the transcribed text to the chosen provider (OpenRouter / Groq / Gemini).
  if (chosen === 'gemini') {
    // Gemini chosen: try Gemini Multimodal Audio first
    try {
      const gemRes = await parseAudioWithDirectGemini(audioBlob);
      if (gemRes && gemRes.tasks && gemRes.tasks.length > 0) return gemRes;
    } catch (ge) {
      console.warn('Direct Gemini audio failed, trying Groq Whisper fallback:', ge);
    }
    // Fallback to Groq Whisper transcription + Gemini text parsing
    try {
      const whisperText = await transcribeWithDirectGroqWhisper(audioBlob);
      if (whisperText) {
        return await parseSmartText(whisperText, 'gemini');
      }
    } catch (we) {}
  } else {
    // chosen is 'openrouter', 'groq', or 'auto'
    // Step A: Transcribe via Groq Whisper
    try {
      const whisperText = await transcribeWithDirectGroqWhisper(audioBlob);
      if (whisperText) {
        // Transcribed successfully: parse via chosen provider (OpenRouter / Groq)
        return await parseSmartText(whisperText, chosen);
      }
    } catch (we) {
      console.warn('Direct Groq Whisper failed, trying Gemini audio fallback:', we);
    }

    // Step B: Fallback to Gemini Multimodal Audio
    try {
      const gemRes = await parseAudioWithDirectGemini(audioBlob);
      if (gemRes && gemRes.tasks && gemRes.tasks.length > 0) return gemRes;
    } catch (ge) {}
  }

  // Fallback will trigger browser speech recognition in QuickAddModal
  throw new Error('Голосовая AI транскрипция требует подключения бэкенда или доступа к микрофону.');
};
