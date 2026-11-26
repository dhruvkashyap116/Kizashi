import React from 'react';
import { CheckCircle2, Circle, Maximize2, Moon, Sun, Clock } from 'lucide-react';
import type { KizashiState, ThemeMode } from '../types/kizashi';
import { calculateSleepHours, formatDateKey } from '../utils/storage';

interface WidgetViewProps {
  state: KizashiState;
  onToggleHabit: (habitId: string, dateKey?: string) => void;
  onToggleTheme: (mode: ThemeMode) => void;
  onExitWidget: () => void;
}

export const WidgetView: React.FC<WidgetViewProps> = ({
  state,
  onToggleHabit,
  onToggleTheme,
  onExitWidget,
}) => {
  const today = formatDateKey();
  const todayMap = state.habitLogs[today] || {};
  const completedCount = state.habits.filter((h) => todayMap[h.id]).length;
  const nextBlock = state.schedule.find((b) => !b.completed) || state.schedule[0];

  return (
    <div className="min-h-screen bg-[#FCF8F6] dark:bg-black text-[#1C191C] dark:text-[#F4F4F5] p-4 flex items-center justify-center washi-sketch-bg">
      <div className="w-full max-w-sm rounded-2xl border border-[#EADFE2] dark:border-[#242429] bg-white dark:bg-[#09090B] p-5 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-[#EADFE2] dark:border-[#222228]">
          <div>
            <h1 className="font-display text-lg font-semibold">Kizashi Widget</h1>
            <p className="text-xs text-[#6B6368] dark:text-[#A1A1AA] font-mono-num">
              {completedCount}/{state.habits.length} habits · Sleep {calculateSleepHours(state.sleep.bedtime, state.sleep.wakeTime)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onToggleTheme(state.theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
              className="p-2 rounded-lg border border-[#EADFE2] dark:border-[#27272A] hover:bg-[#FAF2F4] dark:hover:bg-[#16161A]"
            >
              {state.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onExitWidget}
              aria-label="Open full planner"
              className="p-2 rounded-lg border border-[#EADFE2] dark:border-[#27272A] hover:bg-[#FAF2F4] dark:hover:bg-[#16161A]"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-[#6B6368] dark:text-[#A1A1AA]">
          Goal: <span className="text-[#1C191C] dark:text-[#F4F4F5] font-medium">{state.profile.primaryGoal}</span>
        </div>

        {nextBlock && (
          <div className="mt-3 rounded-xl border border-[#EADFE2] dark:border-[#222228] bg-[#FCF8F6] dark:bg-black px-3.5 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-3.5 h-3.5 text-[#C94A6A] dark:text-[#E87A90] shrink-0" />
              <span className="text-xs font-medium truncate">{nextBlock.title}</span>
            </div>
            <span className="text-xs font-mono-num text-[#6B6368] dark:text-[#A1A1AA] shrink-0 ml-2">
              {nextBlock.time}
            </span>
          </div>
        )}

        <div className="mt-4 divide-y divide-[#F2E9EC] dark:divide-[#1C1C21]">
          {state.habits.map((h) => {
            const done = !!todayMap[h.id];
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => onToggleHabit(h.id, today)}
                className="w-full py-2.5 flex items-center justify-between text-left gap-3 hover:opacity-80 transition-opacity min-h-[44px]"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 text-[#C94A6A] dark:text-[#E87A90] shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-[#A3989D] dark:text-[#52525B] shrink-0" />
                  )}
                  <span
                    className={`text-sm truncate ${
                      done ? 'line-through text-[#8C8287] dark:text-[#71717A]' : ''
                    }`}
                  >
                    {h.title}
                  </span>
                </span>
                <span className="text-xs font-mono-num text-[#6B6368] dark:text-[#A1A1AA] shrink-0">
                  {h.durationMin}m
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
