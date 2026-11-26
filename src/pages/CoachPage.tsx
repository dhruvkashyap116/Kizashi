import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  LayoutGrid,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Send,
  StickyNote,
  Trash2,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { GroundingSource, KeepNote, KizashiState } from '../types/kizashi';
import type { CalendarEventItem, GoogleTaskItem } from '../utils/firebaseWorkspace';
import { buildPortableHtmlApp, formatDateKey } from '../utils/storage';
import { decodeBase64Pcm24k, pcmFloat32ToBase64 } from '../utils/audioAlarm';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: GroundingSource[];
}

interface CoachPageProps {
  state: KizashiState;
  workspaceUser: User | null;
  workspaceToken: string | null;
  calendarEvents: CalendarEventItem[];
  googleTasks: GoogleTaskItem[];
  workspaceBusy: boolean;
  workspaceError: string | null;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  onRefreshWorkspace: () => void;
  onRequestAddTask: (title: string) => void;
  onRequestToggleTask: (task: GoogleTaskItem) => void;
  onAddNote: (note: Omit<KeepNote, 'id' | 'updatedAt'>) => void;
  onDeleteNote: (id: string) => void;
  onOpenWidgetMode: () => void;
}

export const CoachPage: React.FC<CoachPageProps> = ({
  state,
  workspaceUser,
  workspaceToken,
  calendarEvents,
  googleTasks,
  workspaceBusy,
  workspaceError,
  onGoogleSignIn,
  onGoogleSignOut,
  onRefreshWorkspace,
  onRequestAddTask,
  onRequestToggleTask,
  onAddNote,
  onDeleteNote,
  onOpenWidgetMode,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      text: `Welcome${state.profile.name ? `, ${state.profile.name}` : ''}. Ask me how to tackle today’s priority in focused blocks, or tap Live Voice for a real-time spoken check-in.`,
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  // Live Voice API state
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string>('Idle');
  const [liveTranscripts, setLiveTranscripts] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  // Tasks & Notes
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  useEffect(() => {
    return () => stopLiveVoice();
  }, []);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatBusy) return;
    const userMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      role: 'user',
      text: chatInput.trim(),
    };
    const nextThread = [...messages, userMsg];
    setMessages(nextThread);
    setChatInput('');
    setChatBusy(true);

    try {
      const today = formatDateKey();
      const todayMap = state.habitLogs[today] || {};
      const done = state.habits.filter((h) => todayMap[h.id]).length;
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextThread.map((m) => ({ role: m.role, text: m.text })),
          profile: state.profile,
          goals: state.goals,
          todaySummary: `${done}/${state.habits.length} habits completed today`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat failed.');
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}-a`,
          role: 'assistant',
          text: data.reply || 'Stay steady on your next focused block.',
          sources: data.sources || [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}-e`,
          role: 'assistant',
          text: err instanceof Error ? err.message : 'Unable to reach Sensei right now.',
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  const startLiveVoice = async () => {
    setLiveStatus('Connecting...');
    setLiveTranscripts([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      wsRef.current = ws;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextPlayTimeRef.current = outputCtx.currentTime;

      ws.onopen = () => {
        setLiveConnected(true);
        setLiveStatus('Listening — speak naturally');
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(inputCtx.destination);

        processor.onaudioprocess = (ev) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const b64 = pcmFloat32ToBase64(ev.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ audio: b64 }));
        };
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio && outputCtxRef.current) {
          const buf = decodeBase64Pcm24k(msg.audio, outputCtxRef.current);
          const src = outputCtxRef.current.createBufferSource();
          src.buffer = buf;
          src.connect(outputCtxRef.current.destination);
          const now = outputCtxRef.current.currentTime;
          const startAt = Math.max(now, nextPlayTimeRef.current);
          src.start(startAt);
          nextPlayTimeRef.current = startAt + buf.duration;
        }
        if (msg.inputTranscript) {
          setLiveTranscripts((prev) => [...prev.slice(-8), `You: ${msg.inputTranscript}`]);
        }
        if (msg.outputTranscript) {
          setLiveTranscripts((prev) => [...prev.slice(-8), `Sensei: ${msg.outputTranscript}`]);
        }
        if (msg.interrupted && outputCtxRef.current) {
          nextPlayTimeRef.current = outputCtxRef.current.currentTime;
        }
        if (msg.error) {
          setLiveStatus(`Error: ${msg.error}`);
        }
      };

      ws.onclose = () => {
        stopLiveVoice();
      };
    } catch {
      setLiveStatus('Microphone permission needed for Live Voice.');
      stopLiveVoice();
    }
  };

  const stopLiveVoice = () => {
    try {
      wsRef.current?.close();
    } catch {
      // ignore
    }
    wsRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    inputCtxRef.current?.close().catch(() => {});
    outputCtxRef.current?.close().catch(() => {});
    inputCtxRef.current = null;
    outputCtxRef.current = null;
    setLiveConnected(false);
    setLiveStatus('Idle');
  };

  const handleDownloadPortableApp = () => {
    const html = buildPortableHtmlApp(state);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kizashi-portable-app.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() && !noteBody.trim()) return;
    onAddNote({
      title: noteTitle.trim() || 'Quick Note',
      body: noteBody.trim(),
    });
    setNoteTitle('');
    setNoteBody('');
  };

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#1C191C] dark:text-white">
          Sensei Coach, Workspace Sync & Widget
        </h1>
        <p className="mt-1 text-sm text-[#5C5459] dark:text-[#A1A1AA]">
          Talk or chat with Kizashi Sensei, sync Google Calendar & Google Tasks, keep quick notes, or launch your standalone widget.
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left: Multi-Turn Sensei Chat + Live Voice */}
        <section className="lg:col-span-7 rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#F2E9EC] dark:border-[#1E1E24]">
            <div className="flex items-center gap-3">
              <img
                src="/src/assets/images/sensei_avatar_1795157399346.jpg"
                alt="Sensei Coach"
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-xl object-cover border border-[#EADFE2] dark:border-[#27272A]"
              />
              <div>
                <h2 className="font-display text-lg font-semibold">Kizashi Sensei</h2>
                <div className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                  Voice: {liveStatus}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={liveConnected ? stopLiveVoice : startLiveVoice}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors min-h-[40px] ${
                liveConnected
                  ? 'bg-rose-600 text-white'
                  : 'bg-[#1C191C] dark:bg-[#F4F4F5] text-white dark:text-black'
              }`}
            >
              {liveConnected ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              {liveConnected ? 'End Live Voice' : 'Live Voice Call'}
            </button>
          </div>

          {liveTranscripts.length > 0 && (
            <div className="mt-3 rounded-xl border border-[#EADFE2] dark:border-[#24242A] bg-[#FCF8F6] dark:bg-black p-3 text-xs space-y-1">
              {liveTranscripts.map((line, i) => (
                <div key={i} className="text-[#5C5459] dark:text-[#D4D4D8]">{line}</div>
              ))}
            </div>
          )}

          <div className="mt-4 flex-1 max-h-[360px] overflow-y-auto space-y-3 pr-1">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl p-3.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#FAF2F4] dark:bg-[#141418] text-[#1C191C] dark:text-[#F4F4F5] ml-8'
                    : 'border border-[#EADFE2] dark:border-[#222228] bg-[#FCF8F6] dark:bg-black text-[#1C191C] dark:text-[#E4E4E7] mr-6'
                }`}
              >
                <div className="whitespace-pre-wrap">{m.text}</div>
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[#EADFE2] dark:border-[#222228] flex flex-wrap gap-2 text-xs">
                    {m.sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline text-[#C94A6A] dark:text-[#E87A90]"
                      >
                        {s.title}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chatBusy && (
              <div className="flex items-center gap-2 text-xs text-[#6B6368] dark:text-[#A1A1AA] py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Sensei is thinking...
              </div>
            )}
          </div>

          <form onSubmit={handleSendChat} className="mt-4 pt-3 border-t border-[#F2E9EC] dark:border-[#1E1E24] flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask Sensei how to structure your next hour..."
              className="flex-1 rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#C94A6A] dark:focus:border-[#E87A90]"
            />
            <button
              type="submit"
              disabled={chatBusy || !chatInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#C94A6A] dark:bg-[#E87A90] px-4 py-2.5 text-sm font-semibold text-white dark:text-black hover:opacity-90 disabled:opacity-50 min-h-[42px]"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </form>
        </section>

        {/* Right: Google Workspace Sync + Widget & Portable Export */}
        <section className="lg:col-span-5 space-y-6">
          {/* Google Calendar & Tasks */}
          <div className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#F2E9EC] dark:border-[#1E1E24]">
              <div>
                <h2 className="font-display text-lg font-semibold">Google Calendar & Tasks</h2>
                <p className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                  {workspaceUser ? `Connected as ${workspaceUser.email}` : 'Sync events and to-dos'}
                </p>
              </div>
              {workspaceToken && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onRefreshWorkspace}
                    disabled={workspaceBusy}
                    aria-label="Refresh Workspace"
                    className="p-2 rounded-lg border border-[#EADFE2] dark:border-[#27272A] hover:bg-[#FAF2F4] dark:hover:bg-[#141418]"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${workspaceBusy ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={onGoogleSignOut}
                    aria-label="Sign out of Google"
                    className="p-2 rounded-lg border border-[#EADFE2] dark:border-[#27272A] hover:bg-[#FAF2F4] dark:hover:bg-[#141418]"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {!workspaceToken ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={workspaceBusy}
                  className="inline-flex items-center gap-3 rounded-lg border border-[#747775] bg-white px-4 py-2.5 text-sm font-medium text-[#1F1F1F] shadow-xs hover:bg-[#F8F9FA] transition-colors min-h-[42px]"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  Sign in with Google
                </button>
                {workspaceError && (
                  <p className="mt-2.5 text-xs text-rose-600 dark:text-rose-400">{workspaceError}</p>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#C94A6A] dark:text-[#E87A90]">
                    <Calendar className="w-3.5 h-3.5" />
                    Today’s Calendar Events ({calendarEvents.length})
                  </div>
                  {calendarEvents.length === 0 ? (
                    <p className="mt-1 text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                      No remaining events on primary calendar today.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-xs">
                      {calendarEvents.slice(0, 4).map((ev) => (
                        <li key={ev.id} className="flex justify-between gap-2">
                          <span className="truncate">{ev.summary}</span>
                          <span className="font-mono-num text-[#6B6368] dark:text-[#A1A1AA] shrink-0">
                            {ev.start.includes('T') ? ev.start.slice(11, 16) : 'All day'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="pt-3 border-t border-[#F2E9EC] dark:border-[#1E1E24]">
                  <div className="text-xs font-semibold text-[#1C191C] dark:text-white mb-2">
                    Google Tasks ({googleTasks.length})
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newTaskTitle.trim()) return;
                      onRequestAddTask(newTaskTitle.trim());
                      setNewTaskTitle('');
                    }}
                    className="flex gap-2 mb-2"
                  >
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="New Google Task..."
                      className="flex-1 rounded-lg border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-2.5 py-1.5 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-[#1C191C] dark:bg-[#F4F4F5] px-2.5 py-1.5 text-xs font-semibold text-white dark:text-black"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </form>
                  <div className="max-h-36 overflow-y-auto divide-y divide-[#F6EFF2] dark:divide-[#18181B]">
                    {googleTasks.slice(0, 6).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onRequestToggleTask(t)}
                        className="w-full py-1.5 flex items-center gap-2 text-left text-xs"
                      >
                        {t.status === 'completed' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#C94A6A] dark:text-[#E87A90] shrink-0" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-[#B4A8AD] dark:text-[#52525B] shrink-0" />
                        )}
                        <span className={t.status === 'completed' ? 'line-through text-[#8C8287]' : ''}>
                          {t.title}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Portable App & Widget Card */}
          <div className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
            <h2 className="font-display text-lg font-semibold">Desktop Widget & Portable App</h2>
            <p className="mt-1 text-xs text-[#6B6368] dark:text-[#A1A1AA] leading-relaxed">
              Use Kizashi as a compact macOS/Windows widget or download a self-contained single-file HTML companion for your GitHub zip folder.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={onOpenWidgetMode}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1C191C] dark:bg-[#F4F4F5] px-4 py-2 text-xs font-semibold text-white dark:text-black min-h-[40px]"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Open Focus Widget
              </button>
              <button
                type="button"
                onClick={handleDownloadPortableApp}
                className="inline-flex items-center gap-2 rounded-xl border border-[#EADFE2] dark:border-[#27272A] px-4 py-2 text-xs font-medium hover:bg-[#FAF2F4] dark:hover:bg-[#141418] min-h-[40px]"
              >
                <Download className="w-3.5 h-3.5 text-[#C94A6A] dark:text-[#E87A90]" />
                Download Portable HTML App
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Keep-Style Quick Notes */}
      <section className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#F2E9EC] dark:border-[#1E1E24]">
          <div className="flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-[#C94A6A] dark:text-[#E87A90]" />
            <h2 className="font-display text-lg font-semibold">Quick Keep Notes</h2>
          </div>
          <span className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">
            Saved locally (Enterprise Google Keep API requires domain-wide Workspace admin delegation)
          </span>
        </div>

        <form onSubmit={handleAddNote} className="mt-4 grid sm:grid-cols-12 gap-3">
          <input
            type="text"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="Note title..."
            className="sm:col-span-3 rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Capture a quick note, reminder, or link..."
            className="sm:col-span-7 rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="sm:col-span-2 rounded-xl bg-[#1C191C] dark:bg-[#F4F4F5] px-4 py-2 text-xs font-semibold text-white dark:text-black min-h-[40px]"
          >
            Save Note
          </button>
        </form>

        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {state.notes.map((note) => (
            <div
              key={note.id}
              className="rounded-xl border border-[#EADFE2] dark:border-[#24242A] bg-[#FCF8F6] dark:bg-black p-4 flex flex-col justify-between gap-2"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#1C191C] dark:text-white">{note.title}</h3>
                  <button
                    type="button"
                    onClick={() => onDeleteNote(note.id)}
                    aria-label="Delete note"
                    className="text-[#8C8287] hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-[#5C5459] dark:text-[#A1A1AA] leading-relaxed">
                  {note.body}
                </p>
              </div>
              <div className="text-[11px] font-mono-num text-[#8C8287] dark:text-[#71717A]">
                {new Date(note.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
