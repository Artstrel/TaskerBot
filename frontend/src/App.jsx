import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Calendar,
  Target,
  Settings,
  Plus,
  ShoppingCart,
} from 'lucide-react';
import {
  currentUser,
  syncUserTimezone,
  fetchDashboard,
  fetchGoals,
  fetchGroceries,
  getCachedDashboard,
  getCachedGoals,
  getCachedGroceries,
  hapticFeedback,
  getLastUserActionTime,
  hasActivePendingMutations,
  reconcileDashboardWithPending,
  reconcileGoalsWithPending,
  reconcileGroceriesWithPending,
} from './api';
import Mascot from './components/Mascot';
import TodayTab from './components/TodayTab';
import GoalsTab from './components/GoalsTab';
import GroceriesTab from './components/GroceriesTab';
import SettingsTab from './components/SettingsTab';
import QuickAddModal from './components/QuickAddModal';
import { initTheme } from './theme';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('App ErrorBoundary caught error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-primary)', fontFamily: 'sans-serif' }}>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
            <Mascot state="sad" size={64} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Что-то пошло не так</h2>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '20px', maxWidth: '300px', margin: '0 auto 20px' }}>
            {this.state.error?.message || 'Произошла ошибка при отображении интерфейса.'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#ffffff',
              color: '#000000',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Перезагрузить приложение
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('today');
  // Initialize synchronously with cached data for instant 0ms load
  const [dashboardData, setDashboardData] = useState(() => getCachedDashboard());
  const [goalsData, setGoalsData] = useState(() => getCachedGoals());
  const [groceriesData, setGroceriesData] = useState(() => getCachedGroceries());
  const [isLoading, setIsLoading] = useState(!getCachedDashboard());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [warmupTimerElapsed, setWarmupTimerElapsed] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const isQuickAddOpenRef = useRef(isQuickAddOpen);
  isQuickAddOpenRef.current = isQuickAddOpen;
  const [quickAddOptions, setQuickAddOptions] = useState(null);
  const [mascotMood, setMascotMood] = useState('idle');
  const [avatarError, setAvatarError] = useState(false);

  const handleCloseQuickAdd = useCallback(() => {
    setIsQuickAddOpen(false);
    setQuickAddOptions(null);
  }, []);

  useEffect(() => {
    // Initialize Telegram WebApp
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      try {
        tg.enableClosingConfirmation();
      } catch (_) {
        // Not all clients support
      }
      try {
        if (typeof tg.disableVerticalSwipes === 'function') {
          tg.disableVerticalSwipes();
        }
      } catch (_) {
        // Telegram Bot API < 7.7
      }

      const updateTelegramMetrics = () => {
        try {
          const isFullscreen = Boolean(tg.isFullscreen);
          if (isFullscreen) {
            document.documentElement.classList.add('is-tg-fullscreen');
            document.body.classList.add('is-tg-fullscreen');
          } else {
            document.documentElement.classList.remove('is-tg-fullscreen');
            document.body.classList.remove('is-tg-fullscreen');
          }

          const isIOS =
            tg.platform === 'ios' ||
            /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

          if (isIOS) {
            document.documentElement.classList.add('is-ios');
            document.body.classList.add('is-ios');
          } else {
            document.documentElement.classList.remove('is-ios');
            document.body.classList.remove('is-ios');
          }

          const rawSafeTop = tg.safeAreaInset?.top ?? 0;
          const contentSafeTop = tg.contentSafeAreaInset?.top ?? rawSafeTop;
          const safeTop = contentSafeTop;
          const safeBottom = tg.contentSafeAreaInset?.bottom ?? tg.safeAreaInset?.bottom ?? 0;
          const safeLeft = tg.contentSafeAreaInset?.left ?? tg.safeAreaInset?.left ?? 0;
          const safeRight = tg.contentSafeAreaInset?.right ?? tg.safeAreaInset?.right ?? 0;

          document.documentElement.style.setProperty('--tg-raw-safe-top', `${rawSafeTop}px`);
          document.documentElement.style.setProperty('--tg-content-safe-top', `${contentSafeTop}px`);
          document.documentElement.style.setProperty('--tg-safe-top', `${safeTop}px`);
          document.documentElement.style.setProperty('--tg-safe-bottom', `${safeBottom}px`);
          document.documentElement.style.setProperty('--tg-safe-left', `${safeLeft}px`);
          document.documentElement.style.setProperty('--tg-safe-right', `${safeRight}px`);
        } catch (_) {}
      };

      updateTelegramMetrics();
      try {
        tg.onEvent('safeAreaChanged', updateTelegramMetrics);
        tg.onEvent('contentSafeAreaChanged', updateTelegramMetrics);
        tg.onEvent('fullscreenChanged', updateTelegramMetrics);
        tg.onEvent('viewportChanged', updateTelegramMetrics);
      } catch (_) {}
    }

    // Initialize Theme
    initTheme();

    // Auto-sync timezone
    syncUserTimezone();

    // Initial background data load
    loadData();
  }, []);

  // Global desktop keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['c', 'n', 'с', 'т'].includes(e.key.toLowerCase())) {
        const target = e.target;
        const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (!isInput && !isQuickAddOpen) {
          e.preventDefault();
          setQuickAddOptions({
            initialCategory: activeTab === 'groceries' ? 'grocery' : activeTab === 'goals' ? 'goal' : 'one_time',
          });
          setIsQuickAddOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQuickAddOpen, activeTab]);

  const lastFetchedRef = useRef(0);
  const isFetchingRef = useRef(false);
  const latestFetchIdRef = useRef(0);

  const loadData = useCallback(async (forceFullLoading = false, silent = false) => {
    const now = Date.now();
    // Prevent background fetches if user recently clicked a toggle or mutations are pending
    if (!forceFullLoading && (now - getLastUserActionTime() < 4000 || hasActivePendingMutations())) {
      return;
    }
    if (isFetchingRef.current || (!forceFullLoading && now - lastFetchedRef.current < 2500)) {
      return;
    }

    const currentFetchId = ++latestFetchIdRef.current;
    isFetchingRef.current = true;
    lastFetchedRef.current = now;

    if (forceFullLoading || !dashboardData) {
      setIsLoading(true);
    }
    if (!silent) {
      setIsSyncing(true);
    }

    const timer = setTimeout(() => {
      setWarmupTimerElapsed(true);
    }, 2500);

    try {
      const [dash, goals, groceries] = await Promise.all([
        fetchDashboard(),
        fetchGoals(),
        fetchGroceries(),
      ]);

      // If a newer fetch was launched, discard this stale response
      if (currentFetchId !== latestFetchIdRef.current) {
        return;
      }

      if (dash) {
        const reconciledDash = reconcileDashboardWithPending(dash);
        setDashboardData(reconciledDash);
      }
      if (goals) {
        const reconciledGoals = reconcileGoalsWithPending(goals);
        setGoalsData(reconciledGoals);
      }
      if (groceries) {
        const reconciledGroceries = reconcileGroceriesWithPending(groceries);
        setGroceriesData(reconciledGroceries);
      }

      // Check if day is completed to celebrate
      if (dash && dash.total_count > 0 && dash.completed_count === dash.total_count) {
        setMascotMood('done');
      } else {
        setMascotMood('idle');
      }
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      clearTimeout(timer);
      setWarmupTimerElapsed(false);
      setIsLoading(false);
      setIsSyncing(false);
      setIsInitialLoading(false);
      isFetchingRef.current = false;
    }
  }, [dashboardData]);

  // Smart auto-refresh: visibility change, window focus, Telegram WebApp viewport change, and periodic polling
  useEffect(() => {
    const handleSyncOnResume = () => {
      // Do not interrupt active recording, modal interactions, or recent user actions
      if (isQuickAddOpenRef.current) return;
      if (Date.now() - getLastUserActionTime() < 4000) return;
      if (hasActivePendingMutations()) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const timeSince = Date.now() - lastFetchedRef.current;
        if (timeSince > 4000) {
          loadData(false, true);
        }
      }
    };

    const handleWindowFocus = () => {
      if (isQuickAddOpenRef.current) return;
      if (Date.now() - getLastUserActionTime() < 4000) return;
      if (hasActivePendingMutations()) return;
      const timeSince = Date.now() - lastFetchedRef.current;
      if (timeSince > 4000) {
        loadData(false, true);
      }
    };

    document.addEventListener('visibilitychange', handleSyncOnResume);
    window.addEventListener('focus', handleWindowFocus);

    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      try {
        window.Telegram.WebApp.onEvent('viewportChanged', handleSyncOnResume);
      } catch (_) {}
    }

    // Background polling every 18 seconds while document is visible
    const pollInterval = setInterval(() => {
      if (isQuickAddOpenRef.current) return;
      if (Date.now() - getLastUserActionTime() < 4000) return;
      if (hasActivePendingMutations()) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadData(false, true);
      }
    }, 18000);

    return () => {
      document.removeEventListener('visibilitychange', handleSyncOnResume);
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(pollInterval);
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        try {
          window.Telegram.WebApp.offEvent('viewportChanged', handleSyncOnResume);
        } catch (_) {}
      }
    };
  }, [loadData]);

  const handleTaskCelebration = () => {
    // Trigger mascot happy reaction
    setMascotMood('happy');
    setTimeout(() => {
      // Revert to done if day completed or idle
      if (dashboardData && dashboardData.total_count > 0 && (dashboardData.completed_count + 1) >= dashboardData.total_count) {
        setMascotMood('done');
      } else {
        setMascotMood('idle');
      }
    }, 2500);
  };

  const handleTabSwitch = (tab) => {
    hapticFeedback('selection');
    setActiveTab(tab);
    // Silent auto-refresh on tab switch if last fetch was > 4 seconds ago
    if (Date.now() - lastFetchedRef.current > 4000) {
      loadData(false, true);
    }
  };

  const overdueCount = dashboardData?.overdue_tasks?.length || 0;
  const unboughtGroceriesCount = groceriesData?.active_items?.length || 0;

  // Format header date
  const todayFormatted = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

  const handlePillRefresh = useCallback(async () => {
    if (isSyncing || isFetchingRef.current) return;
    hapticFeedback('light');
    try {
      await loadData(true);
      hapticFeedback('success');
    } catch (_) {
      hapticFeedback('error');
    }
  }, [isSyncing, loadData]);

  return (
    <ErrorBoundary>
      <div className="app-shell">
        {/* Desktop Sidebar (hidden on mobile, visible >= 768px) */}
        <aside className="desktop-sidebar">
          {/* Desktop Sidebar Top: Profile Bubble (Tap to refresh) */}
          <div className="sidebar-top-bar">
            <button
              type="button"
              className={`header-profile-bubble ${isSyncing ? 'is-syncing' : ''}`}
              onClick={handlePillRefresh}
              disabled={isSyncing}
              title={isSyncing ? 'Синхронизация с сервером...' : 'Нажмите для обновления'}
              aria-label={isSyncing ? 'Синхронизация данных' : 'Обновить данные'}
              aria-busy={isSyncing}
            >
              <div className="header-avatar-wrapper">
                <div className="header-avatar-circle">
                  {currentUser.photo_url && !avatarError ? (
                    <img
                      src={currentUser.photo_url}
                      alt={currentUser.first_name || 'User'}
                      className="header-avatar-img"
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <span className="header-avatar-initial">
                      {(currentUser.first_name || 'П').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <div className="header-bubble-text">
                <span className="header-bubble-name">{currentUser.first_name || 'TaskerBot'}</span>
                <span className="header-bubble-date">{todayFormatted}</span>
              </div>
            </button>
          </div>

          {/* Sidebar Quick Action Button */}
          <button
            className="sidebar-quick-add-btn"
            onClick={() => {
              hapticFeedback('medium');
              setQuickAddOptions({
                initialCategory: activeTab === 'groceries' ? 'grocery' : activeTab === 'goals' ? 'goal' : 'one_time',
              });
              setIsQuickAddOpen(true);
            }}
            title="Создать задачу или цель (Клавиша C или N)"
          >
            <Plus size={18} strokeWidth={2.4} />
            <span>Добавить</span>
            <kbd className="sidebar-kbd-hint">C</kbd>
          </button>

          {/* Desktop Navigation Menu */}
          <nav className="sidebar-nav">
            <button
              className={`sidebar-nav-item ${activeTab === 'today' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('today')}
              title="Сегодня"
            >
              <Calendar size={18} />
              <span>Сегодня</span>
              {overdueCount > 0 && <span className="dock-badge-dot" />}
            </button>

            <button
              className={`sidebar-nav-item ${activeTab === 'groceries' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('groceries')}
              title="Продукты"
            >
              <ShoppingCart size={18} />
              <span>Продукты</span>
              {unboughtGroceriesCount > 0 && (
                <span className="dock-badge-num">
                  {unboughtGroceriesCount > 99 ? '99+' : unboughtGroceriesCount}
                </span>
              )}
            </button>

            <button
              className={`sidebar-nav-item ${activeTab === 'goals' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('goals')}
              title="Цели & Проекты"
            >
              <Target size={18} />
              <span>Цели & Проекты</span>
            </button>

            <button
              className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('settings')}
              title="Настройки"
            >
              <Settings size={18} />
              <span>Настройки</span>
            </button>
          </nav>
        </aside>

        {/* Main Application Area */}
        <div className="app-main-wrapper">
          {/* Top Sticky Header */}
          <header className="app-header">
            <button
              type="button"
              className={`header-profile-bubble ${isSyncing ? 'is-syncing' : ''}`}
              onClick={handlePillRefresh}
              disabled={isSyncing}
              title={isSyncing ? 'Синхронизация с сервером...' : 'Нажмите для обновления'}
              aria-label={isSyncing ? 'Синхронизация данных' : 'Обновить данные'}
              aria-busy={isSyncing}
            >
              <div className="header-avatar-wrapper">
                <div className="header-avatar-circle">
                  {currentUser.photo_url && !avatarError ? (
                    <img
                      src={currentUser.photo_url}
                      alt={currentUser.first_name || 'User'}
                      className="header-avatar-img"
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <span className="header-avatar-initial">
                      {(currentUser.first_name || 'П').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <div className="header-bubble-text">
                <span className="header-bubble-name">{currentUser.first_name || 'TaskerBot'}</span>
                <span className="header-bubble-date">{todayFormatted}</span>
              </div>
            </button>
          </header>

          {/* Main Content Area */}
          <main className="main-content-viewport">

            <div className="main-content-container">
              {activeTab === 'today' && (
                <TodayTab
                  dashboardData={dashboardData}
                  setDashboardData={setDashboardData}
                  goalsData={goalsData}
                  setGoalsData={setGoalsData}
                  onRefresh={() => loadData(false)}
                  onForceRefresh={() => loadData(true)}
                  isSyncing={isSyncing}
                  isInitialLoading={isInitialLoading}
                  onTaskCompleted={handleTaskCelebration}
                  warmupTimerElapsed={warmupTimerElapsed}
                  onOpenQuickAdd={(opts) => {
                    setQuickAddOptions(opts);
                    setIsQuickAddOpen(true);
                  }}
                />
              )}
              {activeTab === 'groceries' && (
                <GroceriesTab
                  groceriesData={groceriesData}
                  setGroceriesData={setGroceriesData}
                  onRefresh={loadData}
                  onForceRefresh={() => loadData(true)}
                  isSyncing={isSyncing}
                  onOpenQuickAdd={(opts) => {
                    setQuickAddOptions(opts);
                    setIsQuickAddOpen(true);
                  }}
                />
              )}
              {activeTab === 'goals' && (
                <GoalsTab
                  goalsData={goalsData}
                  setGoalsData={setGoalsData}
                  dashboardData={dashboardData}
                  setDashboardData={setDashboardData}
                  onRefresh={loadData}
                  onForceRefresh={() => loadData(true)}
                  isSyncing={isSyncing}
                  onOpenQuickAdd={(opts) => {
                    setQuickAddOptions(opts);
                    setIsQuickAddOpen(true);
                  }}
                />
              )}
              {activeTab === 'settings' && (
                <SettingsTab
                  onRefresh={loadData}
                  onForceRefresh={() => loadData(true)}
                  isSyncing={isSyncing}
                />
              )}
            </div>
          </main>

          {/* Floating Action Button (FAB) for Mobile Quick Add */}
          {(activeTab === 'today' || activeTab === 'groceries' || activeTab === 'goals') && (
            <button
              className="app-fab mobile-only-fab"
              onClick={() => {
                hapticFeedback('medium');
                setQuickAddOptions({
                  initialCategory: activeTab === 'groceries' ? 'grocery' : activeTab === 'goals' ? 'goal' : 'one_time',
                });
                setIsQuickAddOpen(true);
              }}
              title={activeTab === 'groceries' ? "Добавить продукт" : activeTab === 'goals' ? "Создать цель" : "Создать задачу"}
              aria-label={activeTab === 'groceries' ? "Добавить продукт" : activeTab === 'goals' ? "Создать цель" : "Создать задачу"}
            >
              <Plus size={24} strokeWidth={2.4} />
            </button>
          )}

          {/* Bottom Floating Navigation Dock for Mobile */}
          <nav className="bottom-dock mobile-only-dock">
            <div className="dock-card">
              <button
                className={`dock-nav-item ${activeTab === 'today' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('today')}
              >
                <Calendar size={18} />
                <span>Сегодня</span>
                {overdueCount > 0 && <span className="dock-badge-dot" />}
              </button>

              <button
                className={`dock-nav-item ${activeTab === 'groceries' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('groceries')}
              >
                <ShoppingCart size={18} />
                <span>Продукты</span>
                {unboughtGroceriesCount > 0 && (
                  <span className="dock-badge-num">
                    {unboughtGroceriesCount > 99 ? '99+' : unboughtGroceriesCount}
                  </span>
                )}
              </button>

              <button
                className={`dock-nav-item ${activeTab === 'goals' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('goals')}
              >
                <Target size={18} />
                <span>Цели</span>
              </button>

              <button
                className={`dock-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('settings')}
              >
                <Settings size={18} />
                <span>Настройки</span>
              </button>
            </div>
          </nav>
        </div>

      {/* Quick Add Bottom Sheet Modal */}
      {isQuickAddOpen && (
        <QuickAddModal
          onClose={handleCloseQuickAdd}
          onTaskCreated={loadData}
          setDashboardData={setDashboardData}
          setGoalsData={setGoalsData}
          setGroceriesData={setGroceriesData}
          goalsData={goalsData}
          groceriesData={groceriesData}
          initialCategory={quickAddOptions?.initialCategory}
          initialGoalId={quickAddOptions?.initialGoalId}
          initialGoalTitle={quickAddOptions?.initialGoalTitle}
          autoStartVoice={quickAddOptions?.autoStartVoice}
          editingItem={quickAddOptions?.editingItem}
          editingType={quickAddOptions?.editingType}
        />
      )}
      </div>
    </ErrorBoundary>
  );
}
