import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/calendar.events');
provider.addScope('https://www.googleapis.com/auth/tasks');

let isSigningIn = false;
// In-memory only (never localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

export function initWorkspaceAuth(
  onSignedIn: (user: User, token: string) => void,
  onSignedOut: () => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (user && cachedAccessToken) {
      onSignedIn(user, cachedAccessToken);
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      onSignedOut();
    }
  });
}

export async function signInWithGoogleWorkspace(): Promise<{
  user: User;
  accessToken: string;
} | null> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not obtain Google Workspace access token.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getCachedWorkspaceToken(): string | null {
  return cachedAccessToken;
}

export async function signOutWorkspace(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}

export interface CalendarEventItem {
  id: string;
  summary: string;
  start: string;
  end: string;
  htmlLink?: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  due?: string;
}

export async function fetchTodayCalendarEvents(accessToken: string): Promise<CalendarEventItem[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '15',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Calendar error ${res.status}`);
  }
  const data = await res.json();
  return (data.items || []).map(
    (item: {
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      htmlLink?: string;
    }) => ({
      id: item.id,
      summary: item.summary || 'Untitled Event',
      start: item.start?.dateTime || item.start?.date || '',
      end: item.end?.dateTime || item.end?.date || '',
      htmlLink: item.htmlLink,
    })
  );
}

export async function createCalendarEvent(
  accessToken: string,
  title: string,
  startTimeHHMM: string,
  durationMin: number
): Promise<void> {
  const [hh, mm] = startTimeHHMM.split(':').map(Number);
  const start = new Date();
  start.setHours(Number.isNaN(hh) ? 9 : hh, Number.isNaN(mm) ? 0 : mm, 0, 0);
  const end = new Date(start.getTime() + durationMin * 60000);

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: title,
        description: 'Added from Kizashi Focus & Habit Planner',
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create calendar event (${res.status})`);
  }
}

export async function fetchGoogleTasks(accessToken: string): Promise<GoogleTaskItem[]> {
  const listsRes = await fetch(
    'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=5',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listsRes.ok) {
    const err = await listsRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Tasks error ${listsRes.status}`);
  }
  const listsData = await listsRes.json();
  const primaryListId = listsData.items?.[0]?.id || '@default';

  const tasksRes = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(primaryListId)}/tasks?showCompleted=true&maxResults=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!tasksRes.ok) {
    throw new Error(`Tasks fetch error ${tasksRes.status}`);
  }
  const tasksData = await tasksRes.json();
  return (tasksData.items || []).map(
    (t: { id: string; title?: string; status?: 'needsAction' | 'completed'; due?: string }) => ({
      id: t.id,
      title: t.title || 'Untitled Task',
      status: t.status || 'needsAction',
      due: t.due,
    })
  );
}

export async function createGoogleTask(accessToken: string, title: string): Promise<void> {
  const res = await fetch(
    'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to add Google Task (${res.status})`);
  }
}

export async function toggleGoogleTaskStatus(
  accessToken: string,
  taskId: string,
  completed: boolean
): Promise<void> {
  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: completed ? 'completed' : 'needsAction' }),
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to update task (${res.status})`);
  }
}
