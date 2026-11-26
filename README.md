# Kizashi (兆し) — Japanese Focus, Habit & Goal Planner

A calm, cross-platform (macOS, Windows, iOS, Android) PWA and desktop companion designed so you spend **5 minutes planning** and the rest of the day executing.

## Features

- **First-Time Personal Alignment**: Captures your life goals, interests, existing habits, things you avoid, and distractions to tailor a calm daily routine.
- **Idea Validator & Dictate Mode**: Speak or type any sudden thought; Kizashi evaluates it against your goals and daily routine to flag **Procrastination Triggers** vs. **Viable Goal-Aligned Concepts**.
- **Goal Roadmap Architect**: Builds phased roadmaps grounded with live references, asks whether the weekly time commitment suits your pace, and lets you adopt suggested daily habits in one click.
- **Daily / Weekly / Monthly Tracker & Sleep Alarm**: O(1) habit lookup matrix, daily schedule blocks, bedtime/wake-up alarm with Japanese chimes, and device permissions (Notifications, Motion/Steps, Camera, Mic).
- **Midasinami Daily Grooming**: Camera or photo check-in offering respectful grooming and presentation tips aligned with your life goal.
- **Sensei Coach, Live Voice & Google Workspace**: Multi-turn chat, real-time Gemini Live voice calls, Google Calendar & Google Tasks sync, and local Keep-style notes.
- **Dual Japanese Theme**: Sakura cherry-blossom light mode and pitch-black Sumi ink dark mode.
- **Portable App & Widget**: Installable PWA with `?widget=true` compact widget view, plus 1-click export of a standalone single-file HTML companion (`kizashi-portable-app.html`) that opens directly in any browser from a downloaded GitHub zip.

## Quick Start (After Downloading Zip or Cloning)

1. Install dependencies first (this resolves all TypeScript/TSX IDE types and packages):
   ```bash
   npm install
   ```
2. Create a `.env` file in the project root (already ignored by `.gitignore` so it is never uploaded to GitHub) and add your Gemini API key:
   ```env
   GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
   ```
3. Launch the app on `http://localhost:3000`:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` in Chrome or Edge and click **Install App** to add it as a native desktop/mobile app or **Widget** for a compact focus window.

