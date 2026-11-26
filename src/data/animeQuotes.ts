import type { AnimeQuote } from '../types/kizashi';

export const ANIME_QUOTES: AnimeQuote[] = [
  {
    quote: 'Work hard in silence, and let every small step carve your path forward.',
    character: 'Tanjiro Kamado',
    anime: 'Demon Slayer',
    reflection: 'Consistency in tiny daily habits beats bursts of panic.',
  },
  {
    quote: 'If you win, you live. If you lose, you die. If you don’t fight, you can’t win.',
    character: 'Eren Yeager',
    anime: 'Attack on Titan',
    reflection: 'Action cures hesitation. Start the first 5 minutes now.',
  },
  {
    quote: 'A lesson without pain is meaningless. For you cannot gain something without sacrificing something else.',
    character: 'Edward Elric',
    anime: 'Fullmetal Alchemist',
    reflection: 'Protect your focus by letting go of low-value distractions.',
  },
  {
    quote: 'Hard work is worthless for those that don’t believe in themselves.',
    character: 'Naruto Uzumaki',
    anime: 'Naruto',
    reflection: 'Honor the promise you made to your morning schedule.',
  },
  {
    quote: 'Power comes in response to a need, not a desire. You have to create that need.',
    character: 'Son Goku',
    anime: 'Dragon Ball Z',
    reflection: 'Show up for your scheduled deep block even when motivation dips.',
  },
  {
    quote: 'Set your heart ablaze. Grit your teeth and look straight ahead.',
    character: 'Kyojuro Rengoku',
    anime: 'Demon Slayer',
    reflection: 'Channel energy into one meaningful goal rather than ten distractions.',
  },
  {
    quote: 'Ten billion percent — every problem becomes solvable when you break it into one step at a time.',
    character: 'Senku Ishigami',
    anime: 'Dr. Stone',
    reflection: 'Turn vague ideas into measured, timed actions.',
  },
  {
    quote: 'The only thing we are allowed to do is believe that we won’t regret the choice we made.',
    character: 'Levi Ackerman',
    anime: 'Attack on Titan',
    reflection: 'Make a clean decision: execute it today or park it out of sight.',
  },
  {
    quote: 'Sometimes I do feel like I’m a failure. Like there’s no hope for me. But even so, I’m not gonna give up. Ever!',
    character: 'Izuku Midoriya',
    anime: 'My Hero Academia',
    reflection: 'Progress is built out of ordinary days done faithfully.',
  },
  {
    quote: 'Simplicity is the easiest path to true beauty and clarity.',
    character: 'Violet Evergarden',
    anime: 'Violet Evergarden',
    reflection: 'Keep your workspace, grooming, and schedule serene and uncluttered.',
  },
  {
    quote: 'You have no enemies. Nobody in the world deserves to be hurt — least of all your future self through wasted time.',
    character: 'Thorfinn',
    anime: 'Vinland Saga',
    reflection: 'Choose calm discipline over restless scrolling.',
  },
  {
    quote: 'Knowing what it feels like to be at the bottom gives you the clarity to climb with precision.',
    character: 'Satoru Gojo',
    anime: 'Jujutsu Kaisen',
    reflection: 'Protect your deep-work window as sacred territory.',
  },
];

export function getJapaneseGreeting(name?: string): { jp: string; en: string } {
  const hour = new Date().getHours();
  const displayName = name?.trim() ? `, ${name.trim()}` : '';
  if (hour < 12) {
    return {
      jp: 'おはようございます',
      en: `Good morning${displayName}`,
    };
  }
  if (hour < 18) {
    return {
      jp: 'こんにちは',
      en: `Good afternoon${displayName}`,
    };
  }
  return {
    jp: 'こんばんは',
    en: `Good evening${displayName}`,
  };
}

export function getDailyAnimeQuote(): AnimeQuote {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  );
  return ANIME_QUOTES[dayOfYear % ANIME_QUOTES.length];
}
