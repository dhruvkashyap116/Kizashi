import React, { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import type { GoalItem, Habit, KizashiState, SuggestedHabit } from '../types/kizashi';
import { sanitizeExternalUrl } from '../utils/validation';

interface GoalsPageProps {
  state: KizashiState;
  onAddGoal: (goal: GoalItem) => void;
  onUpdateGoal: (goal: GoalItem) => void;
  onDeleteGoal: (id: string) => void;
  onAdoptHabit: (habit: Omit<Habit, 'id'>) => void;
}

export const GoalsPage: React.FC<GoalsPageProps> = ({
  state,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onAdoptHabit,
}) => {
  const [title, setTitle] = useState('');
  const [timeframe, setTimeframe] = useState('3 months');
  const [weeklyHours, setWeeklyHours] = useState(7);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const newGoal: GoalItem = {
      id: `goal-${Date.now()}`,
      title: title.trim(),
      targetTimeframe: timeframe,
      weeklyHours,
      status: 'active',
    };
    onAddGoal(newGoal);
    setTitle('');
    await generateRoadmapForGoal(newGoal, weeklyHours);
  };

  const generateRoadmapForGoal = async (goal: GoalItem, customHours?: number) => {
    setGeneratingId(goal.id);
    setError(null);
    const hours = customHours ?? goal.weeklyHours;
    try {
      const res = await fetch('/api/gemini/generate-roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalTitle: goal.title,
          timeframe: goal.targetTimeframe,
          weeklyHoursAvailable: hours,
          profile: state.profile,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not build roadmap.');

      onUpdateGoal({
        ...goal,
        weeklyHours: hours,
        roadmap: {
          roadmapTitle: data.roadmapTitle || goal.title,
          summary: data.summary || '',
          recommendedWeeklyHours: Number(data.recommendedWeeklyHours) || hours,
          paceSuitabilityQuestion:
            data.paceSuitabilityQuestion ||
            `Does this ${hours} hrs/week pace suit your current schedule?`,
          paceConfirmed: false,
          phases: Array.isArray(data.phases) ? data.phases : [],
          suggestedDailyHabits: Array.isArray(data.suggestedDailyHabits)
            ? data.suggestedDailyHabits
            : [],
          groundingSources: Array.isArray(data.groundingSources) ? data.groundingSources : [],
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Roadmap generation failed.');
    } finally {
      setGeneratingId(null);
    }
  };

  const handleAdoptSuggestedHabit = (goal: GoalItem, idx: number, sh: SuggestedHabit) => {
    onAdoptHabit({
      title: sh.title,
      timeOfDay:
        sh.timeOfDay === 'Midday' || sh.timeOfDay === 'Evening' ? sh.timeOfDay : 'Morning',
      durationMin: Number(sh.durationMin) || 20,
      category: 'Goal',
      goalId: goal.id,
    });
    if (!goal.roadmap) return;
    const updatedHabits = goal.roadmap.suggestedDailyHabits.map((h, i) =>
      i === idx ? { ...h, added: true } : h
    );
    onUpdateGoal({
      ...goal,
      roadmap: {
        ...goal.roadmap,
        suggestedDailyHabits: updatedHabits,
      },
    });
  };

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#1C191C] dark:text-white">
          Life Goals & Roadmap Architect
        </h1>
        <p className="mt-1 text-sm text-[#574F54] dark:text-[#A1A1AA]">
          State a goal and your available hours. Kizashi designs a realistic roadmap, checks if the pace suits you, and suggests matching daily habits.
        </p>
      </div>

      {/* Add Goal Form */}
      <section className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
        <form onSubmit={handleCreateGoal} className="grid md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-6">
            <label
              htmlFor="goal-title-input"
              className="block text-xs font-medium text-[#574F54] dark:text-[#A1A1AA] mb-1.5"
            >
              Goal You Want to Achieve
            </label>
            <input
              id="goal-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Become a full-stack AI engineer, Run a half-marathon, Launch an indie SaaS"
              className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-3.5 py-2.5 text-sm text-[#1C191C] dark:text-[#F4F4F5]"
            />
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="goal-timeframe-select"
              className="block text-xs font-medium text-[#574F54] dark:text-[#A1A1AA] mb-1.5"
            >
              Timeframe
            </label>
            <select
              id="goal-timeframe-select"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-3 py-2.5 text-sm text-[#1C191C] dark:text-[#F4F4F5]"
            >
              <option value="6 weeks">6 weeks</option>
              <option value="3 months">3 months</option>
              <option value="6 months">6 months</option>
              <option value="1 year">1 year</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="goal-hours-input"
              className="block text-xs font-medium text-[#574F54] dark:text-[#A1A1AA] mb-1.5"
            >
              Hrs / Week
            </label>
            <input
              id="goal-hours-input"
              type="number"
              min={1}
              max={60}
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(Math.max(1, Number(e.target.value) || 5))}
              className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-3.5 py-2.5 text-sm font-mono-num text-[#1C191C] dark:text-[#F4F4F5]"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!title.trim() || generatingId !== null}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#C94A6A] dark:bg-[#E87A90] px-4 py-2.5 text-sm font-semibold text-white dark:text-black hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[42px]"
            >
              {generatingId ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              )}
              Build Plan
            </button>
          </div>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-xs text-rose-700 dark:text-rose-400">
            {error}
          </p>
        )}
      </section>

      {/* Goals & Roadmaps */}
      {state.goals.length === 0 ? (
        <div className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-10 text-center">
          <Target className="w-8 h-8 mx-auto text-[#8C8287] dark:text-[#71717A]" aria-hidden="true" />
          <h2 className="mt-3 font-display text-lg font-semibold">No active goal roadmaps yet</h2>
          <p className="mt-1 text-sm text-[#574F54] dark:text-[#A1A1AA]">
            Add a goal above to receive a phased roadmap and suggested daily habits tailored to your schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {state.goals.map((goal) => {
            const isBusy = generatingId === goal.id;
            const safeSources = (goal.roadmap?.groundingSources || [])
              .map((src) => ({ title: src.title, uri: sanitizeExternalUrl(src.uri) }))
              .filter((s): s is { title: string; uri: string } => s.uri !== null);

            return (
              <section
                key={goal.id}
                className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#F2E9EC] dark:border-[#1E1E24]">
                  <div>
                    <div className="text-xs text-[#574F54] dark:text-[#A1A1AA] font-mono-num">
                      {goal.targetTimeframe} · {goal.weeklyHours} hrs/week
                    </div>
                    <h2 className="mt-1 font-display text-xl font-semibold text-[#1C191C] dark:text-white">
                      {goal.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => generateRoadmapForGoal(goal)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#EADFE2] dark:border-[#27272A] px-3 py-2 text-xs font-medium hover:bg-[#FAF2F4] dark:hover:bg-[#141418] min-h-[40px]"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {goal.roadmap ? 'Regenerate' : 'Generate Roadmap'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteGoal(goal.id)}
                      aria-label={`Delete goal ${goal.title}`}
                      className="p-2.5 rounded-lg text-[#574F54] dark:text-[#A1A1AA] hover:text-rose-600 dark:hover:text-rose-400 min-w-[40px] min-h-[40px] flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {isBusy && !goal.roadmap && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="py-10 text-center text-sm text-[#574F54] dark:text-[#A1A1AA]"
                  >
                    <Loader2 className="w-6 h-6 mx-auto animate-spin text-[#C94A6A] dark:text-[#E87A90] mb-2" aria-hidden="true" />
                    Thinking through milestones and grounding resources...
                  </div>
                )}

                {goal.roadmap && (
                  <div className="mt-5 space-y-6">
                    <p className="text-sm text-[#574F54] dark:text-[#D4D4D8] leading-relaxed">
                      {goal.roadmap.summary}
                    </p>

                    {/* Suitability Check Question */}
                    <div className="rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-[#C94A6A] dark:text-[#E87A90]">
                          Pace & Time Commitment Check
                        </div>
                        <p className="mt-1 text-sm text-[#1C191C] dark:text-[#F4F4F5]">
                          {goal.roadmap.paceSuitabilityQuestion}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {goal.roadmap.paceConfirmed ? (
                          <>
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                              Pace Confirmed ({goal.weeklyHours}h/wk)
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateGoal({
                                  ...goal,
                                  roadmap: { ...goal.roadmap!, paceConfirmed: false },
                                })
                              }
                              className="rounded-lg border border-[#EADFE2] dark:border-[#27272A] px-2.5 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-[#141418] min-h-[36px]"
                            >
                              Change Pace
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateGoal({
                                  ...goal,
                                  roadmap: { ...goal.roadmap!, paceConfirmed: true },
                                })
                              }
                              className="rounded-xl bg-[#1C191C] dark:bg-[#F4F4F5] px-3.5 py-2 text-xs font-semibold text-white dark:text-black hover:opacity-90 min-h-[40px]"
                            >
                              Yes, Suits My Schedule
                            </button>
                            <div className="inline-flex items-center gap-1.5">
                              <label htmlFor={`adjust-hours-${goal.id}`} className="sr-only">
                                Adjust weekly hours for {goal.title}
                              </label>
                              <input
                                id={`adjust-hours-${goal.id}`}
                                type="number"
                                min={1}
                                max={40}
                                value={goal.weeklyHours}
                                onChange={(e) =>
                                  onUpdateGoal({
                                    ...goal,
                                    weeklyHours: Math.max(1, Number(e.target.value) || 2),
                                  })
                                }
                                className="w-16 rounded-lg border border-[#EADFE2] dark:border-[#27272A] bg-white dark:bg-[#09090B] px-2 py-2 text-xs font-mono-num min-h-[40px]"
                              />
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => generateRoadmapForGoal(goal, goal.weeklyHours)}
                                className="rounded-xl border border-[#EADFE2] dark:border-[#27272A] px-3 py-2 text-xs font-medium hover:bg-white dark:hover:bg-[#141418] min-h-[40px]"
                              >
                                Adjust Hours
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Phases */}
                    <div className="grid md:grid-cols-3 gap-4">
                      {goal.roadmap.phases.map((phase, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-[#EADFE2] dark:border-[#24242A] p-4 bg-[#FCF8F6]/60 dark:bg-black/60"
                        >
                          <div className="text-xs font-mono-num text-[#C94A6A] dark:text-[#E87A90]">
                            0{idx + 1}. {phase.timeframe}
                          </div>
                          <h3 className="mt-1 font-semibold text-sm text-[#1C191C] dark:text-white">
                            {phase.phaseName}
                          </h3>
                          <ul className="mt-2.5 space-y-1.5 text-xs text-[#574F54] dark:text-[#A1A1AA]">
                            {phase.milestones.map((m, mIdx) => (
                              <li key={mIdx}>• {m}</li>
                            ))}
                          </ul>
                          <div className="mt-3 pt-2.5 border-t border-[#EADFE2] dark:border-[#222228] text-xs font-medium text-[#1C191C] dark:text-[#E4E4E7]">
                            Key Action: {phase.keyAction}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Suggested Daily Habits */}
                    <div>
                      <h3 className="font-display text-base font-semibold text-[#1C191C] dark:text-white">
                        Suggested Daily Habits Around This Goal
                      </h3>
                      <div className="mt-3 divide-y divide-[#F2E9EC] dark:divide-[#1C1C21] border border-[#EADFE2] dark:border-[#24242A] rounded-xl px-4">
                        {goal.roadmap.suggestedDailyHabits.map((sh, idx) => (
                          <div
                            key={idx}
                            className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div>
                              <div className="text-sm font-medium text-[#1C191C] dark:text-[#F4F4F5]">
                                {sh.title}
                              </div>
                              <div className="text-xs text-[#574F54] dark:text-[#A1A1AA]">
                                <span className="font-mono-num">
                                  {sh.timeOfDay} · {sh.durationMin}m
                                </span>
                                <span aria-hidden="true"> · </span>
                                <span>{sh.reason}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={sh.added}
                              onClick={() => handleAdoptSuggestedHabit(goal, idx, sh)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#EADFE2] dark:border-[#27272A] px-3 py-2 text-xs font-medium hover:bg-[#FAF2F4] dark:hover:bg-[#141418] disabled:opacity-50 whitespace-nowrap shrink-0 min-h-[40px]"
                            >
                              {sh.added ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                  Added to Habits
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5 text-[#C94A6A] dark:text-[#E87A90]" aria-hidden="true" />
                                  Add to Daily Habits
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Search Grounding Sources (sanitized http/https links) */}
                    {safeSources.length > 0 && (
                      <div className="pt-2 text-xs text-[#574F54] dark:text-[#A1A1AA] flex flex-wrap items-center gap-3">
                        <span className="font-medium">Verified References:</span>
                        {safeSources.map((src, sIdx) => (
                          <a
                            key={sIdx}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 underline hover:text-[#C94A6A] dark:hover:text-[#E87A90]"
                          >
                            {src.title}
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
