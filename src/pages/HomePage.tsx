import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Lightbulb,
  Moon,
  RefreshCw,
  Target,
} from 'lucide-react';
import type { AnimeQuote, KizashiState, PageTab } from '../types/kizashi';
import { getDailyAnimeQuote, getJapaneseGreeting } from '../data/animeQuotes';
import {
  calculateSleepHours,
  computeCompletionStats,
  computeHabitStreak,
  formatDateKey,
} from '../utils/storage';

interface HomePageProps {
  state: KizashiState;
  onToggleHabit: (habitId: string) => void;
  onNavigate: (tab: PageTab) => void;
  onQuickTriage: (ideaText: string) => void;
  onOpenProfile: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  state,
  onToggleHabit,
  onNavigate,
  onQuickTriage,
  onOpenProfile,
}) => {
  const [quote, setQuote] = useState<AnimeQuote>(() => getDailyAnimeQuote());
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quickIdea, setQuickIdea] = useState('');

  const today = formatDateKey();
  const todayMap = state.habitLogs[today] || {};
  const doneToday = state.habits.filter((h) => todayMap[h.id]).length;
  const weeklyStats = computeCompletionStats(7, state.habits, state.habitLogs);
  const parkedIdeasCount = state.ideas.filter((i) => i.verdict === 'procrastination').length;
  const greeting = getJapaneseGreeting(state.profile.name);
  const todaySteps = state.stepLogs[today] || 0;

  const handleRefreshQuote = async () => {
    setLoadingQuote(true);
    try {
      const res = await fetch('/api/gemini/daily-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: state.profile.primaryGoal }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.quote && data.character) {
          setQuote(data);
        }
      }
    } catch {
      // Keep current quote if offline
    } finally {
      setLoadingQuote(false);
    }
  };

  const handleQuickIdeaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickIdea.trim()) return;
    onQuickTriage(quickIdea.trim());
    setQuickIdea('');
  };

  return (
    <div className="space-y-8 page-enter">
      {/* Hero Greeting & Anime Motivating Quote */}
      <section className="relative overflow-hidden rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B]">
        <div className="grid lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                <span>{greeting.jp}</span>
                <span aria-hidden="true">·</span>
                <span>5-Minute Daily Alignment</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onOpenProfile}
                  className="underline decoration-[#D9A7B4] dark:decoration-[#52525B] underline-offset-4 hover:text-[#C94A6A] dark:hover:text-[#E87A90]"
                >
                  Edit Profile
                </button>
              </div>
              <h1 className="mt-2 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#1C191C] dark:text-[#F4F4F5] text-balance">
                {greeting.en}
              </h1>
              <p className="mt-2 text-sm text-[#5C5459] dark:text-[#A1A1AA] max-w-2xl leading-relaxed">
                Goal anchor: <span className="font-medium text-[#1C191C] dark:text-[#F4F4F5]">{state.profile.primaryGoal}</span>
              </p>
            </div>

            <div className="mt-6 pt-5 border-t border-[#F2E9EC] dark:border-[#1E1E24]">
              <blockquote className="font-display text-lg sm:text-xl text-[#1C191C] dark:text-[#F4F4F5] leading-snug">
                “{quote.quote}”
              </blockquote>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                  <span className="font-semibold text-[#C94A6A] dark:text-[#E87A90]">{quote.character}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{quote.anime}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{quote.reflection}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRefreshQuote}
                  disabled={loadingQuote}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5C5459] dark:text-[#A1A1AA] hover:text-[#C94A6A] dark:hover:text-[#E87A90] py-1.5 px-2.5 rounded-lg border border-[#EADFE2] dark:border-[#24242A] transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingQuote ? 'animate-spin' : ''}`} />
                  New Quote
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[210px] border-t lg:border-t-0 lg:border-l border-[#EADFE2] dark:border-[#24242A] bg-[#FBF4F6] dark:bg-black">
            <img
              src="/src/assets/images/sakura_hero_sketch_1795157399535.jpg"
              alt="Japanese sumi-e cherry blossom branch illustration"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover dark:opacity-25 transition-opacity"
            />
            <div className="absolute inset-0 flex items-end p-5 bg-gradient-to-t from-black/55 via-black/15 to-transparent">
              <div className="flex items-center gap-3.5 text-white">
                <img
                  src="/src/assets/images/sensei_avatar_1795157399346.jpg"
                  alt="Kizashi Sensei portrait"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-xl object-cover border border-white/30 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white/80">Daily Focus Motto</p>
                  <p className="text-sm font-medium leading-snug line-clamp-2">
                    {state.profile.focusMotto}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Column Tabular KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-4">
          <div className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">Today’s Habits</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-[#1C191C] dark:text-white">
            {doneToday}/{state.habits.length}
          </div>
          <div className="mt-1 text-xs text-[#6B6368] dark:text-[#71717A]">
            {state.habits.length > 0 ? Math.round((doneToday / state.habits.length) * 100) : 0}% complete
          </div>
        </div>

        <div className="rounded-xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-4">
          <div className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">7-Day Consistency</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-[#C94A6A] dark:text-[#E87A90]">
            {weeklyStats.rate}%
          </div>
          <div className="mt-1 text-xs text-[#6B6368] dark:text-[#71717A] font-mono-num">
            {weeklyStats.completed} of {weeklyStats.total} check-ins
          </div>
        </div>

        <div className="rounded-xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-4">
          <div className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">Sleep Rhythm</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-[#1C191C] dark:text-white">
            {calculateSleepHours(state.sleep.bedtime, state.sleep.wakeTime)}
          </div>
          <div className="mt-1 text-xs text-[#6B6368] dark:text-[#71717A] font-mono-num">
            {state.sleep.wakeTime} wake · {state.sleep.alarmEnabled ? 'Alarm on' : 'Alarm off'}
          </div>
        </div>

        <div className="rounded-xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-4">
          <div className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">Distractions Filtered</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-[#1C191C] dark:text-white">
            {parkedIdeasCount}
          </div>
          <div className="mt-1 text-xs text-[#6B6368] dark:text-[#71717A] font-mono-num">
            {todaySteps.toLocaleString()} steps today
          </div>
        </div>
      </section>

      {/* Quick Idea Anti-Procrastination Filter */}
      <section className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#1C191C] dark:text-[#F4F4F5]">
              Instant Idea Filter
            </h2>
            <p className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">
              Before chasing a sudden thought, test if it serves your life goal or if it is procrastination.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('ideas')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C94A6A] dark:text-[#E87A90] hover:underline whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            Open Dictate & Vault
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <form onSubmit={handleQuickIdeaSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={quickIdea}
            onChange={(e) => setQuickIdea(e.target.value)}
            placeholder="What idea just popped into your mind? e.g. Build a custom keyboard or learn Rust tonight..."
            className="flex-1 rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-4 py-3 text-sm text-[#1C191C] dark:text-[#F4F4F5] placeholder:text-[#9A8F94] dark:placeholder:text-[#52525B] focus:outline-none focus:border-[#C94A6A] dark:focus:border-[#E87A90]"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1C191C] dark:bg-[#F4F4F5] px-5 py-3 text-sm font-semibold text-white dark:text-black hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 min-h-[44px]"
          >
            <Lightbulb className="w-4 h-4" />
            Check Alignment
          </button>
        </form>
      </section>

      {/* Main 2-Column Workspace: Today's Habits + Today's Schedule */}
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#F2E9EC] dark:border-[#1E1E24]">
            <div>
              <h2 className="font-display text-lg font-semibold">Today’s Habit Checklist</h2>
              <p className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                1-tap completion · Streaks calculated in real time
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('track')}
              className="text-xs font-medium text-[#C94A6A] dark:text-[#E87A90] hover:underline whitespace-nowrap shrink-0"
            >
              Monthly View
            </button>
          </div>

          <div className="divide-y divide-[#F2E9EC] dark:divide-[#1C1C21]">
            {state.habits.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#6B6368] dark:text-[#A1A1AA]">
                No habits configured yet. Add your first habit in Track or generate a Goal Roadmap.
              </div>
            ) : (
              state.habits.map((habit) => {
                const done = !!todayMap[habit.id];
                const streak = computeHabitStreak(habit.id, state.habitLogs);
                return (
                  <button
                    key={habit.id}
                    type="button"
                    onClick={() => onToggleHabit(habit.id)}
                    className="w-full py-3.5 flex items-center justify-between gap-4 text-left hover:bg-[#FCF8F6] dark:hover:bg-[#111114] px-2 -mx-2 rounded-xl transition-colors min-h-[52px]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {done ? (
                        <CheckCircle2 className="w-5 h-5 text-[#C94A6A] dark:text-[#E87A90] shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-[#B4A8AD] dark:text-[#52525B] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div
                          className={`text-sm font-medium truncate ${
                            done
                              ? 'line-through text-[#8C8287] dark:text-[#71717A]'
                              : 'text-[#1C191C] dark:text-[#F4F4F5]'
                          }`}
                        >
                          {habit.title}
                        </div>
                        <div className="text-xs text-[#6B6368] dark:text-[#A1A1AA] font-mono-num">
                          {habit.timeOfDay} · {habit.durationMin}m · {habit.category}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-mono-num text-[#5C5459] dark:text-[#A1A1AA] shrink-0">
                      {streak}d streak
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="lg:col-span-5 rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#F2E9EC] dark:border-[#1E1E24]">
              <div>
                <h2 className="font-display text-lg font-semibold">Daily Schedule Rhythm</h2>
                <p className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                  Stay out of the app and inside your blocks
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('track')}
                className="text-xs font-medium text-[#C94A6A] dark:text-[#E87A90] hover:underline whitespace-nowrap shrink-0"
              >
                Edit Blocks
              </button>
            </div>

            <div className="mt-3 space-y-2.5">
              {state.schedule.slice(0, 6).map((block) => (
                <div
                  key={block.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-[#F6EFF2] dark:border-[#18181B] last:border-b-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono-num font-medium text-[#C94A6A] dark:text-[#E87A90] shrink-0">
                      {block.time}
                    </span>
                    <span className="text-sm text-[#1C191C] dark:text-[#F4F4F5] truncate">
                      {block.title}
                    </span>
                  </div>
                  <span className="text-xs font-mono-num text-[#6B6368] dark:text-[#A1A1AA] shrink-0">
                    {block.durationMin}m
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#F2E9EC] dark:border-[#1E1E24] grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onNavigate('goals')}
              className="flex items-center justify-center gap-2 rounded-xl border border-[#EADFE2] dark:border-[#27272A] py-2.5 px-3 text-xs font-medium hover:bg-[#FAF2F4] dark:hover:bg-[#141418] transition-colors min-h-[42px]"
            >
              <Target className="w-3.5 h-3.5 text-[#C94A6A] dark:text-[#E87A90]" />
              Goal Roadmap
            </button>
            <button
              type="button"
              onClick={() => onNavigate('track')}
              className="flex items-center justify-center gap-2 rounded-xl border border-[#EADFE2] dark:border-[#27272A] py-2.5 px-3 text-xs font-medium hover:bg-[#FAF2F4] dark:hover:bg-[#141418] transition-colors min-h-[42px]"
            >
              <Moon className="w-3.5 h-3.5 text-[#C94A6A] dark:text-[#E87A90]" />
              Sleep & Alarm
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
