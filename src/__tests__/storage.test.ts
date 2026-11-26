import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_STATE,
  buildPortableHtmlApp,
  calculateSleepHours,
  computeCompletionStats,
  computeHabitStreak,
  formatDateKey,
  getRecentDateKeys,
  loadState,
  saveState,
} from '../utils/storage';
import { getDailyAnimeQuote, getJapaneseGreeting } from '../data/animeQuotes';

describe('Kizashi storage & O(1) analytics utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('computes habit streaks using O(1) date hash lookups and preserves yesterday streak if today unchecked', () => {
    const today = new Date();
    const y1 = new Date(today);
    y1.setDate(today.getDate() - 1);
    const y2 = new Date(today);
    y2.setDate(today.getDate() - 2);

    const logs = {
      [formatDateKey(y1)]: { 'h-1': true },
      [formatDateKey(y2)]: { 'h-1': true },
    };

    expect(computeHabitStreak('h-1', logs)).toBe(2);

    const withToday = {
      ...logs,
      [formatDateKey(today)]: { 'h-1': true },
    };
    expect(computeHabitStreak('h-1', withToday)).toBe(3);
  });

  it('computes daily, weekly, and monthly completion rates accurately', () => {
    const keys = getRecentDateKeys(7);
    const habits = [{ id: 'h-1' }, { id: 'h-2' }];
    const logs: Record<string, Record<string, boolean>> = {};
    keys.forEach((k) => {
      logs[k] = { 'h-1': true, 'h-2': false };
    });

    const weekly = computeCompletionStats(7, habits, logs);
    expect(weekly.completed).toBe(7);
    expect(weekly.total).toBe(14);
    expect(weekly.rate).toBe(50);

    const daily = computeCompletionStats(1, habits, logs);
    expect(daily.perDay).toHaveLength(1);
    expect(daily.rate).toBe(50);

    const monthly = computeCompletionStats(30, habits, logs);
    expect(monthly.perDay).toHaveLength(30);
    expect(monthly.total).toBe(60);
  });

  it('calculates overnight sleep durations accurately', () => {
    expect(calculateSleepHours('22:30', '06:30')).toBe('8.0h');
    expect(calculateSleepHours('23:15', '06:45')).toBe('7.5h');
    expect(calculateSleepHours('01:00', '08:00')).toBe('7.0h');
  });

  it('persists and recovers cleanly from corrupted localStorage', () => {
    saveState({
      ...DEFAULT_STATE,
      profile: { ...DEFAULT_STATE.profile, name: 'Kenji', onboarded: true },
    });
    const loaded = loadState();
    expect(loaded.profile.name).toBe('Kenji');
    expect(loaded.profile.onboarded).toBe(true);

    localStorage.setItem('kizashi_app_state_v1', '{invalid-json');
    const recovered = loadState();
    expect(recovered.profile.primaryGoal).toBe(DEFAULT_STATE.profile.primaryGoal);
  });

  it('exports portable HTML safely without innerHTML XSS sinks', () => {
    const maliciousState = {
      ...DEFAULT_STATE,
      schedule: [
        {
          id: 's-xss',
          time: '09:00',
          title: '<img src=x onerror=alert(1)>Deep Work',
          durationMin: 45,
          type: 'deep' as const,
        },
      ],
    };
    const html = buildPortableHtmlApp(maliciousState);
    expect(html).not.toContain('div.innerHTML');
    expect(html).toContain('textContent');
    expect(html).toContain('\\u003cimg src=x onerror=alert(1)>');
  });

  it('returns time-aware Japanese greetings and anime quotes', () => {
    const q = getDailyAnimeQuote();
    expect(q.quote.length).toBeGreaterThan(10);
    expect(q.character.length).toBeGreaterThan(0);

    const g = getJapaneseGreeting('Dhruv');
    expect(g.en).toContain('Dhruv');
    expect(g.jp.length).toBeGreaterThan(0);
  });
});
