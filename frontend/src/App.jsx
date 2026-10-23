import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Target,
  Settings,
  Plus,
  RotateCw,
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
} from './api';
import Mascot from './components/Mascot';
import TodayTab from './components/TodayTab';
import GoalsTab from './components/GoalsTab';
import GroceriesTab from './components/GroceriesTab';
import SettingsTab from './components/SettingsTab';
import QuickAddModal from './components/QuickAddModal';

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
  const [warmupTimerElapsed, setWarmupTimerElapsed] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddOptions, setQuickAddOptions] = useState(null);
  const [mascotMood, setMascotMood] = useState('idle');

  useEffect(() => {
    // Initialize Telegram WebApp
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      try {
        tg.enableClosingConfirmation();
      } catch (e) {
        // Not all clients support
      }
    }

    // Auto-sync timezone
    syncUserTimezone();

    // Initial background data load
    loadData();
  }, []);

  const loadData = async (forceFullLoading = false) => {
    if (forceFullLoading || !dashboardData) {
      setIsLoading(true);
    }
    setIsSyncing(true);

    const timer = setTimeout(() => {
      setWarmupTimerElapsed(true);
    }, 2500);

    try {
      const [dash, goals, groceries] = await Promise.all([
        fetchDashboard(),
        fetchGoals(),
        fetchGroceries(),
      ]);
      if (dash) {
        setDashboardData(dash);
      }
      if (goals) {
        setGoalsData(goals);
      }
      if (groceries) {
        setGroceriesData(groceries);
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
    }
  };

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
  };

  const overdueCount = dashboardData?.overdue_tasks?.length || 0;
  const unboughtGroceriesCount = groceriesData?.active_items?.length || 0;

  // Format header date
  const todayFormatted = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

  return (
    <ErrorBoundary>
      <div className="app-container">
      {/* Minimalist Top Sticky Header */}
      <header className="app-header">
        <div className="header-companion-group">
          <div className="header-mascot-wrapper">
            <Mascot
              state={mascotMood}
              size={34}
              interactive={true}
              onClick={() => {
                setMascotMood((prev) => (prev === 'idle' ? 'happy' : 'idle'));
              }}
            />
          </div>
          <div className="header-titles">
            <div className="header-title-main">
              {currentUser.first_name || 'TaskerBot'}
            </div>
            <div className="header-subtitle">
              {todayFormatted}
              {activeTab === 'groceries'
                ? ' • Список продуктов'
                : activeTab === 'goals'
                ? ' • Проекты & Цели'
                : activeTab === 'settings'
                ? ' • Параметры'
                : ''}
            </div>
          </div>
        </div>

        <div className="header-actions">
          {isSyncing && (
            <span className="sync-badge" title="Синхронизация с сервером...">
              <span className="sync-dot" />
              Синхронизация
            </span>
          )}
          <button
            className="header-icon-btn"
            onClick={() => {
              hapticFeedback('light');
              loadData(true);
            }}
            title="Обновить данные"
          >
            <RotateCw size={15} className={isSyncing ? 'spin-icon' : ''} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        {activeTab === 'today' && (
          <TodayTab
            dashboardData={dashboardData}
            setDashboardData={setDashboardData}
            onRefresh={() => loadData(false)}
            onTaskCompleted={handleTaskCelebration}
            warmupTimerElapsed={warmupTimerElapsed}
          />
        )}
        {activeTab === 'groceries' && (
          <GroceriesTab
            groceriesData={groceriesData}
            setGroceriesData={setGroceriesData}
            onRefresh={loadData}
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
            onOpenQuickAdd={(opts) => {
              setQuickAddOptions(opts);
              setIsQuickAddOpen(true);
            }}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab
            onRefresh={loadData}
          />
        )}
      </main>

      {/* Floating Action Button (FAB) for Quick Add */}
      {(activeTab === 'today' || activeTab === 'groceries' || activeTab === 'goals') && (
        <button
          className="app-fab"
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

      {/* Bottom Floating Navigation Dock */}
      <nav className="bottom-dock">
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

      {/* Quick Add Bottom Sheet Modal */}
      {isQuickAddOpen && (
        <QuickAddModal
          onClose={() => {
            setIsQuickAddOpen(false);
            setQuickAddOptions(null);
          }}
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
        />
      )}
      </div>
    </ErrorBoundary>
  );
}
