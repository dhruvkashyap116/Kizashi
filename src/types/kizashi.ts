export type ThemeMode = 'light' | 'dark';

export type PageTab = 'home' | 'ideas' | 'goals' | 'track' | 'grooming' | 'coach';

export interface UserProfile {
  name: string;
  primaryGoal: string;
  interests: string;
  currentHabits: string;
  thingsAvoided: string;
  mainDistractions: string;
  wakeTime: string; // HH:MM
  sleepTime: string; // HH:MM
  focusMotto: string;
  onboarded: boolean;
}

export interface Habit {
  id: string;
  title: string;
  timeOfDay: 'Morning' | 'Midday' | 'Evening';
  durationMin: number;
  category: string;
  goalId?: string;
}

export interface ScheduleBlock {
  id: string;
  time: string; // HH:MM
  title: string;
  durationMin: number;
  type: 'deep' | 'habit' | 'rest' | 'routine';
  completed?: boolean;
}

export interface RoadmapPhase {
  phaseName: string;
  timeframe: string;
  milestones: string[];
  keyAction: string;
}

export interface SuggestedHabit {
  title: string;
  timeOfDay: 'Morning' | 'Midday' | 'Evening';
  durationMin: number;
  reason: string;
  added?: boolean;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface GoalItem {
  id: string;
  title: string;
  targetTimeframe: string;
  weeklyHours: number;
  status: 'active' | 'paused' | 'completed';
  roadmap?: {
    roadmapTitle: string;
    summary: string;
    recommendedWeeklyHours: number;
    paceSuitabilityQuestion: string;
    paceConfirmed: boolean;
    phases: RoadmapPhase[];
    suggestedDailyHabits: SuggestedHabit[];
    groundingSources?: GroundingSource[];
  };
}

export interface IdeaEntry {
  id: string;
  text: string;
  createdAt: string;
  verdict: 'aligned' | 'procrastination' | 'defer';
  alignmentScore: number;
  headline: string;
  reasoning: string;
  routineAdvice: string;
  estimatedMinutes: number;
  bestTimeSlot: string;
  actionSteps: string[];
  shouldAddToRoutine: boolean;
  addedToSchedule?: boolean;
  archived?: boolean;
}

export interface KeepNote {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
  pinned?: boolean;
}

export interface SleepConfig {
  bedtime: string; // HH:MM
  wakeTime: string; // HH:MM
  alarmEnabled: boolean;
  chimeTone: 'koto' | 'furin' | 'temple';
  windDownMinutes: number;
}

export interface GroomingReport {
  id: string;
  date: string;
  occasion: string;
  overallImpression: string;
  goalAlignmentTip: string;
  quickWins: string[];
  dailyChecklist: string[];
}

export interface SensorPermissions {
  notifications: 'default' | 'granted' | 'denied' | 'unsupported';
  motionSteps: 'idle' | 'active' | 'denied' | 'unsupported';
  camera: 'idle' | 'granted' | 'denied';
  microphone: 'idle' | 'granted' | 'denied';
}

export interface AnimeQuote {
  quote: string;
  character: string;
  anime: string;
  reflection: string;
}

export interface KizashiState {
  theme: ThemeMode;
  profile: UserProfile;
  habits: Habit[];
  // O(1) lookup map: { "YYYY-MM-DD": { [habitId]: true } }
  habitLogs: Record<string, Record<string, boolean>>;
  // O(1) daily steps map: { "YYYY-MM-DD": number }
  stepLogs: Record<string, number>;
  schedule: ScheduleBlock[];
  goals: GoalItem[];
  ideas: IdeaEntry[];
  notes: KeepNote[];
  sleep: SleepConfig;
  groomingReports: GroomingReport[];
  groomingChecked: Record<string, boolean>;
}
