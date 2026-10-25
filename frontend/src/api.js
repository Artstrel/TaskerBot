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

export const getCachedGroceries = () => {
  if (typeof window === 'undefined') return { active_items: [], completed_items: [], total_count: 0, completed_count: 0 };
  try {
    const raw = localStorage.getItem(`tasker_cache_groceries_${currentUser.id}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { active_items: [], completed_items: [], total_count: 0, completed_count: 0 };
};

export const setCachedGroceries = (data) => {
  if (typeof window === 'undefined' || !data) return;
  try {
    localStorage.setItem(`tasker_cache_groceries_${currentUser.id}`, JSON.stringify(data));
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
      praise_notifications_enabled: true,
      morning_digest_enabled: true,
      morning_digest_time: '09:00',
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

export const fetchGroceries = async () => {
  try {
    const res = await fetch(`${API_BASE}/groceries?telegram_id=${currentUser.id}`);
    if (res.ok) {
      const data = await res.json();
      setCachedGroceries(data);
      return data;
    }
  } catch (e) {}

  const db = getLocalDb();
  const groceries = db.groceries || { active_items: [], completed_items: [], total_count: 0, completed_count: 0 };
  setCachedGroceries(groceries);
  return groceries;
};

export const createGroceryItem = async (groceryData) => {
  hapticFeedback('light');
  try {
    const res = await fetch(`${API_BASE}/groceries?telegram_id=${currentUser.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(groceryData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  if (!db.groceries) db.groceries = { active_items: [], completed_items: [], total_count: 0, completed_count: 0 };
  const newItem = {
    id: Date.now(),
    user_id: currentUser.id,
    title: groceryData.title,
    target_value: groceryData.target_value || null,
    current_value: 0,
    step: groceryData.step || 1.0,
    unit: groceryData.unit || null,
    is_completed: false,
    created_at: new Date().toISOString(),
  };
  db.groceries.active_items.unshift(newItem);
  db.groceries.total_count += 1;
  saveLocalDb(db);
  setCachedGroceries(db.groceries);
  return newItem;
};

export const updateGroceryItem = async (itemId, updateData) => {
  hapticFeedback('light');
  try {
    const res = await fetch(`${API_BASE}/groceries/${itemId}?telegram_id=${currentUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  if (!db.groceries) db.groceries = { active_items: [], completed_items: [], total_count: 0, completed_count: 0 };
  let found = db.groceries.active_items.find((i) => i.id === itemId);
  if (!found) found = db.groceries.completed_items.find((i) => i.id === itemId);
  if (found) {
    Object.assign(found, updateData);
    if (updateData.is_completed !== undefined) {
      if (updateData.is_completed) {
        db.groceries.active_items = db.groceries.active_items.filter((i) => i.id !== itemId);
        if (!db.groceries.completed_items.some((i) => i.id === itemId)) {
          db.groceries.completed_items.unshift(found);
        }
      } else {
        db.groceries.completed_items = db.groceries.completed_items.filter((i) => i.id !== itemId);
        if (!db.groceries.active_items.some((i) => i.id === itemId)) {
          db.groceries.active_items.unshift(found);
        }
      }
      db.groceries.completed_count = db.groceries.completed_items.length;
    }
    saveLocalDb(db);
    setCachedGroceries(db.groceries);
    return found;
  }
  return { id: itemId, ...updateData };
};

export const deleteGroceryItem = async (itemId) => {
  hapticFeedback('medium');
  try {
    const res = await fetch(`${API_BASE}/groceries/${itemId}?telegram_id=${currentUser.id}`, {
      method: 'DELETE',
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  if (db.groceries) {
    db.groceries.active_items = (db.groceries.active_items || []).filter((i) => i.id !== itemId);
    db.groceries.completed_items = (db.groceries.completed_items || []).filter((i) => i.id !== itemId);
    db.groceries.total_count = db.groceries.active_items.length + db.groceries.completed_items.length;
    db.groceries.completed_count = db.groceries.completed_items.length;
    saveLocalDb(db);
    setCachedGroceries(db.groceries);
  }
  return { status: 'deleted' };
};

export const clearCompletedGroceries = async () => {
  hapticFeedback('medium');
  try {
    const res = await fetch(`${API_BASE}/groceries/clear-completed?telegram_id=${currentUser.id}`, {
      method: 'POST',
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  if (db.groceries) {
    db.groceries.completed_items = [];
    db.groceries.completed_count = 0;
    db.groceries.total_count = db.groceries.active_items.length;
    saveLocalDb(db);
    setCachedGroceries(db.groceries);
  }
  return { status: 'cleared' };
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

export const sendTestNotification = async () => {
  hapticFeedback('medium');
  try {
    const res = await fetch(`${API_BASE}/notifications/test?telegram_id=${currentUser.id}`, {
      method: 'POST',
    });
    if (res.ok) return await res.json();
    const data = await res.json().catch(() => ({}));
    return { error: data.detail || 'Не удалось отправить тестовое уведомление' };
  } catch (e) {
    return { error: e.message || 'Ошибка сети при отправке уведомления' };
  }
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
    priority: taskData.priority || 0,
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
    frequency_type: routineData.frequency_type || 'daily',
    interval_days: routineData.interval_days || 1,
    days_of_week: routineData.days_of_week || null,
    start_date: routineData.start_date || null,
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

export const toggleGoal = async (goalId, isCompleted = null) => {
  hapticFeedback('medium');
  try {
    let url = `${API_BASE}/goals/${goalId}/toggle?telegram_id=${currentUser.id}`;
    if (isCompleted !== null && isCompleted !== undefined) {
      url += `&completed=${isCompleted}`;
    }
    const res = await fetch(url, { method: 'PATCH' });
    if (res.ok) return await res.json();
  } catch (e) {}

  const db = getLocalDb();
  const goal = (db.goals || []).find((g) => g.id === goalId);
  if (goal) {
    goal.is_completed = isCompleted !== null ? isCompleted : !goal.is_completed;
    goal.completed_at = goal.is_completed ? new Date().toISOString() : null;
    if (goal.is_completed && goal.subtasks) {
      goal.subtasks.forEach((st) => {
        st.is_completed = true;
      });
    }
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
  'gemini-flash-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
];

export const GROQ_CHAT_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
];

export const OPENROUTER_FREE_MODELS = [
  'liquid/lfm-2.5-2.6b:free',
  'openrouter/free',
  'dots-studio/dots-3-note-preview:free',
  'nvidia/nemotron-3.5-lightning:free',
];

export const capitalizeFirst = (text) => {
  if (!text || typeof text !== 'string') return text || '';
  const s = text.trim();
  if (!s) return s;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch.toLowerCase() !== ch.toUpperCase()) {
      return s.slice(0, i) + ch.toUpperCase() + s.slice(i + 1);
    }
    if (/\d/.test(ch)) {
      return s;
    }
    if (!/['"«“‘`(\[]/.test(ch)) {
      return s;
    }
  }
  return s;
};

export const GROCERY_KEYWORDS = [
  'молок[оае]?', 'сливк[\\p{L}]*', 'кефир[\\p{L}]*', 'творог[\\p{L}]*', 'йогурт[\\p{L}]*', 'сметан[\\p{L}]*', 'сыр[\\p{L}]*', 'масл[\\p{L}]*',
  'хлеб[\\p{L}]*', 'батон[\\p{L}]*', 'булк[\\p{L}]*', 'лаваш[\\p{L}]*', 'выпечк[\\p{L}]*',
  'яйц[\\p{L}]*',
  'мяс[\\p{L}]*', 'куриц[\\p{L}]*', 'говядин[\\p{L}]*', 'свинин[\\p{L}]*', 'индейк[\\p{L}]*', 'фарш[\\p{L}]*', 'сосиск[\\p{L}]*', 'колбас[\\p{L}]*', 'ветчин[\\p{L}]*', 'бекон[\\p{L}]*',
  'рыб[\\p{L}]*', 'лосос[\\p{L}]*', 'форел[\\p{L}]*', 'селедк[\\p{L}]*', 'тун[ец][\\p{L}]*', 'креветк[\\p{L}]*',
  'овощ[\\p{L}]*', 'помидор[\\p{L}]*', 'огурц[\\p{L}]*', 'карто[фш][\\p{L}]*', 'морков[\\p{L}]*', 'лук', 'чеснок[\\p{L}]*', 'капуст[\\p{L}]*', 'свекл[\\p{L}]*', 'кабач[\\p{L}]*', 'баклажан[\\p{L}]*', 'перец[\\p{L}]*', 'зелен[\\p{L}]*', 'укроп[\\p{L}]*', 'петрушк[\\p{L}]*', 'салат[\\p{L}]*', 'шпинат[\\p{L}]*', 'броккол[\\p{L}]*', 'авокадо', 'гриб[\\p{L}]*', 'шампиньон[\\p{L}]*',
  'фрукт[\\p{L}]*', 'яблок[\\p{L}]*', 'банан[\\p{L}]*', 'апельсин[\\p{L}]*', 'мандарин[\\p{L}]*', 'лимон[\\p{L}]*', 'груш[\\p{L}]*', 'виноград[\\p{L}]*', 'персик[\\p{L}]*', 'ягод[\\p{L}]*', 'клубник[\\p{L}]*', 'малин[\\p{L}]*', 'черник[\\p{L}]*',
  'круп[\\p{L}]*', 'рис', 'гречк[\\p{L}]*', 'макарон[\\p{L}]*', 'спагетт[\\p{L}]*', 'паст[аеу]', 'овсянк[\\p{L}]*', 'хлопь[\\p{L}]*', 'мук[аеу]', 'сахар[\\p{L}]*', 'сол[ьи]',
  'кетчуп[\\p{L}]*', 'майонез[\\p{L}]*', 'соус[\\p{L}]*', 'пицц[\\p{L}]*',
  'чай', 'кофе', 'сок', 'вод[аеуы]', 'минералк[\\p{L}]*', 'газировк[\\p{L}]*', 'квас[\\p{L}]*', 'лимонад[\\p{L}]*', 'пив[оа]', 'вин[оа]',
  'шоколад[\\p{L}]*', 'печень[\\p{L}]*', 'конфет[\\p{L}]*', 'торт[\\p{L}]*', 'вафл[\\p{L}]*', 'мед', 'орех[\\p{L}]*', 'чипс[\\p{L}]*',
  'порошок[\\p{L}]*', 'мыл[оа]', 'шампун[\\p{L}]*', 'гель\\s+для\\s+душа', 'зубн[\\p{L}]*\\s+паст[\\p{L}]*', 'зубн[\\p{L}]*\\s+щетк[\\p{L}]*', 'туалетн[\\p{L}]*\\s+бумаг[\\p{L}]*', 'салфетк[\\p{L}]*', 'губк[\\p{L}]*\\s+для\\s+посуды', 'моющее', 'мусорн[\\p{L}]*\\s+пакет[\\p{L}]*', 'пакет[\\p{L}]*\\s+для\\s+мусора', 'батарейк[\\p{L}]*', 'корм[\\p{L}]*',
  'продукт[\\p{L}]*', 'покупк[\\p{L}]*'
].join('|');

export const GROCERY_RE = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${GROCERY_KEYWORDS})(?=[^\\p{L}\\p{N}]|$)`, 'iu');

export const CLEAN_GROCERY_PREFIX_RE = new RegExp(
  '^(?:купить|докупить|взять|приобрести|заказать|захватить)' +
  '(?:\\s+(?:в\\s+магазине|в\\s+супермаркете|домой|к\\s+чаю|в\\s+список\\s+(?:продуктов|покупок)))?\\s*[:\\-]?\\s*|' +
  '^(?:список\\s+(?:продуктов|покупок)|в\\s+список\\s+(?:продуктов|покупок))\\s*[:\\-]?\\s*',
  'iu'
);

export const isGroceryText = (text) => {
  if (!text || typeof text !== 'string') return false;
  return GROCERY_RE.test(text);
};

export const cleanGroceryTitle = (text) => {
  if (!text || typeof text !== 'string') return '';
  const cleaned = text.replace(CLEAN_GROCERY_PREFIX_RE, '').trim();
  return capitalizeFirst(cleaned || text);
};

export const HALLUCINATION_PATTERNS = [
  /продолжение\s+следует.*/i,
  /(?:(?:русские\s+)?субтитр[ыа-я]*(?:\s*(?:сделал\w*|создал\w*|создавал\w*|подготовил\w*|перевел\w*|от|:)).*|субтитр[ыа-я]*$)/i,
  /редактор\s+субтитр[ыа-я]*.*/i,
  /корректор\s+субтитр[ыа-я]*.*/i,
  /автор\s+субтитр[ыа-я]*.*/i,
  /спасибо\s+за\s+просмотр.*/i,
  /ставьте\s+лайк[иа-я]*/i,
  /подписывайтесь.*/i,
  /лайк\s+и\s+подписк[а-я]*/i,
  /колокольчик[а-я]*/i,
  /переведено\s+сообществом.*/i,
  /всем\s+пока.*/i,
  /до\s+новых\s+встреч.*/i,
  /amara\.org/i,
  /www\.[a-z0-9\-]+\.[a-z]{2,}/i,
  /http[s]?:\/\//i,
  /благодарю\s+за\s+внимание.*/i,
  /конец\s+связи/i,
  /трансляция\s+завершена/i,
  /не\s+забудьте\s+подписаться.*/i,
  /смотреть\s+далее.*/i,
  /оставайтесь\s+с\s+нами.*/i,
  /приятного\s+просмотра.*/i,
  /thank\s+you\s+for\s+watching.*/i,
  /please\s+subscribe.*/i,
  /like\s+and\s+subscribe.*/i,
];

export const stripWhisperHallucinations = (text) => {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text.trim();
  for (const pat of HALLUCINATION_PATTERNS) {
    if (/(?:написать|сделать|подготовить|добавить|исправить|отредактировать|вставить)\s+субтитр/i.test(cleaned)) {
      continue;
    }
    const trailingRe = new RegExp(`(?:[.,!?;\\s]|^)${pat.source}[.,!?;\\s]*$`, 'iu');
    cleaned = cleaned.replace(trailingRe, '').trim();
    const leadingRe = new RegExp(`^[.,!?;\\s]*${pat.source}(?:[.,!?;\\s]|$)`, 'iu');
    cleaned = cleaned.replace(leadingRe, '').trim();
  }
  return cleaned.trim();
};

export const isHallucinationOrNoise = (text) => {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  const meaningful = trimmed.replace(/[^\p{L}\p{N}]/gu, '');
  if (meaningful.length < 2) return true;

  const stripped = stripWhisperHallucinations(trimmed);
  const meaningfulAfter = stripped.replace(/[^\p{L}\p{N}]/gu, '');
  if (meaningfulAfter.length < 2) {
    const isLegit = /(?:написать|сделать|подготовить|добавить|исправить|отредактировать|вставить)\s+субтитр/i.test(trimmed);
    if (!isLegit) return true;
  }

  const words = trimmed.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (words.length >= 4) {
    const counts = {};
    for (const w of words) counts[w] = (counts[w] || 0) + 1;
    const maxCnt = Math.max(...Object.values(counts));
    if (maxCnt >= 4 && maxCnt / words.length >= 0.5) return true;
  }

  return false;
};

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
        let rawTitle = stripWhisperHallucinations(item.trim());
        if (!rawTitle || isHallucinationOrNoise(rawTitle)) return null;
        if (/не удалось расшифровать|голосовая заметка \(не удалось/i.test(rawTitle)) return null;

        const isRoutine = /каждый день|ежедневно|по утрам|по вечерам|привычк/i.test(rawTitle);
        const isGoal = /цель|проект|хочу/i.test(rawTitle);
        const isGroc = isGroceryText(rawTitle);

        let sched = todayStr;
        if (/завтра/i.test(rawTitle)) sched = tomorrowStr;
        if (isGroc || isRoutine) sched = null;

        const title = isGroc ? cleanGroceryTitle(rawTitle) : capitalizeFirst(rawTitle);
        const cat = isGroc ? 'grocery' : isRoutine ? 'routine' : isGoal ? 'goal' : defaultCategory;

        return {
          id: `task_${Date.now()}_${idx}`,
          title,
          category: cat,
          scheduled_date: sched,
          selected: true,
        };
      }
      if (typeof item === 'object') {
        let rawTitle = stripWhisperHallucinations(String(item.title || item.name || item.text || '').trim());
        if (!rawTitle || isHallucinationOrNoise(rawTitle)) return null;
        if (/не удалось расшифровать|голосовая заметка \(не удалось/i.test(rawTitle)) return null;

        let cat = item.category || defaultCategory;
        if (!['routine', 'one_time', 'goal', 'subtask', 'grocery'].includes(cat)) {
          cat = defaultCategory;
        }

        const isGroc = cat === 'grocery' || isGroceryText(rawTitle);
        let title = isGroc ? cleanGroceryTitle(rawTitle) : capitalizeFirst(rawTitle);
        let sched = item.scheduled_date || null;

        if (isGroc) {
          cat = 'grocery';
          sched = null;
        } else if (cat === 'one_time' && !sched) {
          sched = todayStr;
        }

        const goalTitle = item.goal_title ? capitalizeFirst(String(item.goal_title)) : null;
        return {
          id: item.id || `task_${Date.now()}_${idx}`,
          title,
          category: cat,
          scheduled_date: sched,
          description: item.description || null,
          goal_title: goalTitle,
          goal_id: item.goal_id || null,
          target_date: item.target_date || null,
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
2. "one_time": разовые задачи ("завтра", "сегодня", "позвонить", "сделать", "купить ноутбук")
3. "goal": глобальные цели ("цель", "проект")
4. "grocery": продукты питания, напитки, еда, бытовая химия ("молоко", "хлеб", "сыр", "яйца", "в список продуктов", "купить в магазине")

ВАЖНО:
- Все продукты питания, еду, напитки и бытовую химию ВСЕГДА классифицируй как "grocery" со "scheduled_date": null!
- Для категории "grocery" в поле "title" пиши только сам продукт без слова "Купить" (например: "Молоко 2 л", "Сыр", "Хлеб")!
- Разовые дела, услуги и покупку крупной техники ("купить ноутбук", "купить билеты") классифицируй как "one_time".
- Название каждой задачи ("title") ВСЕГДА пиши с большой (заглавной) буквы (например: "Позвонить врачу", "Молоко 2 л")!

Текущая дата: ${todayStr}.
Формат ответа строго валидный JSON с ключом "tasks".
Каждый элемент: {"category": "routine"|"one_time"|"goal"|"grocery", "title": "краткое название задачи с большой буквы", "scheduled_date": "YYYY-MM-DD"|null}
Пример структуры:
{
  "tasks": [
    {
      "title": "Молоко 2 л",
      "category": "grocery",
      "scheduled_date": null
    },
    {
      "title": "Позвонить врачу",
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
Категории: "routine" (привычки), "one_time" (разовые задачи), "goal" (цели), "grocery" (продукты, напитки, еда, бытовая химия).

ВАЖНО:
- Все продукты питания, еду, напитки и бытовые товары ВСЕГДА относи к "grocery" со "scheduled_date": null!
- В поле "title" для продуктов пиши только сам продукт без слова "Купить" (например: "Молоко 2 л", "Хлеб")!
- Название каждой задачи ("title") ВСЕГДА пиши с большой (заглавной) буквы (например: "Позвонить врачу", "Молоко 2 л")!

Текущая дата: ${todayStr}.
Формат ответа: строгий JSON с ключом "tasks".
Каждый элемент объекта в "tasks": {"category": "routine"|"one_time"|"goal"|"grocery", "title": "краткое название задачи с большой буквы", "scheduled_date": "YYYY-MM-DD"|null}
Пример: {"tasks": [{"category": "grocery", "title": "Молоко 2 л", "scheduled_date": null}, {"category": "one_time", "title": "Позвонить врачу", "scheduled_date": "${todayStr}"}]}`;

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
      const msg = data.choices?.[0]?.message;
      let raw = (msg?.content && msg.content.trim()) || (msg?.reasoning && msg.reasoning.trim());
      if (!raw) continue;
      if (raw.includes('```')) {
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (jsonErr) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch (_) {
            continue;
          }
        } else {
          continue;
        }
      }
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
Категории: "routine" (привычки), "one_time" (разовые задачи), "goal" (цели), "grocery" (продукты, напитки, еда, бытовая химия).
Текущая дата: ${todayStr}.
Формат ответа: строгий валидный JSON с ключом "tasks".
Каждый элемент: {"category": "routine"|"one_time"|"goal"|"grocery", "title": "название задачи", "scheduled_date": "YYYY-MM-DD"|null}`;

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
      let ext = 'voice.webm';
      if (audioBlob.type) {
        if (audioBlob.type.includes('mp4') || audioBlob.type.includes('m4a') || audioBlob.type.includes('aac')) {
          ext = 'voice.mp4';
        } else if (audioBlob.type.includes('ogg')) {
          ext = 'voice.ogg';
        } else if (audioBlob.type.includes('wav')) {
          ext = 'voice.wav';
        }
      }
      gFormData.append('file', audioBlob, ext);
      gFormData.append('model', whisperModel);
      gFormData.append('language', 'ru');
      gFormData.append('temperature', '0.0');
      gFormData.append('prompt', 'Задачи, список дел, покупки, рутины, напоминания на день. Запиши точно без лишних слов.');
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
        if (text) {
          const stripped = stripWhisperHallucinations(text);
          if (!isHallucinationOrNoise(stripped)) {
            const clean = stripped.replace(/[^\p{L}\d]/gu, '').trim();
            if (clean.length >= 2) return stripped;
          }
        }
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
- one_time: разовые дела (сегодня, завтра, в пятницу, купить ноутбук)
- goal: глобальные цели и проекты
- subtask: подзадачи для цели
- grocery: продукты питания, напитки, еда, бытовая химия (молоко, хлеб, яйца)

ВАЖНО:
- Все продукты питания, еду, напитки и бытовую химию ВСЕГДА классифицируй как "grocery" со "scheduled_date": null!
- В названии "title" для продуктов пиши только сам продукт без слова "Купить" (например: "Молоко 2 л", "Хлеб")!
- Название каждой задачи ("title") ВСЕГДА пиши с большой (заглавной) буквы (например: "Позвонить врачу", "Молоко 2 л", "Сделать зарядку")!

Верни ответ СТРОГО в формате JSON с ключом "tasks":
{"tasks": [{"category": "grocery", "title": "Молоко 2 л", "scheduled_date": null}, {"category": "one_time", "title": "Позвонить врачу", "scheduled_date": "YYYY-MM-DD"}]}`;

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
    const isGroc = isGroceryText(chunk);

    let schedDate = todayStr;
    if (/завтра/i.test(lower)) schedDate = tomorrowStr;
    if (isGroc || isRoutine) schedDate = null;

    let cleanTitle;
    if (isGroc) {
      cleanTitle = cleanGroceryTitle(chunk);
    } else {
      cleanTitle = capitalizeFirst(
        chunk
          .replace(/^(?:завтра|сегодня|послезавтра|надо|нужно|каждый день|ежедневно|цель:?|проект:?)\s*/i, '')
          .replace(/\b(?:завтра|послезавтра)\b/gi, '')
          .trim()
      );
    }

    return {
      id: `task_${Date.now()}_${idx}`,
      title: cleanTitle || capitalizeFirst(chunk),
      category: isGroc ? 'grocery' : isRoutine ? 'routine' : isGoal ? 'goal' : 'one_time',
      scheduled_date: schedDate,
      selected: true,
    };
  });

  const isWholeTextGroc = isGroceryText(text);
  const defaultTask = {
    id: `task_${Date.now()}_0`,
    title: isWholeTextGroc ? cleanGroceryTitle(text) : capitalizeFirst(text),
    category: isWholeTextGroc ? 'grocery' : 'one_time',
    scheduled_date: isWholeTextGroc ? null : todayStr,
    selected: true,
  };

  return {
    tasks: tasks.length > 0 ? tasks : [defaultTask],
  };
};

export const parseSmartAudio = async (audioBlob, provider = null) => {
  // 1. Try Backend API first if reachable
  try {
    const formData = new FormData();
    let ext = 'voice.webm';
    if (audioBlob.type) {
      if (audioBlob.type.includes('mp4') || audioBlob.type.includes('m4a')) ext = 'voice.mp4';
      else if (audioBlob.type.includes('ogg')) ext = 'voice.ogg';
      else if (audioBlob.type.includes('wav')) ext = 'voice.wav';
    }
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
    } else {
      console.warn('Backend audio parse returned status:', res.status);
    }
  } catch (e) {
    console.warn('Backend audio parse error:', e);
  }

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
