import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { Habit, IdeaEntry, KizashiState } from '../types/kizashi';

interface IdeasPageProps {
  state: KizashiState;
  pendingIdeaText?: string;
  onConsumePendingIdea?: () => void;
  onAddIdea: (idea: IdeaEntry) => void;
  onScheduleIdea: (idea: IdeaEntry) => void;
  onAdoptHabitFromIdea: (habit: Omit<Habit, 'id'>) => void;
  onDeleteIdea: (id: string) => void;
}

export const IdeasPage: React.FC<IdeasPageProps> = ({
  state,
  pendingIdeaText,
  onConsumePendingIdea,
  onAddIdea,
  onScheduleIdea,
  onAdoptHabitFromIdea,
  onDeleteIdea,
}) => {
  const [ideaInput, setIdeaInput] = useState('');
  const [filter, setFilter] = useState<'all' | 'aligned' | 'procrastination'>('all');
  const [analyzing, setAnalyzing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [habitAddedIds, setHabitAddedIds] = useState<Record<string, boolean>>({});

  const [recordSeconds, setRecordSeconds] = useState(0);
  const [apiMissingKey, setApiMissingKey] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.apiKeyConfigured === false) {
          setApiMissingKey(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!recording) {
      setRecordSeconds(0);
      return;
    }
    const id = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (pendingIdeaText) {
      setIdeaInput(pendingIdeaText);
      onConsumePendingIdea?.();
      runTriage(pendingIdeaText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIdeaText]);

  const runTriage = async (textToCheck: string) => {
    const trimmed = textToCheck.trim();
    if (!trimmed) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/gemini/triage-idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ideaText: trimmed,
          profile: state.profile,
          goals: state.goals,
          habits: state.habits,
          schedule: state.schedule,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not validate idea.');

      const entry: IdeaEntry = {
        id: `idea-${Date.now()}`,
        text: trimmed,
        createdAt: new Date().toISOString(),
        verdict:
          data.verdict === 'aligned' || data.verdict === 'procrastination' || data.verdict === 'defer'
            ? data.verdict
            : 'defer',
        alignmentScore: Number(data.alignmentScore) || 50,
        headline: data.headline || 'Validation Complete',
        reasoning: data.reasoning || 'Evaluated against your current goals and schedule.',
        routineAdvice: data.routineAdvice || 'Review how this fits your next scheduled focus block.',
        estimatedMinutes: Number(data.estimatedMinutes) || 25,
        bestTimeSlot: data.bestTimeSlot || 'Next open block',
        actionSteps: Array.isArray(data.actionSteps) ? data.actionSteps : [],
        shouldAddToRoutine: Boolean(data.shouldAddToRoutine),
      };

      onAddIdea(entry);
      setIdeaInput('');
      if (entry.verdict === 'procrastination') {
        setFilter('procrastination');
      } else {
        setFilter('all');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to validate idea.');
    } finally {
      setAnalyzing(false);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = String(reader.result || '');
        const idx = res.indexOf(',');
        resolve(idx >= 0 ? res.slice(idx + 1) : res);
      };
      reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
      reader.readAsDataURL(blob);
    });

  const startWebSpeechFallback = () => {
    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: (e: { error: string }) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: (e: { error: string }) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
    };
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) {
      setError('Microphone recording is unavailable in this browser or blocked by permissions.');
      return false;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (event) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += `${event.results[i][0]?.transcript || ''} `;
      }
      if (text.trim()) {
        setIdeaInput((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()));
      }
    };
    rec.onerror = (e) => {
      setError(`Speech dictation error: ${e.error}`);
      setRecording(false);
    };
    rec.onend = () => setRecording(false);
    speechRecRef.current = rec;
    rec.start();
    setRecording(true);
    return true;
  };

  const toggleDictation = async () => {
    setError(null);
    if (recording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (speechRecRef.current) {
        speechRecRef.current.stop();
        speechRecRef.current = null;
      }
      setRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      startWebSpeechFallback();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const supportedMime = candidates.find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const actualMime = (recorder.mimeType || supportedMime || 'audio/webm').split(';')[0];
        const blob = new Blob(chunksRef.current, { type: actualMime });
        if (blob.size < 200) {
          setError('No audio captured. Please speak for at least 1 second before stopping.');
          return;
        }
        setTranscribing(true);
        try {
          const audioBase64 = await blobToBase64(blob);
          const res = await fetch('/api/gemini/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64, mimeType: actualMime }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Transcription failed.');
          if (data.transcript) {
            setIdeaInput((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
          } else {
            setError('No speech detected in recording. Please speak clearly closer to the mic.');
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not transcribe audio.');
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!startWebSpeechFallback()) {
        setError(
          msg
            ? `Microphone access failed (${msg}). Allow microphone permission in your browser.`
            : 'Microphone permission is required for Dictate Mode.'
        );
      }
    }
  };

  const handleAddAsHabit = (item: IdeaEntry) => {
    onAdoptHabitFromIdea({
      title: item.headline.slice(0, 60),
      timeOfDay: 'Morning',
      durationMin: Math.min(90, Math.max(10, item.estimatedMinutes || 20)),
      category: 'Aligned',
    });
    setHabitAddedIds((prev) => ({ ...prev, [item.id]: true }));
  };

  const filteredIdeas = state.ideas.filter((item) => {
    if (filter === 'aligned') return item.verdict === 'aligned';
    if (filter === 'procrastination') return item.verdict === 'procrastination' || item.verdict === 'defer';
    return true;
  });

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#1C191C] dark:text-white">
          Idea Validator & Procrastination Filter
        </h1>
        <p className="mt-1 text-sm text-[#5C5459] dark:text-[#A1A1AA]">
          Analyze any incoming idea against your defined life goals and daily schedule. Viable concepts integrate smoothly; procrastination triggers stay out of your routine.
        </p>
      </div>

      {/* Input Placeholder + Dictate Mode */}
      <section className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <label
            htmlFor="idea-textarea"
            className="text-xs font-medium text-[#5C5459] dark:text-[#A1A1AA]"
          >
            Enter or dictate an idea you want to validate
          </label>
          <span className="text-xs text-[#6B6368] dark:text-[#71717A]">
            Goal anchor: {state.profile.primaryGoal}
          </span>
        </div>

        <textarea
          id="idea-textarea"
          rows={3}
          value={ideaInput}
          onChange={(e) => setIdeaInput(e.target.value)}
          placeholder="What do you want to do, how long might it take, or how are you thinking of executing it?"
          className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-4 py-3 text-sm text-[#1C191C] dark:text-[#F4F4F5] placeholder:text-[#9A8F94] dark:placeholder:text-[#52525B] focus:outline-none focus:border-[#C94A6A] dark:focus:border-[#E87A90]"
        />

        {apiMissingKey && (
          <p className="mt-2.5 text-xs text-amber-700 dark:text-amber-300">
            AI validation and transcription require GEMINI_API_KEY in your server environment (.env on localhost or Settings &gt; Secrets).
          </p>
        )}

        {error && <p className="mt-2.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleDictation}
              disabled={transcribing}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors min-h-[42px] ${
                recording
                  ? 'bg-rose-600 text-white'
                  : 'border border-[#EADFE2] dark:border-[#27272A] text-[#1C191C] dark:text-[#F4F4F5] hover:bg-[#FAF2F4] dark:hover:bg-[#141418]'
              }`}
            >
              {transcribing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : recording ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4 text-[#C94A6A] dark:text-[#E87A90]" />
              )}
              {transcribing
                ? 'Transcribing...'
                : recording
                  ? `Stop & Transcribe (${Math.floor(recordSeconds / 60)}:${String(recordSeconds % 60).padStart(2, '0')})`
                  : 'Dictate Idea'}
            </button>
            <span className="text-xs text-[#6B6368] dark:text-[#71717A] font-mono-num">
              {state.habits.length} habits · {state.schedule.length} blocks checked
            </span>
          </div>

          <button
            type="button"
            disabled={analyzing || !ideaInput.trim()}
            onClick={() => runTriage(ideaInput)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#C94A6A] dark:bg-[#E87A90] px-5 py-2.5 text-sm font-semibold text-white dark:text-black hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[44px]"
          >
            {analyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {analyzing ? 'Validating...' : 'Validate Idea'}
          </button>
        </div>
      </section>

      {/* Filter Segmented Control */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B]">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              filter === 'all'
                ? 'bg-[#1C191C] dark:bg-[#F4F4F5] text-white dark:text-black'
                : 'text-[#6B6368] dark:text-[#A1A1AA] hover:text-[#1C191C] dark:hover:text-white'
            }`}
          >
            All ({state.ideas.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('aligned')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              filter === 'aligned'
                ? 'bg-[#1C191C] dark:bg-[#F4F4F5] text-white dark:text-black'
                : 'text-[#6B6368] dark:text-[#A1A1AA] hover:text-[#1C191C] dark:hover:text-white'
            }`}
          >
            Viable & Aligned ({state.ideas.filter((i) => i.verdict === 'aligned').length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('procrastination')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              filter === 'procrastination'
                ? 'bg-[#1C191C] dark:bg-[#F4F4F5] text-white dark:text-black'
                : 'text-[#6B6368] dark:text-[#A1A1AA] hover:text-[#1C191C] dark:hover:text-white'
            }`}
          >
            Procrastination Vault ({state.ideas.filter((i) => i.verdict !== 'aligned').length})
          </button>
        </div>
      </div>

      {/* Validation Results */}
      {filteredIdeas.length === 0 ? (
        <div className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-10 text-center">
          <Archive className="w-8 h-8 mx-auto text-[#B4A8AD] dark:text-[#52525B]" />
          <h3 className="mt-3 font-display text-lg font-semibold">No validated ideas yet</h3>
          <p className="mt-1 text-sm text-[#6B6368] dark:text-[#A1A1AA]">
            Test a new idea above to see whether it aligns with your life goals or acts as a distraction.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredIdeas.map((item) => {
            const isAligned = item.verdict === 'aligned';
            const habitAdded = !!habitAddedIds[item.id];
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          isAligned
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {isAligned ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                        {item.verdict === 'aligned'
                          ? 'Viable Goal-Aligned Concept'
                          : item.verdict === 'procrastination'
                            ? 'Procrastination Trigger'
                            : 'Deferred for Later'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-num">{item.alignmentScore}% goal fit</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-num">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {item.estimatedMinutes}m
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.bestTimeSlot}</span>
                    </div>
                    <h3 className="mt-2 font-display text-lg font-semibold text-[#1C191C] dark:text-white">
                      {item.headline}
                    </h3>
                    <p className="mt-1 text-sm text-[#5C5459] dark:text-[#D4D4D8]">
                      Input: “{item.text}”
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteIdea(item.id)}
                    aria-label="Remove idea"
                    className="p-2 rounded-lg text-[#8C8287] hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-[#F2E9EC] dark:border-[#1E1E24] grid md:grid-cols-2 gap-5">
                  <div>
                    <div className="text-xs font-semibold text-[#1C191C] dark:text-[#F4F4F5]">
                      Goal & Routine Analysis
                    </div>
                    <p className="mt-1 text-sm text-[#5C5459] dark:text-[#A1A1AA] leading-relaxed">
                      {item.reasoning}
                    </p>
                    <div className="mt-3 text-xs font-semibold text-[#1C191C] dark:text-[#F4F4F5]">
                      {isAligned ? 'How to Integrate Productively' : 'Routine Protection Advice'}
                    </div>
                    <p className="mt-1 text-sm text-[#5C5459] dark:text-[#A1A1AA] leading-relaxed">
                      {item.routineAdvice}
                    </p>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-[#1C191C] dark:text-[#F4F4F5]">
                      {isAligned ? 'Productive Execution Steps' : 'Better Next Move'}
                    </div>
                    <ul className="mt-2 space-y-1.5 text-sm text-[#5C5459] dark:text-[#A1A1AA]">
                      {item.actionSteps.map((step, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="font-mono-num text-xs text-[#C94A6A] dark:text-[#E87A90] mt-0.5">
                            0{idx + 1}.
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>

                    {isAligned && (
                      <div className="mt-4 flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          disabled={item.addedToSchedule}
                          onClick={() => onScheduleIdea(item)}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#1C191C] dark:bg-[#F4F4F5] px-4 py-2 text-xs font-semibold text-white dark:text-black hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[40px]"
                        >
                          {item.addedToSchedule ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Scheduled
                            </>
                          ) : (
                            <>
                              <CalendarPlus className="w-3.5 h-3.5" />
                              Add to Daily Schedule ({item.estimatedMinutes}m)
                            </>
                          )}
                        </button>

                        {item.shouldAddToRoutine && (
                          <button
                            type="button"
                            disabled={habitAdded}
                            onClick={() => handleAddAsHabit(item)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#EADFE2] dark:border-[#27272A] px-3.5 py-2 text-xs font-medium hover:bg-[#FAF2F4] dark:hover:bg-[#141418] disabled:opacity-50 min-h-[40px]"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#C94A6A] dark:text-[#E87A90]" />
                            {habitAdded ? 'Added to Habits' : 'Add as Daily Habit'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
