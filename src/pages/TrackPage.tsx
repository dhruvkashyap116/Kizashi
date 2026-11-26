import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CalendarPlus,
  CheckCircle2,
  Circle,
  Footprints,
  Moon,
  Plus,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { Habit, KizashiState, ScheduleBlock, SleepConfig } from '../types/kizashi';
import {
  calculateSleepHours,
  computeCompletionStats,
  computeHabitStreak,
  formatDateKey,
  getRecentDateKeys,
} from '../utils/storage';
import { playJapaneseChime } from '../utils/audioAlarm';

interface TrackPageProps {
  state: KizashiState;
  workspaceConnected: boolean;
  onToggleHabit: (habitId: string, dateKey?: string) => void;
  onAddHabit: (habit: Omit<Habit, 'id'>) => void;
  onDeleteHabit: (id: string) => void;
  onAddScheduleBlock: (block: Omit<ScheduleBlock, 'id'>) => void;
  onToggleScheduleBlock: (id: string) => void;
  onDeleteScheduleBlock: (id: string) => void;
  onUpdateSleep: (sleep: SleepConfig) => void;
  onAddSteps: (delta: number) => void;
  onRequestCalendarSync: (block: ScheduleBlock) => void;
}

export const TrackPage: React.FC<TrackPageProps> = ({
  state,
  workspaceConnected,
  onToggleHabit,
  onAddHabit,
  onDeleteHabit,
  onAddScheduleBlock,
  onToggleScheduleBlock,
  onDeleteScheduleBlock,
  onUpdateSleep,
  onAddSteps,
  onRequestCalendarSync,
}) => {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitTime, setNewHabitTime] = useState<'Morning' | 'Midday' | 'Evening'>('Morning');
  const [newHabitMin, setNewHabitMin] = useState(15);

  const [newBlockTime, setNewBlockTime] = useState('09:00');
  const [newBlockTitle, setNewBlockTitle] = useState('');
  const [newBlockMin, setNewBlockMin] = useState(45);

  const [notifStatus, setNotifStatus] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [motionActive, setMotionActive] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);
  const lastStepPeakRef = useRef<number>(0);

  const today = formatDateKey();
  const weekKeys = getRecentDateKeys(7);
  const monthStats = computeCompletionStats(30, state.habits, state.habitLogs);
  const weekStats = computeCompletionStats(7, state.habits, state.habitLogs);
  const dailyStats = computeCompletionStats(1, state.habits, state.habitLogs);

  const activeStats =
    period === 'daily' ? dailyStats : period === 'weekly' ? weekStats : monthStats;

  const todaySteps = state.stepLogs[today] || 0;

  useEffect(() => {
    if (!motionActive) return;
    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
      const now = Date.now();
      if (mag > 13.5 && now - lastStepPeakRef.current > 360) {
        lastStepPeakRef.current = now;
        onAddSteps(1);
      }
    };
    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [motionActive, onAddSteps]);

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      setNotifStatus('unsupported');
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifStatus(perm);
    if (perm === 'granted') {
      new Notification('Kizashi Alarms Active', {
        body: `Wake chime scheduled for ${state.sleep.wakeTime}.`,
        icon: '/pwa-192x192.png',
      });
    }
  };

  const enableMotionSensor = async () => {
    setMotionError(null);
    try {
      const DME = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof DME !== 'undefined' && typeof DME.requestPermission === 'function') {
        const res = await DME.requestPermission();
        if (res !== 'granted') {
          setMotionError('Motion sensor permission denied.');
          return;
        }
      }
      setMotionActive(true);
    } catch {
      setMotionError('Motion hardware unavailable on this device; use quick step logging below.');
    }
  };

  const handleAddHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitTitle.trim()) return;
    onAddHabit({
      title: newHabitTitle.trim(),
      timeOfDay: newHabitTime,
      durationMin: newHabitMin,
      category: 'Routine',
    });
    setNewHabitTitle('');
  };

  const handleAddBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockTitle.trim()) return;
    onAddScheduleBlock({
      time: newBlockTime,
      title: newBlockTitle.trim(),
      durationMin: newBlockMin,
      type: 'deep',
    });
    setNewBlockTitle('');
  };

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#1C191C] dark:text-white">
            Habits, Schedule & Sleep Tracker
          </h1>
          <p className="mt-1 text-sm text-[#5C5459] dark:text-[#A1A1AA]">
            Track daily, weekly, and monthly consistency, configure sleep alarms, and manage device sensor permissions.
          </p>
        </div>

        {/* Daily / Weekly / Monthly Switcher */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] self-start">
          {(['daily', 'weekly', 'monthly'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setPeriod(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                period === tab
                  ? 'bg-[#1C191C] dark:bg-[#F4F4F5] text-white dark:text-black'
                  : 'text-[#6B6368] dark:text-[#A1A1AA] hover:text-[#1C191C] dark:hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Period Summary Strip */}
      <section className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#F2E9EC] dark:border-[#1E1E24]">
          <div>
            <div className="text-xs text-[#6B6368] dark:text-[#A1A1AA] capitalize">
              {period} Consistency Rate
            </div>
            <div className="mt-1 text-3xl font-bold font-mono-num text-[#C94A6A] dark:text-[#E87A90]">
              {activeStats.rate}%
            </div>
          </div>
          <div className="text-right font-mono-num text-xs text-[#6B6368] dark:text-[#A1A1AA]">
            <div>
              {activeStats.completed} / {activeStats.total} check-ins completed
            </div>
            <div className="mt-0.5">
              {period === 'daily' ? 'Today' : period === 'weekly' ? 'Last 7 days' : 'Last 30 days'}
            </div>
          </div>
        </div>

        {/* Visual Bar Strip (7 days or 30 days) */}
        <div className="mt-4">
          <div className="flex items-end gap-1.5 h-20">
            {activeStats.perDay.map((d) => {
              const pct = d.total > 0 ? Math.round((d.count / d.total) * 100) : 0;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <div
                    title={`${d.date}: ${d.count}/${d.total} (${pct}%)`}
                    className="w-full rounded-t-md bg-[#C94A6A]/80 dark:bg-[#E87A90]/85 transition-all"
                    style={{ height: `${Math.max(8, pct)}%` }}
                  />
                  {period !== 'monthly' && (
                    <span className="text-[10px] font-mono-num text-[#6B6368] dark:text-[#71717A]">
                      {d.date.slice(5)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Habit Matrix + Add Habit */}
      <section className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#F2E9EC] dark:border-[#1E1E24]">
          <h2 className="font-display text-lg font-semibold">7-Day Habit Matrix</h2>
          <form onSubmit={handleAddHabit} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newHabitTitle}
              onChange={(e) => setNewHabitTitle(e.target.value)}
              placeholder="New daily habit..."
              className="rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-3 py-2 text-xs text-[#1C191C] dark:text-[#F4F4F5] min-w-[180px]"
            />
            <select
              value={newHabitTime}
              onChange={(e) => setNewHabitTime(e.target.value as 'Morning' | 'Midday' | 'Evening')}
              className="rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-2.5 py-2 text-xs"
            >
              <option value="Morning">Morning</option>
              <option value="Midday">Midday</option>
              <option value="Evening">Evening</option>
            </select>
            <input
              type="number"
              min={1}
              max={180}
              value={newHabitMin}
              onChange={(e) => setNewHabitMin(Number(e.target.value) || 15)}
              className="w-16 rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-2 py-2 text-xs font-mono-num"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-xl bg-[#1C191C] dark:bg-[#F4F4F5] px-3.5 py-2 text-xs font-semibold text-white dark:text-black min-h-[36px]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </form>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="border-b border-[#F2E9EC] dark:border-[#1E1E24] text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                <th className="py-2 pr-4 font-medium">Habit</th>
                {weekKeys.map((dk) => (
                  <th key={dk} className="py-2 px-1 text-center font-mono-num font-medium">
                    {dk.slice(8)}
                  </th>
                ))}
                <th className="py-2 pl-3 text-right font-medium">Streak</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F6EFF2] dark:divide-[#18181B]">
              {state.habits.map((h) => {
                const streak = computeHabitStreak(h.id, state.habitLogs);
                return (
                  <tr key={h.id} className="hover:bg-[#FCF8F6] dark:hover:bg-[#111114]">
                    <td className="py-3 pr-4">
                      <div className="text-sm font-medium text-[#1C191C] dark:text-[#F4F4F5]">
                        {h.title}
                      </div>
                      <div className="text-xs text-[#6B6368] dark:text-[#A1A1AA] font-mono-num">
                        {h.timeOfDay} · {h.durationMin}m
                      </div>
                    </td>
                    {weekKeys.map((dk) => {
                      const done = !!state.habitLogs[dk]?.[h.id];
                      return (
                        <td key={dk} className="py-2 px-1 text-center">
                          <button
                            type="button"
                            onClick={() => onToggleHabit(h.id, dk)}
                            aria-label={`Toggle ${h.title} for ${dk}`}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[#FAF2F4] dark:hover:bg-[#1C1C21]"
                          >
                            {done ? (
                              <CheckCircle2 className="w-5 h-5 text-[#C94A6A] dark:text-[#E87A90]" />
                            ) : (
                              <Circle className="w-5 h-5 text-[#D1C4C9] dark:text-[#3F3F46]" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-right font-mono-num text-xs font-semibold text-[#1C191C] dark:text-[#F4F4F5]">
                      {streak}d
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteHabit(h.id)}
                        aria-label={`Delete ${h.title}`}
                        className="p-1.5 text-[#8C8287] hover:text-rose-600 dark:hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2-Column Bottom Grid: Daily Schedule + Sleep & Device Sensors */}
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
          <h2 className="font-display text-lg font-semibold">Daily Schedule Blocks</h2>
          <form onSubmit={handleAddBlock} className="mt-4 flex flex-wrap gap-2">
            <input
              type="time"
              value={newBlockTime}
              onChange={(e) => setNewBlockTime(e.target.value)}
              className="rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-2.5 py-2 text-xs font-mono-num"
            />
            <input
              type="text"
              value={newBlockTitle}
              onChange={(e) => setNewBlockTitle(e.target.value)}
              placeholder="Time block title..."
              className="flex-1 min-w-[140px] rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-3 py-2 text-xs"
            />
            <input
              type="number"
              min={5}
              max={240}
              value={newBlockMin}
              onChange={(e) => setNewBlockMin(Number(e.target.value) || 30)}
              className="w-16 rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-2 py-2 text-xs font-mono-num"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#1C191C] dark:bg-[#F4F4F5] px-3.5 py-2 text-xs font-semibold text-white dark:text-black"
            >
              Add
            </button>
          </form>

          <div className="mt-4 divide-y divide-[#F2E9EC] dark:divide-[#1C1C21]">
            {state.schedule.map((block) => (
              <div key={block.id} className="py-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onToggleScheduleBlock(block.id)}
                  className="flex items-center gap-3 text-left min-w-0 flex-1"
                >
                  {block.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-[#C94A6A] dark:text-[#E87A90] shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-[#B4A8AD] dark:text-[#52525B] shrink-0" />
                  )}
                  <span className="text-xs font-mono-num text-[#C94A6A] dark:text-[#E87A90] shrink-0">
                    {block.time}
                  </span>
                  <span
                    className={`text-sm truncate ${
                      block.completed ? 'line-through text-[#8C8287] dark:text-[#71717A]' : ''
                    }`}
                  >
                    {block.title}
                  </span>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-mono-num text-[#6B6368] dark:text-[#A1A1AA]">
                    {block.durationMin}m
                  </span>
                  {workspaceConnected && (
                    <button
                      type="button"
                      onClick={() => onRequestCalendarSync(block)}
                      title="Push to Google Calendar"
                      className="p-1.5 rounded-lg text-[#5C5459] dark:text-[#A1A1AA] hover:text-[#C94A6A] dark:hover:text-[#E87A90]"
                    >
                      <CalendarPlus className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteScheduleBlock(block.id)}
                    aria-label="Remove block"
                    className="p-1.5 text-[#8C8287] hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-6 space-y-6">
          {/* Sleep & Smart Alarm */}
          <div className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-[#C94A6A] dark:text-[#E87A90]" />
                <h2 className="font-display text-lg font-semibold">Sleep Schedule & Alarm</h2>
              </div>
              <span className="text-xs font-mono-num text-[#6B6368] dark:text-[#A1A1AA]">
                {calculateSleepHours(state.sleep.bedtime, state.sleep.wakeTime)} target
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[#6B6368] dark:text-[#A1A1AA] mb-1">
                  Bedtime
                </label>
                <input
                  type="time"
                  value={state.sleep.bedtime}
                  onChange={(e) => onUpdateSleep({ ...state.sleep, bedtime: e.target.value })}
                  className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-3 py-2 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs text-[#6B6368] dark:text-[#A1A1AA] mb-1">
                  Wake Alarm
                </label>
                <input
                  type="time"
                  value={state.sleep.wakeTime}
                  onChange={(e) => onUpdateSleep({ ...state.sleep, wakeTime: e.target.value })}
                  className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-3 py-2 text-sm font-mono-num"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-[#6B6368] dark:text-[#A1A1AA] mb-1">
                  Chime Tone
                </label>
                <select
                  value={state.sleep.chimeTone}
                  onChange={(e) =>
                    onUpdateSleep({
                      ...state.sleep,
                      chimeTone: e.target.value as 'koto' | 'furin' | 'temple',
                    })
                  }
                  className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-3 py-2 text-sm"
                >
                  <option value="koto">Koto Harp</option>
                  <option value="furin">Furin Wind Bell</option>
                  <option value="temple">Temple Bell</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#F2E9EC] dark:border-[#1E1E24]">
              <button
                type="button"
                onClick={() => onUpdateSleep({ ...state.sleep, alarmEnabled: !state.sleep.alarmEnabled })}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors min-h-[40px] ${
                  state.sleep.alarmEnabled
                    ? 'bg-[#C94A6A] dark:bg-[#E87A90] text-white dark:text-black'
                    : 'border border-[#EADFE2] dark:border-[#27272A] text-[#1C191C] dark:text-[#F4F4F5]'
                }`}
              >
                {state.sleep.alarmEnabled ? 'Wake Alarm Active' : 'Enable Wake Alarm'}
              </button>
              <button
                type="button"
                onClick={() => playJapaneseChime(state.sleep.chimeTone)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#EADFE2] dark:border-[#27272A] px-3.5 py-2 text-xs font-medium hover:bg-[#FAF2F4] dark:hover:bg-[#141418] min-h-[40px]"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Preview Chime
              </button>
            </div>
          </div>

          {/* Device Permissions & Step Counter */}
          <div className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
            <h2 className="font-display text-lg font-semibold">Device Permissions & Steps</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3 py-2 border-b border-[#F2E9EC] dark:border-[#1E1E24]">
                <div className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4 text-[#C94A6A] dark:text-[#E87A90]" />
                  <div>
                    <div className="text-sm font-medium">Alarm & Habit Notifications</div>
                    <div className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                      Status: {notifStatus}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={requestNotificationPermission}
                  className="rounded-xl border border-[#EADFE2] dark:border-[#27272A] px-3 py-1.5 text-xs font-medium hover:bg-[#FAF2F4] dark:hover:bg-[#141418] min-h-[36px]"
                >
                  {notifStatus === 'granted' ? 'Granted' : 'Allow'}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-2.5">
                  <Footprints className="w-4 h-4 text-[#C94A6A] dark:text-[#E87A90]" />
                  <div>
                    <div className="text-sm font-medium">
                      Today’s Steps: <span className="font-mono-num">{todaySteps.toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                      {motionActive ? 'Live motion pedometer active' : 'Accelerometer or quick log'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={enableMotionSensor}
                    className="rounded-xl border border-[#EADFE2] dark:border-[#27272A] px-3 py-1.5 text-xs font-medium hover:bg-[#FAF2F4] dark:hover:bg-[#141418] min-h-[36px]"
                  >
                    {motionActive ? 'Sensor On' : 'Enable Motion'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddSteps(1000)}
                    className="rounded-xl bg-[#1C191C] dark:bg-[#F4F4F5] px-3 py-1.5 text-xs font-semibold text-white dark:text-black min-h-[36px]"
                  >
                    +1,000 Steps
                  </button>
                </div>
              </div>
              {motionError && (
                <p className="text-xs text-amber-700 dark:text-amber-400">{motionError}</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
