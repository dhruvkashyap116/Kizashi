export function playJapaneseChime(tone: 'koto' | 'furin' | 'temple' = 'koto') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes =
      tone === 'koto'
        ? [523.25, 587.33, 659.25, 783.99, 1046.5]
        : tone === 'furin'
          ? [1174.66, 1318.51, 1567.98]
          : [220, 329.63, 440];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone === 'temple' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.22);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.16, now + idx * 0.22 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.22 + (tone === 'temple' ? 1.8 : 0.9));

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.22);
      osc.stop(now + idx * 0.22 + 2.0);
    });
  } catch {
    // Audio playback blocked prior to user interaction
  }
}

export function pcmFloat32ToBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeBase64Pcm24k(base64: string, ctx: AudioContext): AudioBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 0x8000;
  }
  const buffer = ctx.createBuffer(1, float32.length, 24000);
  buffer.getChannelData(0).set(float32);
  return buffer;
}
