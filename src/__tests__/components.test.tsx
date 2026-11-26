import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomePage } from '../pages/HomePage';
import { IdeasPage } from '../pages/IdeasPage';
import { TrackPage } from '../pages/TrackPage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { WidgetView } from '../components/WidgetView';
import { DEFAULT_STATE } from '../utils/storage';
import type { IdeaEntry, KizashiState } from '../types/kizashi';

const onboardedState: KizashiState = {
  ...DEFAULT_STATE,
  profile: {
    ...DEFAULT_STATE.profile,
    name: 'Dhruv',
    onboarded: true,
  },
};

describe('Kizashi UI components & accessibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders HomePage greeting, anime quote, 5-min budget timer, and accessible habit toggles', () => {
    const onToggleHabit = vi.fn();
    const onQuickTriage = vi.fn();
    render(
      <HomePage
        state={onboardedState}
        onToggleHabit={onToggleHabit}
        onNavigate={vi.fn()}
        onQuickTriage={onQuickTriage}
        onOpenProfile={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dhruv');
    expect(screen.getByLabelText('Start 5-minute check-in timer')).toBeInTheDocument();

    const firstHabit = screen.getByRole('button', {
      name: /5-Min Morning Alignment & Priorities/i,
    });
    expect(firstHabit).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(firstHabit);
    expect(onToggleHabit).toHaveBeenCalledWith('h-1');

    const input = screen.getByLabelText(/Quick idea to check against your goals/i);
    fireEvent.change(input, { target: { value: 'Study system design' } });
    fireEvent.submit(input.closest('form')!);
    expect(onQuickTriage).toHaveBeenCalledWith('Study system design');
  });

  it('filters ideas between Viable & Procrastination Vault and exposes Dictate button', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, apiKeyConfigured: true }),
    } as Response);

    const sampleIdeas: IdeaEntry[] = [
      {
        id: 'i-1',
        text: 'Refactor TypeScript types',
        createdAt: new Date().toISOString(),
        verdict: 'aligned',
        alignmentScore: 92,
        headline: 'TypeScript Mastery',
        reasoning: 'Directly supports your software goal.',
        routineAdvice: 'Schedule 30m in morning block.',
        estimatedMinutes: 30,
        bestTimeSlot: '08:00',
        actionSteps: ['Open types file'],
        shouldAddToRoutine: true,
      },
      {
        id: 'i-2',
        text: 'Browse keycap colorways for 2 hours',
        createdAt: new Date().toISOString(),
        verdict: 'procrastination',
        alignmentScore: 10,
        headline: 'Hardware Rabbit Hole',
        reasoning: 'Distraction from primary focus.',
        routineAdvice: 'Do not add to daily routine.',
        estimatedMinutes: 120,
        bestTimeSlot: 'None',
        actionSteps: ['Return to deep work'],
        shouldAddToRoutine: false,
      },
    ];

    render(
      <IdeasPage
        state={{ ...onboardedState, ideas: sampleIdeas }}
        onAddIdea={vi.fn()}
        onScheduleIdea={vi.fn()}
        onAdoptHabitFromIdea={vi.fn()}
        onDeleteIdea={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Dictate Idea/i })).toBeInTheDocument();
    expect(screen.getByText('TypeScript Mastery')).toBeInTheDocument();
    expect(screen.getByText('Hardware Rabbit Hole')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Procrastination Vault/i }));
    expect(screen.queryByText('TypeScript Mastery')).not.toBeInTheDocument();
    expect(screen.getByText('Hardware Rabbit Hole')).toBeInTheDocument();
  });

  it('switches TrackPage between Daily, Weekly, and Monthly views with proper ARIA roles', () => {
    render(
      <TrackPage
        state={onboardedState}
        workspaceConnected={false}
        onToggleHabit={vi.fn()}
        onAddHabit={vi.fn()}
        onDeleteHabit={vi.fn()}
        onAddScheduleBlock={vi.fn()}
        onToggleScheduleBlock={vi.fn()}
        onDeleteScheduleBlock={vi.fn()}
        onUpdateSleep={vi.fn()}
        onAddSteps={vi.fn()}
        onRequestCalendarSync={vi.fn()}
      />
    );

    expect(screen.getByText('7-Day Habit Matrix')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'daily' }));
    expect(screen.getByText('Today’s Habit Tracker')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'monthly' }));
    expect(screen.getByText('30-Day Monthly Habit Grid')).toBeInTheDocument();
  });

  it('handles ConfirmDialog keyboard Escape and Confirm/Cancel callbacks', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Sync Event?"
        description="Add to Google Calendar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders WidgetView with habit toggle and theme toggle', () => {
    const onToggleTheme = vi.fn();
    const onToggleHabit = vi.fn();
    render(
      <WidgetView
        state={onboardedState}
        onToggleHabit={onToggleHabit}
        onToggleTheme={onToggleTheme}
        onExitWidget={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expect(onToggleTheme).toHaveBeenCalledWith('dark');
  });
});
