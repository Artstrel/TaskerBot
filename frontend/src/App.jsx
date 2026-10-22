import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Target,
  Settings,
  Plus,
  RotateCw,
} from 'lucide-react';
import {
  currentUser,
  syncUserTimezone,
  fetchDashboard,
  fetchGoals,
  hapticFeedback,
} from './api';
import Mascot from './components/Mascot';
import TodayTab from './components/TodayTab';
import GoalsTab from './components/GoalsTab';
import SettingsTab from './components/SettingsTab';
import QuickAddModal from './components/QuickAddModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('today');
  const [dashboardData, setDashboardData] = useState(null);
  const [goalsData, setGoalsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
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

    // Initial data load
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [dash, goals] = await Promise.all([fetchDashboard(), fetchGoals()]);
      setDashboardData(dash);
      setGoalsData(goals);

      // Check if day is completed to celebrate
      if (dash && dash.total_count > 0 && dash.completed_count === dash.total_count) {
        setMascotMood('done');
      } else {
        setMascotMood('idle');
      }
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setIsLoading(false);
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

  // Format header date
  const todayFormatted = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

  return (
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
              {activeTab === 'goals' ? ' • Проекты & Цели' : activeTab === 'settings' ? ' • Параметры' : ''}
            </div>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="header-icon-btn"
            onClick={() => {
              hapticFeedback('light');
              loadData();
            }}
            title="Обновить данные"
          >
            <RotateCw size={15} className={isLoading ? 'spin-icon' : ''} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        {activeTab === 'today' && (
          <TodayTab
            dashboardData={dashboardData}
            onRefresh={loadData}
            onTaskCompleted={handleTaskCelebration}
          />
        )}
        {activeTab === 'goals' && (
          <GoalsTab
            goalsData={goalsData}
            onRefresh={loadData}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab
            onRefresh={loadData}
          />
        )}
      </main>

      {/* Floating Action Button (FAB) for Quick Add */}
      {(activeTab === 'today' || activeTab === 'goals') && (
        <button
          className="app-fab"
          onClick={() => {
            hapticFeedback('medium');
            setIsQuickAddOpen(true);
          }}
          title="Создать задачу"
          aria-label="Создать задачу"
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
          onClose={() => setIsQuickAddOpen(false)}
          onTaskCreated={loadData}
        />
      )}
    </div>
  );
}
