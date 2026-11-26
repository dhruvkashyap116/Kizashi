import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  Modality,
  type LiveServerMessage,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function getAI(apiVersion?: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment.');
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return {
      status: 500,
      message: 'GEMINI_API_KEY is missing. Set it in Settings > Secrets (AI Studio) or in your local .env file.',
    };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message: 'API access denied. Please verify your GEMINI_API_KEY in Settings > Secrets or .env.',
    };
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('API key not valid') || raw.includes('400')) {
    return {
      status: 400,
      message: `Invalid request or API key: ${raw}`,
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'Rate limit reached. Please wait a moment and try again.',
    };
  }
  return { status: 500, message: raw || 'Unexpected server error.' };
}

function safeJsonParse<T = Record<string, unknown>>(text: string | undefined): T {
  const raw = (text ?? '').trim();
  const match = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/(\{[\s\S]*\})/);
  return JSON.parse(match ? match[1] : raw) as T;
}

function isRetryableModelError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return (
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('429') ||
    raw.includes('NOT_FOUND') ||
    raw.includes('404') ||
    raw.includes('503')
  );
}

async function generateContentResilient(
  ai: GoogleGenAI,
  primaryParams: Parameters<GoogleGenAI['models']['generateContent']>[0],
  fallbackParams?: Parameters<GoogleGenAI['models']['generateContent']>[0]
) {
  try {
    return await ai.models.generateContent(primaryParams);
  } catch (err) {
    if (isRetryableModelError(err) && fallbackParams) {
      await new Promise((r) => setTimeout(r, 350));
      return await ai.models.generateContent(fallbackParams);
    }
    throw err;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // 1. Fast onboarding bootstrap (low-latency gemini-3.1-flash-lite)
  app.post('/api/gemini/bootstrap-plan', async (req, res) => {
    try {
      const { profile } = req.body;
      const ai = getAI();
      const contents = `Create a calm, realistic 5-minute-a-day starter routine for this user so they don't feel overwhelmed:
Name: ${profile.name}
Primary Life Goal: ${profile.primaryGoal}
Interests & Likes: ${profile.interests}
Current Good Habits: ${profile.currentHabits}
Things They Avoid / Don't Do: ${profile.thingsAvoided}
What Stops Them From Being Productive: ${profile.mainDistractions}
Wake Time: ${profile.wakeTime}, Sleep Time: ${profile.sleepTime}`;

      const config = {
        systemInstruction:
          'You are Kizashi, a practical Japanese-inspired productivity architect. Design 4 concise daily habits and 5 clean schedule blocks tailored strictly to the user profile. Avoid fluff.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['focusMotto', 'starterHabits', 'scheduleBlocks'],
          properties: {
            focusMotto: { type: Type.STRING },
            starterHabits: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['title', 'timeOfDay', 'durationMin', 'category'],
                properties: {
                  title: { type: Type.STRING },
                  timeOfDay: { type: Type.STRING },
                  durationMin: { type: Type.INTEGER },
                  category: { type: Type.STRING },
                },
              },
            },
            scheduleBlocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['time', 'title', 'durationMin', 'type'],
                properties: {
                  time: { type: Type.STRING },
                  title: { type: Type.STRING },
                  durationMin: { type: Type.INTEGER },
                  type: { type: Type.STRING },
                },
              },
            },
          },
        },
      };

      const response = await generateContentResilient(
        ai,
        { model: 'gemini-3.1-flash-lite', contents, config },
        { model: 'gemini-4-hydrogen', contents, config }
      );
      res.json(safeJsonParse(response.text));
    } catch (err) {
      console.error('bootstrap-plan error:', err);
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 2. Low-latency Idea Validator: Procrastination Trigger vs. Viable Goal-Aligned Concept
  app.post('/api/gemini/triage-idea', async (req, res) => {
    try {
      const { ideaText, profile, goals, habits, schedule } = req.body;
      if (!ideaText || !String(ideaText).trim()) {
        res.status(400).json({ error: 'Please enter or dictate an idea to validate.' });
        return;
      }
      const ai = getAI();
      const goalSummary = Array.isArray(goals) && goals.length > 0
        ? goals.map((g: { title: string; targetTimeframe?: string }) => `- ${g.title} (${g.targetTimeframe || 'ongoing'})`).join('\n')
        : `- ${profile?.primaryGoal || 'General personal growth'}`;
      const habitSummary = Array.isArray(habits) && habits.length > 0
        ? habits.map((h: { title: string; timeOfDay?: string; durationMin: number }) => `- ${h.title} (${h.timeOfDay || 'Daily'}, ${h.durationMin}m)`).join('\n')
        : 'None set yet';
      const scheduleSummary = Array.isArray(schedule) && schedule.length > 0
        ? schedule.map((s: { time: string; title: string; durationMin: number }) => `- ${s.time}: ${s.title} (${s.durationMin}m)`).join('\n')
        : 'Open daily schedule';

      const contents = `Validate this incoming idea strictly against the user's defined life goals and current daily routine:
INCOMING IDEA: "${ideaText}"

USER PROFILE:
- Name: ${profile?.name || 'User'}
- Primary Life Goal: ${profile?.primaryGoal || ''}
- Interests: ${profile?.interests || ''}
- Known Procrastination Triggers / Distractions: ${profile?.mainDistractions || ''}

ACTIVE GOALS:
${goalSummary}

DAILY HABITS:
${habitSummary}

CURRENT DAILY SCHEDULE:
${scheduleSummary}`;

      const config = {
        systemInstruction:
          'You are Kizashi Idea Validator, a candid, supportive Japanese focus mentor. Analyze whether the incoming idea is a "procrastination" trigger (a shiny-object urge that steals time from real goals), an "aligned" viable concept to pursue, or a "defer" item (viable later, wrong timing). If it does NOT resonate with their life goals, tell them clearly NOT to pursue it as a constant hobby or add it to their daily routine. If it IS viable and aligned, estimate realistic minutes needed, suggest how to integrate it productively into their existing daily schedule, give 3 crisp zero-procrastination execution steps, and set shouldAddToRoutine accordingly.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: [
            'verdict',
            'alignmentScore',
            'headline',
            'reasoning',
            'routineAdvice',
            'estimatedMinutes',
            'bestTimeSlot',
            'actionSteps',
            'shouldAddToRoutine',
          ],
          properties: {
            verdict: {
              type: Type.STRING,
              enum: ['aligned', 'procrastination', 'defer'],
              description: 'Must be one of: aligned, procrastination, defer',
            },
            alignmentScore: {
              type: Type.INTEGER,
              description: '0 to 100 alignment with stated life goals',
            },
            headline: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            routineAdvice: {
              type: Type.STRING,
              description: 'Concrete integration plan for their schedule, or firm boundary if procrastination',
            },
            estimatedMinutes: { type: Type.INTEGER },
            bestTimeSlot: { type: Type.STRING },
            actionSteps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            shouldAddToRoutine: { type: Type.BOOLEAN },
          },
        },
      };

      const response = await generateContentResilient(
        ai,
        { model: 'gemini-3.1-flash-lite', contents, config },
        { model: 'gemini-4-hydrogen', contents, config }
      );
      res.json(safeJsonParse(response.text));
    } catch (err) {
      console.error('triage-idea error:', err);
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 3. High-Thinking Goal Roadmap Architect with Google Search Grounding
  app.post('/api/gemini/generate-roadmap', async (req, res) => {
    try {
      const { goalTitle, timeframe, weeklyHoursAvailable, profile } = req.body;
      const ai = getAI();

      const prompt = `Design a structured, practical roadmap for this life goal:
GOAL: "${goalTitle}"
TARGET TIMEFRAME: ${timeframe || '3 months'}
USER AVAILABLE WEEKLY HOURS: ${weeklyHoursAvailable || 7} hours/week
USER CONTEXT:
- Current Habits: ${profile?.currentHabits || 'Not specified'}
- Things That Stop Them: ${profile?.mainDistractions || 'Not specified'}
- Wake/Sleep: ${profile?.wakeTime || '07:00'} to ${profile?.sleepTime || '23:00'}

Use up-to-date real-world milestones and credible practices via Search if helpful.
Return ONLY valid JSON matching this structure (no markdown code fences if possible, or clean JSON):
{
  "roadmapTitle": "string",
  "summary": "string",
  "recommendedWeeklyHours": number,
  "paceSuitabilityQuestion": "A direct, friendly question asking the user if this roadmap pace suits them and whether they can commit the recommended hours per week",
  "phases": [
    {
      "phaseName": "string",
      "timeframe": "string",
      "milestones": ["string"],
      "keyAction": "string"
    }
  ],
  "suggestedDailyHabits": [
    {
      "title": "string",
      "timeOfDay": "Morning | Midday | Evening",
      "durationMin": number,
      "reason": "string"
    }
  ]
}`;

      const systemInstruction =
        'You are a master Japanese strategist and productivity architect. Build realistic, anti-burnout roadmaps. Always output valid JSON.';

      const response = await generateContentResilient(
        ai,
        {
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
            tools: [{ googleSearch: {} }],
          },
        },
        {
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        }
      );

      const parsed = safeJsonParse<Record<string, unknown>>(response.text);

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const groundingSources = chunks
        .map((c) => c.web)
        .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
        .slice(0, 5)
        .map((w) => ({ uri: w.uri, title: w.title || w.uri }));

      res.json({ ...parsed, groundingSources });
    } catch (err) {
      console.error('generate-roadmap error:', err);
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 4. Audio Transcription for Dictate Mode (tries gemini-3.5-transcribe on v1beta, falls back to multimodal Gemini Flash Lite / Hydrogen)
  app.post('/api/gemini/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body;
      if (!audioBase64) {
        res.status(400).json({ error: 'Missing audio data.' });
        return;
      }
      const cleanMime = String(mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
      const parts = [
        {
          inlineData: {
            mimeType: cleanMime,
            data: audioBase64,
          },
        },
        {
          text: 'Transcribe the spoken words in this audio accurately. Output ONLY the transcribed text, or an empty string if there is no speech.',
        },
      ];

      const aiV1Beta = getAI('v1beta');
      const aiDefault = getAI();

      let response;
      try {
        response = await aiV1Beta.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: { parts },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('PERMISSION_DENIED')) {
          throw err;
        }
        response = await generateContentResilient(
          aiDefault,
          { model: 'gemini-3.1-flash-lite', contents: { parts } },
          { model: 'gemini-4-hydrogen', contents: { parts } }
        );
      }

      res.json({ transcript: (response.text ?? '').trim() });
    } catch (err) {
      console.error('transcribe error:', err);
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 5. Camera Grooming & Goal-Aligned Daily Look Advisor (gemini-4-hydrogen multimodal)
  app.post('/api/gemini/analyze-grooming', async (req, res) => {
    try {
      const { imageBase64, mimeType, primaryGoal, occasion } = req.body;
      if (!imageBase64) {
        res.status(400).json({ error: 'Missing image data.' });
        return;
      }
      const ai = getAI();
      const contents = {
        parts: [
          {
            inlineData: {
              mimeType: (mimeType || 'image/jpeg').split(';')[0].trim(),
              data: imageBase64,
            },
          },
          {
            text: `Analyze this daily look / grooming check-in for someone whose life goal is: "${primaryGoal || 'Career & personal excellence'}". Today's focus context: "${occasion || 'Daily productive routine'}". Provide respectful, constructive, practical grooming, posture, and attire alignment suggestions.`,
          },
        ],
      };
      const config = {
        systemInstruction:
          'You are a refined Japanese personal presentation & grooming advisor (Midasinami). Be kind, objective, practical, and specific to how presentation builds confidence toward their life goal. Never judge harshly.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['overallImpression', 'goalAlignmentTip', 'quickWins', 'dailyChecklist'],
          properties: {
            overallImpression: { type: Type.STRING },
            goalAlignmentTip: { type: Type.STRING },
            quickWins: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            dailyChecklist: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
      };
      const response = await generateContentResilient(
        ai,
        { model: 'gemini-4-hydrogen', contents, config },
        { model: 'gemini-3.1-flash-lite', contents, config }
      );
      res.json(safeJsonParse(response.text));
    } catch (err) {
      console.error('analyze-grooming error:', err);
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 6. Multi-turn AI Sensei Coach Chat (gemini-4-hydrogen + Google Search grounding)
  app.post('/api/gemini/chat', async (req, res) => {
    try {
      const { messages, profile, goals, todaySummary } = req.body;
      const ai = getAI();

      const systemInstruction = `You are Kizashi Sensei, a calm, focused Japanese productivity mentor.
Keep answers concise, scannable, and practical so the user spends max 5 minutes in the app and the rest of the day executing.
User: ${profile?.name || 'Friend'}
Primary Life Goal: ${profile?.primaryGoal || 'Not set'}
Distractions to guard against: ${profile?.mainDistractions || 'Not set'}
Active Goals: ${(goals || []).map((g: { title: string }) => g.title).join(', ') || 'None'}
Today's Progress: ${todaySummary || 'Just getting started'}`;

      const contents = (messages || []).map((m: { role: string; text: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));

      const response = await generateContentResilient(
        ai,
        {
          model: 'gemini-4-hydrogen',
          contents,
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
          },
        },
        {
          model: 'gemini-3.1-flash-lite',
          contents,
          config: {
            systemInstruction,
          },
        }
      );

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources = chunks
        .map((c) => c.web)
        .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
        .slice(0, 4)
        .map((w) => ({ uri: w.uri, title: w.title || w.uri }));

      res.json({ reply: (response.text ?? '').trim(), sources });
    } catch (err) {
      console.error('chat error:', err);
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 7. Fresh Anime Motivating Quote (low-latency gemini-3.1-flash-lite)
  app.post('/api/gemini/daily-quote', async (req, res) => {
    try {
      const { goal } = req.body;
      const ai = getAI();
      const quotePrompt = `Share one authentic, uplifting quote from a well-known anime character relevant to discipline, focus, or working toward: "${goal || 'personal mastery'}".`;
      const quoteConfig = {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            quote: { type: Type.STRING },
            character: { type: Type.STRING },
            anime: { type: Type.STRING },
            reflection: { type: Type.STRING },
          },
        },
      };
      const response = await generateContentResilient(
        ai,
        { model: 'gemini-3.1-flash-lite', contents: quotePrompt, config: quoteConfig },
        { model: 'gemini-4-hydrogen', contents: quotePrompt, config: quoteConfig }
      );
      res.json(safeJsonParse(response.text));
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Vite or Static Dist
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const server = http.createServer(app);

  // Live API WebSocket Bridge for Real-Time Voice Coach (gemini-3.8-live)
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (url.startsWith('/live')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    let session: Awaited<ReturnType<ReturnType<typeof getAI>['live']['connect']>> | null = null;
    try {
      const ai = getAI();
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction:
            'You are Kizashi Sensei, a calm, concise Japanese productivity coach. Help the user clarify an idea, defeat procrastination, or plan their next 30 minutes in warm, practical spoken replies.',
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ ready: true }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ inputTranscript: content.inputTranscription.text })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ outputTranscript: content.outputTranscription.text })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onerror: (e: unknown) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              const msg = e instanceof Error ? e.message : 'Live session error';
              clientWs.send(JSON.stringify({ error: msg }));
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ closed: true }));
            }
          },
        },
      });
    } catch (err) {
      const { message } = formatApiError(err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: message }));
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!session) return;
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.audio) {
          session.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.text) {
          session.sendRealtimeInput({ text: msg.text });
        }
      } catch {
        // Ignore malformed client message
      }
    });

    clientWs.on('close', () => {
      try {
        session?.close();
      } catch {
        // Already closed
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Kizashi server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
