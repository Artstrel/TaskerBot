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

const API_BASE = '/api';

export const hapticFeedback = (style = 'medium') => {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
    try {
      window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
    } catch (e) {
      // Ignore if not supported in client
    }
  }
};

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
    console.warn('Failed to sync user timezone:', e);
  }
};

export const fetchDashboard = async () => {
  const res = await fetch(
    `${API_BASE}/dashboard/today?telegram_id=${currentUser.id}&first_name=${encodeURIComponent(
      currentUser.first_name || ''
    )}`
  );
  if (!res.ok) throw new Error('Failed to fetch dashboard');
  return res.json();
};

export const fetchGoals = async () => {
  const res = await fetch(`${API_BASE}/goals?telegram_id=${currentUser.id}`);
  if (!res.ok) throw new Error('Failed to fetch goals');
  return res.json();
};

export const fetchUserSettings = async () => {
  const res = await fetch(`${API_BASE}/user/me?telegram_id=${currentUser.id}`);
  if (!res.ok) throw new Error('Failed to fetch user settings');
  return res.json();
};

export const updateUserSettings = async (settingsData) => {
  const res = await fetch(`${API_BASE}/user/settings?telegram_id=${currentUser.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settingsData),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
};

export const toggleTask = async (taskId, completed = null) => {
  hapticFeedback('light');
  const url = `${API_BASE}/tasks/${taskId}/toggle?telegram_id=${currentUser.id}${
    completed !== null ? `&completed=${completed}` : ''
  }`;
  const res = await fetch(url, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to toggle task');
  return res.json();
};

export const postponeTask = async (taskId, newDateStr) => {
  hapticFeedback('medium');
  const res = await fetch(
    `${API_BASE}/tasks/${taskId}/postpone?telegram_id=${currentUser.id}&new_date=${newDateStr}`,
    { method: 'PATCH' }
  );
  if (!res.ok) throw new Error('Failed to postpone task');
  return res.json();
};

export const deleteTask = async (taskId) => {
  hapticFeedback('warning');
  const res = await fetch(`${API_BASE}/tasks/${taskId}?telegram_id=${currentUser.id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete task');
  return res.json();
};

export const createTask = async (taskData) => {
  hapticFeedback('success');
  const res = await fetch(`${API_BASE}/tasks?telegram_id=${currentUser.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskData),
  });
  if (!res.ok) throw new Error('Failed to create task');
  return res.json();
};

export const toggleRoutine = async (routineId, completed = null) => {
  hapticFeedback('light');
  const url = `${API_BASE}/routines/${routineId}/toggle?telegram_id=${currentUser.id}${
    completed !== null ? `&completed=${completed}` : ''
  }`;
  const res = await fetch(url, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to toggle routine');
  return res.json();
};

export const deleteRoutine = async (routineId) => {
  hapticFeedback('warning');
  const res = await fetch(`${API_BASE}/routines/${routineId}?telegram_id=${currentUser.id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete routine');
  return res.json();
};

export const createRoutine = async (routineData) => {
  hapticFeedback('success');
  const res = await fetch(`${API_BASE}/routines?telegram_id=${currentUser.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(routineData),
  });
  if (!res.ok) throw new Error('Failed to create routine');
  return res.json();
};

export const createGoal = async (goalData) => {
  hapticFeedback('success');
  const res = await fetch(`${API_BASE}/goals?telegram_id=${currentUser.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(goalData),
  });
  if (!res.ok) throw new Error('Failed to create goal');
  return res.json();
};

export const addGoalSubtask = async (goalId, title, scheduledDate = null) => {
  hapticFeedback('light');
  let url = `${API_BASE}/goals/${goalId}/subtasks?telegram_id=${currentUser.id}&title=${encodeURIComponent(
    title
  )}`;
  if (scheduledDate) {
    url += `&scheduled_date=${scheduledDate}`;
  }
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to add goal subtask');
  return res.json();
};

export const deleteGoal = async (goalId) => {
  hapticFeedback('warning');
  const res = await fetch(`${API_BASE}/goals/${goalId}?telegram_id=${currentUser.id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete goal');
  return res.json();
};

export const fetchAIProviders = async () => {
  const res = await fetch(`${API_BASE}/ai/providers?telegram_id=${currentUser.id}`);
  if (!res.ok) throw new Error('Failed to fetch AI providers');
  return res.json();
};

export const parseSmartText = async (text, provider = null) => {
  const formData = new FormData();
  formData.append('text', text);
  if (provider) {
    formData.append('provider', provider);
  }
  const res = await fetch(`${API_BASE}/ai/parse-text?telegram_id=${currentUser.id}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to parse text');
  return res.json();
};

export const parseSmartAudio = async (audioBlob, provider = null) => {
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
  if (!res.ok) throw new Error('Failed to parse audio');
  return res.json();
};

