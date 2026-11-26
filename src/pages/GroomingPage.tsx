import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Circle, Loader2, Sparkles, Upload, VideoOff } from 'lucide-react';
import type { GroomingReport, KizashiState } from '../types/kizashi';

interface GroomingPageProps {
  state: KizashiState;
  onAddGroomingReport: (report: GroomingReport) => void;
  onToggleChecklistItem: (item: string) => void;
}

export const GroomingPage: React.FC<GroomingPageProps> = ({
  state,
  onAddGroomingReport,
  onToggleChecklistItem,
}) => {
  const [cameraOn, setCameraOn] = useState(false);
  const [occasion, setOccasion] = useState('Daily Deep Focus & Video Calls');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setError('Camera permission denied or no camera detected. You can also upload a photo below.');
    }
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setPreviewUrl(dataUrl);
    stopCamera();
    await analyzeImage(dataUrl.split(',')[1], 'image/jpeg');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result || '');
      setPreviewUrl(result);
      const base64 = result.split(',')[1];
      if (base64) {
        await analyzeImage(base64, file.type || 'image/jpeg');
      }
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async (imageBase64: string, mimeType: string) => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/gemini/analyze-grooming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          primaryGoal: state.profile.primaryGoal,
          occasion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not analyze photo.');

      const report: GroomingReport = {
        id: `groom-${Date.now()}`,
        date: new Date().toLocaleDateString(),
        occasion,
        overallImpression: data.overallImpression || '',
        goalAlignmentTip: data.goalAlignmentTip || '',
        quickWins: Array.isArray(data.quickWins) ? data.quickWins : [],
        dailyChecklist: Array.isArray(data.dailyChecklist) ? data.dailyChecklist : [],
      };
      onAddGroomingReport(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grooming check failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const latestReport = state.groomingReports[0];
  const defaultChecklist = latestReport?.dailyChecklist?.length
    ? latestReport.dailyChecklist
    : [
        'Clean face wash & moisturizer',
        'Neat hair & trimmed facial hair',
        'Crisp, distraction-free outfit matching today’s goal',
        'Upright posture & fresh water bottle at desk',
      ];

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#1C191C] dark:text-white">
          Midasinami — Daily Look & Grooming
        </h1>
        <p className="mt-1 text-sm text-[#5C5459] dark:text-[#A1A1AA]">
          Carry yourself like the person achieving your goal. Check your daily look privately via camera or photo upload.
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
          <div className="mb-4">
            <label className="block text-xs font-medium text-[#5C5459] dark:text-[#A1A1AA] mb-1.5">
              Today’s Context
            </label>
            <select
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
              className="w-full rounded-xl border border-[#EADFE2] dark:border-[#27272A] bg-[#FCF8F6] dark:bg-black px-3.5 py-2.5 text-sm text-[#1C191C] dark:text-[#F4F4F5]"
            >
              <option value="Daily Deep Focus & Video Calls">Daily Deep Focus & Video Calls</option>
              <option value="Interview / Client Presentation">Interview / Client Presentation</option>
              <option value="Fitness, Athletics & Energy">Fitness, Athletics & Energy</option>
              <option value="Creative & Study Session">Creative & Study Session</option>
            </select>
          </div>

          <div className="relative aspect-4/3 rounded-xl overflow-hidden border border-[#EADFE2] dark:border-[#24242A] bg-[#FCF8F6] dark:bg-black flex items-center justify-center">
            {cameraOn ? (
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt="Daily grooming check-in"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center p-6">
                <Camera className="w-9 h-9 mx-auto text-[#B4A8AD] dark:text-[#52525B]" />
                <p className="mt-2 text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                  Photos are analyzed once and never stored on a server.
                </p>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!cameraOn ? (
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1C191C] dark:bg-[#F4F4F5] px-4 py-2.5 text-xs font-semibold text-white dark:text-black hover:opacity-90 min-h-[42px]"
              >
                <Camera className="w-4 h-4" />
                Open Camera
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={captureAndAnalyze}
                  disabled={analyzing}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#C94A6A] dark:bg-[#E87A90] px-4 py-2.5 text-xs font-semibold text-white dark:text-black hover:opacity-90 min-h-[42px]"
                >
                  {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Capture & Get Grooming Tips
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#EADFE2] dark:border-[#27272A] px-3.5 py-2.5 text-xs font-medium min-h-[42px]"
                >
                  <VideoOff className="w-4 h-4" />
                  Close Camera
                </button>
              </>
            )}

            <label className="inline-flex items-center gap-2 rounded-xl border border-[#EADFE2] dark:border-[#27272A] px-4 py-2.5 text-xs font-medium cursor-pointer hover:bg-[#FAF2F4] dark:hover:bg-[#141418] min-h-[42px]">
              <Upload className="w-4 h-4 text-[#C94A6A] dark:text-[#E87A90]" />
              Upload Photo
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </section>

        <section className="lg:col-span-6 space-y-6">
          <div className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
            <h2 className="font-display text-lg font-semibold">Goal-Aligned Presentation Feedback</h2>
            {analyzing ? (
              <div className="py-8 text-center text-sm text-[#6B6368] dark:text-[#A1A1AA]">
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-[#C94A6A] dark:text-[#E87A90] mb-2" />
                Reviewing grooming & goal alignment...
              </div>
            ) : latestReport ? (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs text-[#6B6368] dark:text-[#A1A1AA]">
                    {latestReport.date} · {latestReport.occasion}
                  </div>
                  <p className="mt-1.5 text-sm text-[#1C191C] dark:text-[#F4F4F5] leading-relaxed">
                    {latestReport.overallImpression}
                  </p>
                </div>
                <div className="pt-3 border-t border-[#F2E9EC] dark:border-[#1E1E24]">
                  <div className="text-xs font-semibold text-[#C94A6A] dark:text-[#E87A90]">
                    How This Supports Your Goal
                  </div>
                  <p className="mt-1 text-sm text-[#5C5459] dark:text-[#D4D4D8] leading-relaxed">
                    {latestReport.goalAlignmentTip}
                  </p>
                </div>
                <div className="pt-3 border-t border-[#F2E9EC] dark:border-[#1E1E24]">
                  <div className="text-xs font-semibold text-[#1C191C] dark:text-white">
                    2-Minute Refinements
                  </div>
                  <ul className="mt-2 space-y-1.5 text-sm text-[#5C5459] dark:text-[#A1A1AA]">
                    {latestReport.quickWins.map((w, idx) => (
                      <li key={idx}>• {w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#6B6368] dark:text-[#A1A1AA]">
                Take a quick snapshot or upload a photo to get practical grooming, attire, and posture tips tailored to “{state.profile.primaryGoal}”.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[#EADFE2] dark:border-[#24242A] bg-white dark:bg-[#09090B] p-6">
            <h2 className="font-display text-lg font-semibold">Daily Midasinami Checklist</h2>
            <div className="mt-3 divide-y divide-[#F2E9EC] dark:divide-[#1C1C21]">
              {defaultChecklist.map((item) => {
                const checked = !!state.groomingChecked[item];
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onToggleChecklistItem(item)}
                    className="w-full py-3 flex items-center gap-3 text-left min-h-[44px]"
                  >
                    {checked ? (
                      <CheckCircle2 className="w-4 h-4 text-[#C94A6A] dark:text-[#E87A90] shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-[#B4A8AD] dark:text-[#52525B] shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        checked ? 'line-through text-[#8C8287] dark:text-[#71717A]' : ''
                      }`}
                    >
                      {item}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
