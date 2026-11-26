import React, { useState } from 'react';
import { ArrowRight, Check, Loader2, Sparkles, Sun, Moon } from 'lucide-react';
import type { Habit, ScheduleBlock, ThemeMode, UserProfile } from '../types/kizashi';

interface OnboardingModalProps {
  open: boolean;
  initialProfile: UserProfile;
  theme: ThemeMode;
  onToggleTheme: (mode: ThemeMode) => void;
  onComplete: (
    profile: UserProfile,
    starterHabits?: Habit[],
    starterSchedule?: ScheduleBlock[]
  ) => void;
  onClose?: () => void;
  isEditMode?: boolean;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  open,
  initialProfile,
  theme,
  onToggleTheme,
  onComplete,
  onClose,
  isEditMode = false,
}) => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<UserProfile>(initialProfile);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleFinish = async (useAI: boolean) => {
    const finalized: UserProfile = {
      ...form,
      name: form.name.trim() || 'Traveler',
      onboarded: true,
    };

    if (!useAI) {
      onComplete(finalized);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/gemini/bootstrap-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: finalized }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not generate starter plan.');
      }

      const habits: Habit[] = (data.starterHabits || []).map(
        (
          h: { title: string; timeOfDay: string; durationMin: number; category: string },
          idx: number
        ) => ({
          id: `h-ai-${Date.now()}-${idx}`,
          title: h.title,
          timeOfDay:
            h.timeOfDay === 'Midday' || h.timeOfDay === 'Evening'
              ? h.timeOfDay
              : 'Morning',
          durationMin: Number(h.durationMin) || 15,
          category: h.category || 'Focus',
        })
      );

      const blocks: ScheduleBlock[] = (data.scheduleBlocks || []).map(
        (
          b: { time: string; title: string; durationMin: number; type: string },
          idx: number
        ) => ({
          id: `s-ai-${Date.now()}-${idx}`,
          time: b.time || '08:00',
          title: b.title,
          durationMin: Number(b.durationMin) || 30,
          type:
            b.type === 'deep' || b.type === 'habit' || b.type === 'rest'
              ? b.type
              : 'routine',
        })
      );

      onComplete(
        {
          ...finalized,
          focusMotto: data.focusMotto || finalized.focusMotto,
        },
        habits.length > 0 ? habits : undefined,
        blocks.length > 0 ? blocks : undefined
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to tailor plan right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-[#EADFE2] dark:border-[#26262C] bg-[#FCF8F6] dark:bg-[#09090B] overflow-hidden shadow-2xl my-auto">
        <div className="grid md:grid-cols-5">
          <div className="hidden md:block md:col-span-2 relative bg-[#F5EAEF] dark:bg-black border-r border-[#EADFE2] dark:border-[#222228]">
            <img
              src="/src/assets/images/zen_desk_focus_1795157399189.jpg"
              alt="Minimalist Japanese desk in morning sunlight"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover opacity-90 dark:opacity-75"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent p-5 flex flex-col justify-end text-white">
              <p className="font-display text-lg font-semibold leading-snug">
                5 Minutes to Clarity
              </p>
              <p className="mt-1 text-xs text-white/80 leading-relaxed">
                Tell Kizashi what matters to you so every idea and daily habit stays aligned.
              </p>
            </div>
          </div>

          <div className="md:col-span-3 p-6 sm:p-7">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono-num text-[#6B6368] dark:text-[#A1A1AA]">
                {isEditMode ? 'Edit Profile' : `Step ${step + 1} of 3`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleTheme('light')}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    theme === 'light'
                      ? 'bg-[#C94A6A] text-white'
                      : 'text-[#6B6368] dark:text-[#A1A1AA] hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  Sakura
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTheme('dark')}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    theme === 'dark'
                      ? 'bg-[#F4F4F5] text-black'
                      : 'text-[#6B6368] dark:text-[#A1A1AA] hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  Sumi
                </button>
              </div>
            </div>

            <h2
              id="onboarding-title"
              className="mt-3 font-display text-2xl font-semibold text-[#1C191C] dark:text-[#F4F4F5]"
            >
              {step === 0 && 'Who are we planning for?'}
              {step === 1 && 'Your life goal & interests'}
              {step === 2 && 'Habits, distractions & rhythm'}
            </h2>

            {step === 0 && (
              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#5C5459] dark:text-[#A1A1AA] mb-1.5">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Dhruv"
                    className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-white dark:bg-black px-3.5 py-2.5 text-sm text-[#1C191C] dark:text-[#F4F4F5] focus:outline-none focus:border-[#C94A6A] dark:focus:border-[#E87A90]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#5C5459] dark:text-[#A1A1AA] mb-1.5">
                      Target Wake Time
                    </label>
                    <input
                      type="time"
                      value={form.wakeTime}
                      onChange={(e) => setForm({ ...form, wakeTime: e.target.value })}
                      className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-white dark:bg-black px-3.5 py-2.5 text-sm font-mono-num text-[#1C191C] dark:text-[#F4F4F5]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#5C5459] dark:text-[#A1A1AA] mb-1.5">
                      Target Sleep Time
                    </label>
                    <input
                      type="time"
                      value={form.sleepTime}
                      onChange={(e) => setForm({ ...form, sleepTime: e.target.value })}
                      className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-white dark:bg-black px-3.5 py-2.5 text-sm font-mono-num text-[#1C191C] dark:text-[#F4F4F5]"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#5C5459] dark:text-[#A1A1AA] mb-1.5">
                    What do you want to achieve in life right now?
                  </label>
                  <textarea
                    rows={2}
                    value={form.primaryGoal}
                    onChange={(e) => setForm({ ...form, primaryGoal: e.target.value })}
                    placeholder="e.g. Build a software career, stay fit, and ship my own product"
                    className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-white dark:bg-black px-3.5 py-2.5 text-sm text-[#1C191C] dark:text-[#F4F4F5] focus:outline-none focus:border-[#C94A6A] dark:focus:border-[#E87A90]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5C5459] dark:text-[#A1A1AA] mb-1.5">
                    What do you genuinely enjoy & have interest in?
                  </label>
                  <textarea
                    rows={2}
                    value={form.interests}
                    onChange={(e) => setForm({ ...form, interests: e.target.value })}
                    placeholder="e.g. Coding, anime art, strength training, reading"
                    className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-white dark:bg-black px-3.5 py-2.5 text-sm text-[#1C191C] dark:text-[#F4F4F5] focus:outline-none focus:border-[#C94A6A] dark:focus:border-[#E87A90]"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="mt-5 space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-[#5C5459] dark:text-[#A1A1AA] mb-1">
                    Habits you already do
                  </label>
                  <input
                    type="text"
                    value={form.currentHabits}
                    onChange={(e) => setForm({ ...form, currentHabits: e.target.value })}
                    placeholder="e.g. Morning walk, drinking water"
                    className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-white dark:bg-black px-3.5 py-2 text-sm text-[#1C191C] dark:text-[#F4F4F5]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5C5459] dark:text-[#A1A1AA] mb-1">
                    Things you avoid / don’t do
                  </label>
                  <input
                    type="text"
                    value={form.thingsAvoided}
                    onChange={(e) => setForm({ ...form, thingsAvoided: e.target.value })}
                    placeholder="e.g. Skipping sleep, junk food, random multitasking"
                    className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-white dark:bg-black px-3.5 py-2 text-sm text-[#1C191C] dark:text-[#F4F4F5]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5C5459] dark:text-[#A1A1AA] mb-1">
                    What stops you from being productive?
                  </label>
                  <input
                    type="text"
                    value={form.mainDistractions}
                    onChange={(e) => setForm({ ...form, mainDistractions: e.target.value })}
                    placeholder="e.g. Overthinking new ideas, short-form videos"
                    className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-white dark:bg-black px-3.5 py-2 text-sm text-[#1C191C] dark:text-[#F4F4F5]"
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#EADFE2] dark:border-[#222228]">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="text-xs font-medium text-[#6B6368] dark:text-[#A1A1AA] hover:text-[#1C191C] dark:hover:text-white px-2 py-2"
                >
                  Back
                </button>
              ) : isEditMode && onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs font-medium text-[#6B6368] dark:text-[#A1A1AA] hover:text-[#1C191C] dark:hover:text-white px-2 py-2"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleFinish(false)}
                  className="text-xs font-medium text-[#6B6368] dark:text-[#A1A1AA] hover:text-[#1C191C] dark:hover:text-white px-2 py-2"
                >
                  Use Starter Profile
                </button>
              )}

              {step < 2 ? (
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1C191C] dark:bg-[#F4F4F5] px-4 py-2.5 text-sm font-semibold text-white dark:text-black hover:opacity-90 transition-opacity min-h-[42px]"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleFinish(false)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#EADFE2] dark:border-[#27272A] px-3.5 py-2.5 text-xs font-medium text-[#1C191C] dark:text-[#E4E4E7] hover:bg-[#FAF2F4] dark:hover:bg-[#16161A] min-h-[42px]"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Save Only
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleFinish(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#C94A6A] dark:bg-[#E87A90] px-4 py-2.5 text-sm font-semibold text-white dark:text-black hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[42px]"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {loading ? 'Tailoring...' : 'Generate My Plan'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
