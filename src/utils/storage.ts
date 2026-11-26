import type { KizashiState } from '../types/kizashi';

const STORAGE_KEY = 'kizashi_app_state_v1';

export function formatDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getRecentDateKeys(days: number): string[] {
  const keys: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    keys.push(formatDateKey(d));
  }
  return keys;
}

export const DEFAULT_STATE: KizashiState = {
  theme: 'light',
  profile: {
    name: '',
    primaryGoal: 'Build consistent daily focus and ship meaningful work',
    interests: 'Technology, Japanese aesthetics, fitness, continuous learning',
    currentHabits: 'Morning water, occasional journaling',
    thingsAvoided: 'Late-night doomscrolling, skipping sleep',
    mainDistractions: 'Random side ideas mid-task, social media notifications',
    wakeTime: '06:30',
    sleepTime: '22:30',
    focusMotto: 'One aligned step before noon sets the rhythm for the whole day.',
    onboarded: false,
  },
  habits: [
    {
      id: 'h-1',
      title: '5-Min Morning Alignment & Priorities',
      timeOfDay: 'Morning',
      durationMin: 5,
      category: 'Focus',
    },
    {
      id: 'h-2',
      title: '60-Min Deep Work on Primary Goal',
      timeOfDay: 'Morning',
      durationMin: 60,
      category: 'Goal',
    },
    {
      id: 'h-3',
      title: 'Grooming, Hydration & Walk (3,000+ steps)',
      timeOfDay: 'Midday',
      durationMin: 20,
      category: 'Health',
    },
    {
      id: 'h-4',
      title: 'Screen Wind-Down Before Bed',
      timeOfDay: 'Evening',
      durationMin: 15,
      category: 'Sleep',
    },
  ],
  habitLogs: {},
  stepLogs: {},
  schedule: [
    { id: 's-1', time: '06:30', title: 'Wake, Hydrate & Fresh Grooming', durationMin: 30, type: 'routine' },
    { id: 's-2', time: '07:00', title: '5-Min Kizashi Alignment Check', durationMin: 5, type: 'habit' },
    { id: 's-3', time: '07:15', title: 'Deep Focus Block (Primary Goal)', durationMin: 90, type: 'deep' },
    { id: 's-4', time: '12:30', title: 'Midday Walk & Reset', durationMin: 25, type: 'routine' },
    { id: 's-5', time: '22:00', title: 'Evening Shutdown & Sleep Prep', durationMin: 30, type: 'rest' },
  ],
  goals: [],
  ideas: [],
  notes: [
    {
      id: 'n-1',
      title: '5-Minute Rule',
      body: 'Spend only 5 minutes checking today’s plan, then close distractions and begin your primary block.',
      updatedAt: new Date().toISOString(),
      pinned: true,
    },
  ],
  sleep: {
    bedtime: '22:30',
    wakeTime: '06:30',
    alarmEnabled: false,
    chimeTone: 'koto',
    windDownMinutes: 30,
  },
  groomingReports: [],
  groomingChecked: {},
};

export function loadState(): KizashiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<KizashiState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      profile: { ...DEFAULT_STATE.profile, ...(parsed.profile || {}) },
      sleep: { ...DEFAULT_STATE.sleep, ...(parsed.sleep || {}) },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(state: KizashiState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota warnings gracefully
  }
}

/**
 * O(k) streak lookup where k = current streak length (typically < 365).
 * Uses direct hash-map lookup per date key.
 */
export function computeHabitStreak(
  habitId: string,
  habitLogs: Record<string, Record<string, boolean>>
): number {
  let streak = 0;
  const cursor = new Date();
  const todayStr = formatDateKey(cursor);
  // Allow streak to continue from yesterday if today isn't checked yet
  if (!habitLogs[todayStr]?.[habitId]) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (streak < 365) {
    const key = formatDateKey(cursor);
    if (habitLogs[key]?.[habitId]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/**
 * O(N * H) where N = window days (7 or 30) and H = number of habits.
 * Fast integer arithmetic, zero nested scans over entire history.
 */
export function computeCompletionStats(
  days: number,
  habits: { id: string }[],
  habitLogs: Record<string, Record<string, boolean>>
): { completed: number; total: number; rate: number; perDay: { date: string; count: number; total: number }[] } {
  const keys = getRecentDateKeys(days);
  const totalPerDay = habits.length;
  let completed = 0;
  const perDay = keys.map((date) => {
    const dayMap = habitLogs[date] || {};
    let count = 0;
    for (let i = 0; i < totalPerDay; i++) {
      if (dayMap[habits[i].id]) count++;
    }
    completed += count;
    return { date, count, total: totalPerDay };
  });
  const total = days * totalPerDay;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, rate, perDay };
}

export function calculateSleepHours(bedtime: string, wakeTime: string): string {
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wakeTime.split(':').map(Number);
  if (Number.isNaN(bh) || Number.isNaN(wh)) return '8.0h';
  let diff = (wh * 60 + wm) - (bh * 60 + bm);
  if (diff <= 0) diff += 24 * 60;
  return `${(diff / 60).toFixed(1)}h`;
}

/**
 * Generates a self-contained single-file HTML mini-app / desktop widget
 * that runs locally on macOS or Windows just by double-clicking it (GitHub offline portability).
 */
export function buildPortableHtmlApp(state: KizashiState): string {
  const safeData = JSON.stringify({
    name: state.profile.name || 'Friend',
    primaryGoal: state.profile.primaryGoal,
    motto: state.profile.focusMotto,
    habits: state.habits,
    schedule: state.schedule,
    sleep: state.sleep,
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Kizashi Portable Focus Companion</title>
<style>
  :root { --bg:#FCF8F6; --card:#FFFFFF; --text:#1C191C; --muted:#6B6368; --accent:#C94A6A; --border:#EADFE2; }
  body.dark { --bg:#000000; --card:#0B0B0D; --text:#F4F4F5; --muted:#A1A1AA; --accent:#E87A90; --border:#222228; }
  * { box-sizing:border-box; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
  body { margin:0; background:var(--bg); color:var(--text); padding:24px; max-width:860px; margin-inline:auto; }
  .top { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:14px; margin-bottom:20px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:18px; margin-bottom:16px; }
  .btn { background:var(--accent); color:#fff; border:none; border-radius:8px; padding:8px 14px; cursor:pointer; font-weight:600; }
  .row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border); }
  .row:last-child { border-bottom:none; }
  label { display:flex; align-items:center; gap:10px; cursor:pointer; }
  .muted { color:var(--muted); font-size:13px; }
</style>
</head>
<body class="${state.theme === 'dark' ? 'dark' : ''}">
  <div class="top">
    <div>
      <h1 style="margin:0;font-size:22px;">Kizashi · Portable Companion</h1>
      <div class="muted" id="goal"></div>
    </div>
    <button class="btn" onclick="document.body.classList.toggle('dark')">Toggle Sumi / Sakura</button>
  </div>
  <div class="card">
    <div class="muted">Today's Habits (Saved locally in this browser)</div>
    <div id="habits"></div>
  </div>
  <div class="card">
    <div class="muted">Daily Rhythm & Sleep (${state.sleep.wakeTime} wake · ${state.sleep.bedtime} sleep)</div>
    <div id="schedule"></div>
  </div>
<script>
  const DATA = ${safeData};
  const key = 'kizashi_portable_' + new Date().toISOString().slice(0,10);
  const done = JSON.parse(localStorage.getItem(key) || '{}');
  document.getElementById('goal').textContent = 'Goal: ' + DATA.primaryGoal;
  const hEl = document.getElementById('habits');
  DATA.habits.forEach(h => {
    const div = document.createElement('div');
    div.className = 'row';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!done[h.id];
    chk.onchange = () => { done[h.id] = chk.checked; localStorage.setItem(key, JSON.stringify(done)); };
    const lbl = document.createElement('label');
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode(h.title + ' (' + h.durationMin + 'm)'));
    const tag = document.createElement('span');
    tag.className = 'muted';
    tag.textContent = h.timeOfDay;
    div.appendChild(lbl);
    div.appendChild(tag);
    hEl.appendChild(div);
  });
  const sEl = document.getElementById('schedule');
  DATA.schedule.forEach(s => {
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = '<strong>' + s.time + ' — ' + s.title + '</strong><span class="muted">' + s.durationMin + 'm</span>';
    sEl.appendChild(div);
  });
</script>
</body>
</html>`;
}
