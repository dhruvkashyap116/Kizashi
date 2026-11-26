import type { NextFunction, Request, Response } from 'express';
import { clampNumber, sanitizeText } from '../src/utils/validation.ts';

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/aac',
  'audio/flac',
]);

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const BASE64_PATTERN = /^[A-Za-z0-9+/=\s]+$/;

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), notifications=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

export function createRateLimiter(options: { windowMs: number; maxRequests: number }) {
  const hits = new Map<string, number[]>();
  const { windowMs, maxRequests } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : '') ||
      req.ip ||
      'unknown';

    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      const retrySec = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retrySec));
      res.status(429).json({
        error: 'Too many requests in a short window. Please pause briefly and try again.',
      });
      return;
    }
    recent.push(now);
    hits.set(ip, recent);

    // Prevent unbounded map growth
    if (hits.size > 1000) {
      for (const [key, list] of hits.entries()) {
        if (list.every((ts) => now - ts >= windowMs)) {
          hits.delete(key);
        }
      }
    }
    next();
  };
}

export interface ValidationFailure {
  ok: false;
  error: string;
}

export interface ValidationSuccess<T> {
  ok: true;
  data: T;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export function validateBootstrapInput(body: unknown): ValidationResult<{
  profile: {
    name: string;
    primaryGoal: string;
    interests: string;
    currentHabits: string;
    thingsAvoided: string;
    mainDistractions: string;
    wakeTime: string;
    sleepTime: string;
  };
}> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }
  const raw = (body as { profile?: unknown }).profile;
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Missing profile details.' };
  }
  const p = raw as Record<string, unknown>;
  const primaryGoal = sanitizeText(p.primaryGoal, 300);
  if (!primaryGoal) {
    return { ok: false, error: 'Please specify a primary life goal.' };
  }
  return {
    ok: true,
    data: {
      profile: {
        name: sanitizeText(p.name, 80) || 'Traveler',
        primaryGoal,
        interests: sanitizeText(p.interests, 400),
        currentHabits: sanitizeText(p.currentHabits, 400),
        thingsAvoided: sanitizeText(p.thingsAvoided, 400),
        mainDistractions: sanitizeText(p.mainDistractions, 400),
        wakeTime: sanitizeText(p.wakeTime, 10) || '06:30',
        sleepTime: sanitizeText(p.sleepTime, 10) || '22:30',
      },
    },
  };
}

export function validateTriageInput(body: unknown): ValidationResult<{
  ideaText: string;
  estimatedContext: string;
  profile: { name: string; primaryGoal: string; interests: string; mainDistractions: string };
  goals: Array<{ title: string; targetTimeframe: string }>;
  habits: Array<{ title: string; timeOfDay: string; durationMin: number }>;
  schedule: Array<{ time: string; title: string; durationMin: number }>;
}> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }
  const b = body as Record<string, unknown>;
  const ideaText = sanitizeText(b.ideaText, 1200);
  if (!ideaText) {
    return { ok: false, error: 'Please enter or dictate an idea to validate.' };
  }
  const estimatedContext = sanitizeText(b.estimatedContext, 300);
  const p = (b.profile && typeof b.profile === 'object' ? b.profile : {}) as Record<string, unknown>;

  const goals = Array.isArray(b.goals)
    ? b.goals.slice(0, 12).map((g) => {
        const item = (g && typeof g === 'object' ? g : {}) as Record<string, unknown>;
        return {
          title: sanitizeText(item.title, 200),
          targetTimeframe: sanitizeText(item.targetTimeframe, 40) || 'ongoing',
        };
      }).filter((g) => g.title.length > 0)
    : [];

  const habits = Array.isArray(b.habits)
    ? b.habits.slice(0, 25).map((h) => {
        const item = (h && typeof h === 'object' ? h : {}) as Record<string, unknown>;
        return {
          title: sanitizeText(item.title, 160),
          timeOfDay: sanitizeText(item.timeOfDay, 20) || 'Daily',
          durationMin: clampNumber(item.durationMin, 1, 300, 15),
        };
      }).filter((h) => h.title.length > 0)
    : [];

  const schedule = Array.isArray(b.schedule)
    ? b.schedule.slice(0, 30).map((s) => {
        const item = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
        return {
          time: sanitizeText(item.time, 10) || '09:00',
          title: sanitizeText(item.title, 160),
          durationMin: clampNumber(item.durationMin, 1, 360, 30),
        };
      }).filter((s) => s.title.length > 0)
    : [];

  return {
    ok: true,
    data: {
      ideaText,
      estimatedContext,
      profile: {
        name: sanitizeText(p.name, 80) || 'User',
        primaryGoal: sanitizeText(p.primaryGoal, 300),
        interests: sanitizeText(p.interests, 400),
        mainDistractions: sanitizeText(p.mainDistractions, 400),
      },
      goals,
      habits,
      schedule,
    },
  };
}

export function validateRoadmapInput(body: unknown): ValidationResult<{
  goalTitle: string;
  timeframe: string;
  weeklyHoursAvailable: number;
  profile: {
    currentHabits: string;
    mainDistractions: string;
    wakeTime: string;
    sleepTime: string;
  };
}> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }
  const b = body as Record<string, unknown>;
  const goalTitle = sanitizeText(b.goalTitle, 250);
  if (!goalTitle) {
    return { ok: false, error: 'Please enter a goal title.' };
  }
  const p = (b.profile && typeof b.profile === 'object' ? b.profile : {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      goalTitle,
      timeframe: sanitizeText(b.timeframe, 40) || '3 months',
      weeklyHoursAvailable: clampNumber(b.weeklyHoursAvailable, 1, 80, 7),
      profile: {
        currentHabits: sanitizeText(p.currentHabits, 400) || 'Not specified',
        mainDistractions: sanitizeText(p.mainDistractions, 400) || 'Not specified',
        wakeTime: sanitizeText(p.wakeTime, 10) || '07:00',
        sleepTime: sanitizeText(p.sleepTime, 10) || '23:00',
      },
    },
  };
}

export function validateAudioTranscribeInput(body: unknown): ValidationResult<{
  audioBase64: string;
  mimeType: string;
}> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.audioBase64 !== 'string' || b.audioBase64.trim().length === 0) {
    return { ok: false, error: 'Missing audio data.' };
  }
  const audioBase64 = b.audioBase64.trim();
  if (audioBase64.length > 12_000_000) {
    return { ok: false, error: 'Audio recording is too large. Keep dictation under 90 seconds.' };
  }
  if (!BASE64_PATTERN.test(audioBase64)) {
    return { ok: false, error: 'Invalid audio encoding.' };
  }
  const rawMime = typeof b.mimeType === 'string' ? b.mimeType.split(';')[0].trim().toLowerCase() : 'audio/webm';
  const mimeType = ALLOWED_AUDIO_MIMES.has(rawMime) ? rawMime : 'audio/webm';
  return { ok: true, data: { audioBase64, mimeType } };
}

export function validateGroomingImageInput(body: unknown): ValidationResult<{
  imageBase64: string;
  mimeType: string;
  primaryGoal: string;
  occasion: string;
}> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.imageBase64 !== 'string' || b.imageBase64.trim().length === 0) {
    return { ok: false, error: 'Missing image data.' };
  }
  const imageBase64 = b.imageBase64.trim();
  if (imageBase64.length > 10_000_000) {
    return { ok: false, error: 'Image is too large. Please upload a smaller photo.' };
  }
  if (!BASE64_PATTERN.test(imageBase64)) {
    return { ok: false, error: 'Invalid image encoding.' };
  }
  const rawMime = typeof b.mimeType === 'string' ? b.mimeType.split(';')[0].trim().toLowerCase() : 'image/jpeg';
  if (!ALLOWED_IMAGE_MIMES.has(rawMime)) {
    return { ok: false, error: 'Unsupported image format. Please use JPEG, PNG, or WebP.' };
  }
  return {
    ok: true,
    data: {
      imageBase64,
      mimeType: rawMime,
      primaryGoal: sanitizeText(b.primaryGoal, 300) || 'Career & personal excellence',
      occasion: sanitizeText(b.occasion, 120) || 'Daily productive routine',
    },
  };
}

export function validateChatInput(body: unknown): ValidationResult<{
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
  profile: { name: string; primaryGoal: string; mainDistractions: string };
  goals: Array<{ title: string }>;
  todaySummary: string;
}> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    return { ok: false, error: 'Please enter a message for Sensei.' };
  }
  const messages = b.messages
    .slice(-24)
    .map((m) => {
      const item = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
      return {
        role: item.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        text: sanitizeText(item.text, 2000),
      };
    })
    .filter((m) => m.text.length > 0);

  if (messages.length === 0) {
    return { ok: false, error: 'Please enter a non-empty message.' };
  }

  const p = (b.profile && typeof b.profile === 'object' ? b.profile : {}) as Record<string, unknown>;
  const goals = Array.isArray(b.goals)
    ? b.goals
        .slice(0, 12)
        .map((g) => ({
          title: sanitizeText((g && typeof g === 'object' ? (g as Record<string, unknown>).title : ''), 200),
        }))
        .filter((g) => g.title.length > 0)
    : [];

  return {
    ok: true,
    data: {
      messages,
      profile: {
        name: sanitizeText(p.name, 80) || 'Friend',
        primaryGoal: sanitizeText(p.primaryGoal, 300) || 'Not set',
        mainDistractions: sanitizeText(p.mainDistractions, 300) || 'Not set',
      },
      goals,
      todaySummary: sanitizeText(b.todaySummary, 200) || 'Just getting started',
    },
  };
}
