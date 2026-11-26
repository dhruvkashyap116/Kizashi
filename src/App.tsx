import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarCheck,
  Home,
  LayoutGrid,
  Lightbulb,
  Loader2,
  MessageSquare,
  Moon,
  Sparkles,
  Sun,
  Target,
  User as UserIcon,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  GoalItem,
  GroomingReport,
  Habit,
  KeepNote,
  KizashiState,
  PageTab,
  ScheduleBlock,
  SleepConfig,
  ThemeMode,
  UserProfile,
} from './types/kizashi';
import { formatDateKey, loadState, saveState } from './utils/storage';
import { playJapaneseChime } from './utils/audioAlarm';
import {
  createCalendarEvent,
  createGoogleTask,
  fetchGoogleTasks,
  fetchTodayCalendarEvents,
  initWorkspaceAuth,
  signInWithGoogleWorkspace,
  signOutWorkspace,
  toggleGoogleTaskStatus,
  type CalendarEventItem,
  type GoogleTaskItem,
} from './utils/firebaseWorkspace';
import { OnboardingModal } from './components/OnboardingModal';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallButton';
import { ConfirmDialog } from './components/ConfirmDialog';
import { WidgetView } from './components/WidgetView';
import { HomePage } from './pages/HomePage';

const IdeasPage = lazy(() => import('./pages/IdeasPage').then((m) => ({ default: m.IdeasPage })));
const GoalsPage = lazy(() => import('./pages/GoalsPage').then((m) => ({ default: m.GoalsPage })));
const TrackPage = lazy(() => import('./pages/TrackPage').then((m) => ({ default: m.TrackPage })));
const GroomingPage = lazy(() =>
  import('./pages/GroomingPage').then((m) => ({ default: m.GroomingPage }))
);
const CoachPage = lazy(() => import('./pages/CoachPage').then((m) => ({ default: m.CoachPage })));

type PendingConfirm =
  | { kind: 'calendar_block'; block: ScheduleBlock }
  | { kind: 'add_task'; title: string }
  | { kind: 'toggle_task'; task: GoogleTaskItem }
  | null;

export default function App() {
  const [state, setState] = useState<KizashiState>(() => loadState());
  const [activeTab, setActiveTab] = useState<PageTab>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as PageTab | null;
    if (tab && ['home', 'ideas', 'goals', 'track', 'grooming', 'coach'].includes(tab)) {
      return tab;
    }
    return 'home';
  });
  const [widgetMode, setWidgetMode] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('widget') === 'true';
  });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [pendingIdeaText, setPendingIdeaText] = useState<string>('');

  // Workspace Auth & Sync State
  const [workspaceUser, setWorkspaceUser] = useState<User | null>(null);
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [googleTasks, setGoogleTasks] = useState<GoogleTaskItem[]>([]);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const lastAlarmMinuteRef = useRef<string>('');

  // Persist state & apply Tailwind dark class on <html>
  useEffect(() => {
    saveState(state);
    const root = document.documentElement;
    if (state.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', state.theme === 'dark' ? '#000000' : '#FCF8F6');
    }
  }, [state]);

  // Listen to Workspace Auth state
  useEffect(() => {
    const unsub = initWorkspaceAuth(
      (user, token) => {
        setWorkspaceUser(user);
        setWorkspaceToken(token);
      },
      () => {
        setWorkspaceUser(null);
        setWorkspaceToken(null);
      }
    );
    return () => unsub();
  }, []);

  // Sleep & Wake Alarm Checker (runs gently every 20s)
  useEffect(() => {
    if (!state.sleep.alarmEnabled) return;
    const timer = window.setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (hhmm === state.sleep.wakeTime && lastAlarmMinuteRef.current !== hhmm) {
        lastAlarmMinuteRef.current = hhmm;
        playJapaneseChime(state.sleep.chimeTone);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Kizashi Wake Chime', {
            body: `Good morning! Time for your 5-minute alignment.`,
            icon: '/pwa-192x192.png',
          });
        }
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [state.sleep.alarmEnabled, state.sleep.wakeTime, state.sleep.chimeTone]);

  const refreshWorkspaceData = async (tokenOverride?: string) => {
    const tok = tokenOverride || workspaceToken;
    if (!tok) return;
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      const [events, tasks] = await Promise.all([
        fetchTodayCalendarEvents(tok),
        fetchGoogleTasks(tok),
      ]);
      setCalendarEvents(events);
      setGoogleTasks(tasks);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Unable to fetch Workspace data.');
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      const res = await signInWithGoogleWorkspace();
      if (res) {
        setWorkspaceUser(res.user);
        setWorkspaceToken(res.accessToken);
        await refreshWorkspaceData(res.accessToken);
      }
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Google Sign-In cancelled or failed.');
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutWorkspace();
    setWorkspaceUser(null);
    setWorkspaceToken(null);
    setCalendarEvents([]);
    setGoogleTasks([]);
  };

  const executeConfirmedWorkspaceAction = async () => {
    if (!pendingConfirm || !workspaceToken) {
      setPendingConfirm(null);
      return;
    }
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      if (pendingConfirm.kind === 'calendar_block') {
        const b = pendingConfirm.block;
        await createCalendarEvent(workspaceToken, b.title, b.time, b.durationMin);
      } else if (pendingConfirm.kind === 'add_task') {
        await createGoogleTask(workspaceToken, pendingConfirm.title);
      } else if (pendingConfirm.kind === 'toggle_task') {
        const nextDone = pendingConfirm.task.status !== 'completed';
        await toggleGoogleTaskStatus(workspaceToken, pendingConfirm.task.id, nextDone);
      }
      await refreshWorkspaceData(workspaceToken);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Workspace update failed.');
    } finally {
      setWorkspaceBusy(false);
      setPendingConfirm(null);
    }
  };

  // Memoized / Stable State Mutators
  const setTheme = useCallback(
    (theme: ThemeMode) => setState((prev) => ({ ...prev, theme })),
    []
  );

  const toggleHabit = useCallback((habitId: string, dateKey: string = formatDateKey()) => {
    setState((prev) => {
      const dayMap = prev.habitLogs[dateKey] || {};
      return {
        ...prev,
        habitLogs: {
          ...prev.habitLogs,
          [dateKey]: {
            ...dayMap,
            [habitId]: !dayMap[habitId],
          },
        },
      };
    });
  }, []);

  const addHabit = useCallback((habit: Omit<Habit, 'id'>) => {
    setState((prev) => ({
      ...prev,
      habits: [...prev.habits, { ...habit, id: `h-${Date.now()}` }],
    }));
  }, []);

  const deleteHabit = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      habits: prev.habits.filter((h) => h.id !== id),
    }));
  }, []);

  const addScheduleBlock = useCallback((block: Omit<ScheduleBlock, 'id'>) => {
    setState((prev) => ({
      ...prev,
      schedule: [...prev.schedule, { ...block, id: `s-${Date.now()}` }].sort((a, b) =>
        a.time.localeCompare(b.time)
      ),
    }));
  }, []);

  const toggleScheduleBlock = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      schedule: prev.schedule.map((b) => (b.id === id ? { ...b, completed: !b.completed } : b)),
    }));
  }, []);

  const deleteScheduleBlock = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      schedule: prev.schedule.filter((b) => b.id !== id),
    }));
  }, []);

  const handleAddSteps = useCallback((delta: number) => {
    const dk = formatDateKey();
    setState((prev) => ({
      ...prev,
      stepLogs: {
        ...prev.stepLogs,
        [dk]: (prev.stepLogs[dk] || 0) + delta,
      },
    }));
  }, []);

  const handleOnboardingComplete = (
    profile: UserProfile,
    starterHabits?: Habit[],
    starterSchedule?: ScheduleBlock[]
  ) => {
    setState((prev) => ({
      ...prev,
      profile,
      sleep: {
        ...prev.sleep,
        wakeTime: profile.wakeTime,
        bedtime: profile.sleepTime,
      },
      habits: starterHabits && starterHabits.length > 0 ? starterHabits : prev.habits,
      schedule: starterSchedule && starterSchedule.length > 0 ? starterSchedule : prev.schedule,
    }));
    setShowProfileModal(false);
  };

  if (widgetMode) {
    return (
      <WidgetView
        state={state}
        onToggleHabit={toggleHabit}
        onToggleTheme={setTheme}
        onExitWidget={() => {
          setWidgetMode(false);
          window.history.replaceState({}, '', '/');
        }}
      />
    );
  }

  const navItems: { id: PageTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'ideas', label: 'Ideas', icon: Lightbulb },
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'track', label: 'Track', icon: CalendarCheck },
    { id: 'grooming', label: 'Grooming', icon: Sparkles },
  ];

  return (
    <div className="min-h-screen bg-[#FCF8F6] dark:bg-black text-[#1C191C] dark:text-[#F4F4F5] washi-sketch-bg pb-20 md:pb-12">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-[#1C191C] focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-white dark:focus:bg-[#F4F4F5] dark:focus:text-black"
      >
        Skip to main content
      </a>

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-[#EADFE2] dark:border-[#1E1E24] bg-[#FCF8F6]/90 dark:bg-black/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Title */}
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            aria-label="Kizashi Home"
            className="font-display text-xl font-bold tracking-tight text-[#1C191C] dark:text-white whitespace-nowrap shrink-0"
          >
            Kizashi
          </button>

          {/* Zone 2: 5 concise single-line text nav links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#574F54] dark:text-[#A1A1AA]"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  activeTab === item.id
                    ? 'border-[#C94A6A] dark:border-[#E87A90] text-[#1C191C] dark:text-white font-semibold'
                    : 'border-transparent hover:text-[#1C191C] dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('coach')}
              aria-current={activeTab === 'coach' ? 'page' : undefined}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1C191C] dark:bg-[#F4F4F5] px-4 py-2 text-xs font-semibold text-white dark:text-black hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
              Sensei & Sync
            </button>
          </div>
        </div>
      </header>

      {/* Secondary Workspace Utility Strip (below header, keeps top bar 3-zone clean) */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[#574F54] dark:text-[#A1A1AA]">
          <span>Sakura Light / Sumi Black</span>
          <span aria-hidden="true"> · </span>
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            aria-label="Open profile settings"
            className="inline-flex items-center gap-1 hover:text-[#C94A6A] dark:hover:text-[#E87A90] py-1"
          >
            <UserIcon className="w-3 h-3" aria-hidden="true" />
            {state.profile.name || 'Profile'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme(state.theme === 'dark' ? 'light' : 'dark')}
            aria-pressed={state.theme === 'dark'}
            aria-label={state.theme === 'dark' ? 'Switch to Sakura Light theme' : 'Switch to Sumi Black dark theme'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5D7DC] dark:border-[#26262C] bg-white dark:bg-[#0D0D0F] px-3 py-2 text-xs font-medium hover:bg-[#FAF2F4] dark:hover:bg-[#16161A] whitespace-nowrap shrink-0 min-h-[40px]"
          >
            {state.theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-[#E87A90]" aria-hidden="true" />
                Sakura Light
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-[#C94A6A]" aria-hidden="true" />
                Sumi Black
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setWidgetMode(true)}
            aria-label="Switch to compact Focus Widget view"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5D7DC] dark:border-[#26262C] bg-white dark:bg-[#0D0D0F] px-3 py-2 text-xs font-medium hover:bg-[#FAF2F4] dark:hover:bg-[#16161A] whitespace-nowrap shrink-0 min-h-[40px]"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-[#C94A6A] dark:text-[#E87A90]" aria-hidden="true" />
            Widget
          </button>

          <PWAInstallButton />
        </div>
      </div>

      {/* Main Content Viewport */}
      <main id="main-content" tabIndex={-1} className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-8 focus:outline-none">
        {activeTab === 'home' && (
          <HomePage
            state={state}
            onToggleHabit={(id) => toggleHabit(id)}
            onNavigate={setActiveTab}
            onQuickTriage={(text) => {
              setPendingIdeaText(text);
              setActiveTab('ideas');
            }}
            onOpenProfile={() => setShowProfileModal(true)}
          />
        )}

        <Suspense
          fallback={
            <div className="py-16 flex items-center justify-center gap-2 text-sm text-[#574F54] dark:text-[#A1A1AA]" role="status" aria-live="polite">
              <Loader2 className="w-4 h-4 animate-spin text-[#C94A6A] dark:text-[#E87A90]" aria-hidden="true" />
              <span>Loading view...</span>
            </div>
          }
        >
          {activeTab === 'ideas' && (
            <IdeasPage
              state={state}
              pendingIdeaText={pendingIdeaText}
              onConsumePendingIdea={() => setPendingIdeaText('')}
              onAddIdea={(idea) =>
                setState((prev) => ({ ...prev, ideas: [idea, ...prev.ideas] }))
              }
              onScheduleIdea={(idea) => {
                addScheduleBlock({
                  time: '14:00',
                  title: idea.headline.slice(0, 60),
                  durationMin: idea.estimatedMinutes || 30,
                  type: 'deep',
                });
                setState((prev) => ({
                  ...prev,
                  ideas: prev.ideas.map((i) =>
                    i.id === idea.id ? { ...i, addedToSchedule: true } : i
                  ),
                }));
              }}
              onAdoptHabitFromIdea={addHabit}
              onDeleteIdea={(id) =>
                setState((prev) => ({
                  ...prev,
                  ideas: prev.ideas.filter((i) => i.id !== id),
                }))
              }
            />
          )}

          {activeTab === 'goals' && (
            <GoalsPage
              state={state}
              onAddGoal={(goal: GoalItem) =>
                setState((prev) => ({ ...prev, goals: [goal, ...prev.goals] }))
              }
              onUpdateGoal={(updated: GoalItem) =>
                setState((prev) => ({
                  ...prev,
                  goals: prev.goals.map((g) => (g.id === updated.id ? updated : g)),
                }))
              }
              onDeleteGoal={(id: string) =>
                setState((prev) => ({
                  ...prev,
                  goals: prev.goals.filter((g) => g.id !== id),
                }))
              }
              onAdoptHabit={addHabit}
            />
          )}

          {activeTab === 'track' && (
            <TrackPage
              state={state}
              workspaceConnected={!!workspaceToken}
              onToggleHabit={toggleHabit}
              onAddHabit={addHabit}
              onDeleteHabit={deleteHabit}
              onAddScheduleBlock={addScheduleBlock}
              onToggleScheduleBlock={toggleScheduleBlock}
              onDeleteScheduleBlock={deleteScheduleBlock}
              onUpdateSleep={(sleep: SleepConfig) => setState((prev) => ({ ...prev, sleep }))}
              onAddSteps={handleAddSteps}
              onRequestCalendarSync={(block: ScheduleBlock) =>
                setPendingConfirm({ kind: 'calendar_block', block })
              }
            />
          )}

          {activeTab === 'grooming' && (
            <GroomingPage
              state={state}
              onAddGroomingReport={(report: GroomingReport) =>
                setState((prev) => ({
                  ...prev,
                  groomingReports: [report, ...prev.groomingReports],
                }))
              }
              onToggleChecklistItem={(item: string) =>
                setState((prev) => ({
                  ...prev,
                  groomingChecked: {
                    ...prev.groomingChecked,
                    [item]: !prev.groomingChecked[item],
                  },
                }))
              }
            />
          )}

          {activeTab === 'coach' && (
            <CoachPage
              state={state}
              workspaceUser={workspaceUser}
              workspaceToken={workspaceToken}
              calendarEvents={calendarEvents}
              googleTasks={googleTasks}
              workspaceBusy={workspaceBusy}
              workspaceError={workspaceError}
              onGoogleSignIn={handleGoogleSignIn}
              onGoogleSignOut={handleGoogleSignOut}
              onRefreshWorkspace={() => refreshWorkspaceData()}
              onRequestAddTask={(title: string) => setPendingConfirm({ kind: 'add_task', title })}
              onRequestToggleTask={(task: GoogleTaskItem) =>
                setPendingConfirm({ kind: 'toggle_task', task })
              }
              onAddNote={(note: Omit<KeepNote, 'id' | 'updatedAt'>) =>
                setState((prev) => ({
                  ...prev,
                  notes: [
                    { ...note, id: `n-${Date.now()}`, updatedAt: new Date().toISOString() },
                    ...prev.notes,
                  ],
                }))
              }
              onDeleteNote={(id: string) =>
                setState((prev) => ({
                  ...prev,
                  notes: prev.notes.filter((n) => n.id !== id),
                }))
              }
              onOpenWidgetMode={() => setWidgetMode(true)}
            />
          )}
        </Suspense>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[#EADFE2] dark:border-[#1E1E24] bg-white/95 dark:bg-black/95 backdrop-blur-md"
      >
        <div className="grid grid-cols-5 h-14">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center min-h-[44px] ${
                  active
                    ? 'text-[#C94A6A] dark:text-[#E87A90]'
                    : 'text-[#574F54] dark:text-[#A1A1AA]'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span className="text-[10px] font-medium mt-0.5">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* First-Time Onboarding or Profile Editor */}
      <OnboardingModal
        open={!state.profile.onboarded || showProfileModal}
        initialProfile={state.profile}
        theme={state.theme}
        onToggleTheme={setTheme}
        onComplete={handleOnboardingComplete}
        onClose={() => setShowProfileModal(false)}
        isEditMode={state.profile.onboarded && showProfileModal}
      />

      {/* Explicit Confirmation Dialog for All Google Workspace Mutations */}
      <ConfirmDialog
        open={pendingConfirm !== null}
        title={
          pendingConfirm?.kind === 'calendar_block'
            ? 'Add Event to Google Calendar?'
            : pendingConfirm?.kind === 'add_task'
              ? 'Create Google Task?'
              : 'Update Google Task Status?'
        }
        description={
          pendingConfirm?.kind === 'calendar_block'
            ? `This will create a ${pendingConfirm.block.durationMin}-minute event "${pendingConfirm.block.title}" on your primary Google Calendar at ${pendingConfirm.block.time} today.`
            : pendingConfirm?.kind === 'add_task'
              ? `This will add "${pendingConfirm.title}" to your primary Google Tasks list.`
              : pendingConfirm?.kind === 'toggle_task'
                ? `Mark "${pendingConfirm.task.title}" as ${
                    pendingConfirm.task.status === 'completed' ? 'incomplete' : 'completed'
                  } in Google Tasks?`
                : ''
        }
        confirmLabel="Confirm Sync"
        busy={workspaceBusy}
        onConfirm={executeConfirmedWorkspaceAction}
        onCancel={() => setPendingConfirm(null)}
      />

      <OfflineIndicator />
    </div>
  );
}
