/**
 * Shared validation and URL sanitization helpers used across client and server.
 */

export function sanitizeExternalUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function sanitizeText(value: unknown, maxLength = 2000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\0/g, '').trim().slice(0, maxLength);
}
