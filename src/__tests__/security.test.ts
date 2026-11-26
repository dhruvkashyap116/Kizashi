import { describe, expect, it } from 'vitest';
import http from 'http';
import { sanitizeExternalUrl, clampNumber, sanitizeText } from '../utils/validation';
import {
  validateAudioTranscribeInput,
  validateBootstrapInput,
  validateChatInput,
  validateGroomingImageInput,
  validateRoadmapInput,
  validateTriageInput,
} from '../../server/security';
import { createApiApp } from '../../server';

function requestApp(
  app: ReturnType<typeof createApiApp>,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; headers: http.IncomingHttpHeaders; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to bind ephemeral port'));
        return;
      }
      const payload = body !== undefined ? JSON.stringify(body) : undefined;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path,
          method,
          headers: payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : undefined,
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            server.close();
            try {
              resolve({
                status: res.statusCode || 500,
                headers: res.headers,
                json: raw ? JSON.parse(raw) : {},
              });
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

describe('Security validation, URL sanitization & API hardening', () => {
  it('blocks unsafe URL schemes like javascript: and data:', () => {
    expect(sanitizeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeExternalUrl('vbscript:msgbox(1)')).toBeNull();
    expect(sanitizeExternalUrl('https://developer.mozilla.org/en-US/')).toBe(
      'https://developer.mozilla.org/en-US/'
    );
    expect(sanitizeExternalUrl('http://localhost:3000/?widget=true')).toBe(
      'http://localhost:3000/?widget=true'
    );
  });

  it('clamps numeric bounds and strips null bytes from strings', () => {
    expect(clampNumber('999', 1, 60, 7)).toBe(60);
    expect(clampNumber('NaN', 1, 60, 7)).toBe(7);
    expect(sanitizeText('hello\0world', 20)).toBe('helloworld');
  });

  it('validates and constrains audio, image, triage, roadmap, bootstrap, and chat payloads', () => {
    expect(validateAudioTranscribeInput({ audioBase64: '' }).ok).toBe(false);
    expect(validateAudioTranscribeInput({ audioBase64: 'SGVsbG8=', mimeType: 'audio/webm;codecs=opus' })).toEqual({
      ok: true,
      data: { audioBase64: 'SGVsbG8=', mimeType: 'audio/webm' },
    });

    expect(validateGroomingImageInput({ imageBase64: 'SGVsbG8=', mimeType: 'image/svg+xml' }).ok).toBe(false);
    expect(validateGroomingImageInput({ imageBase64: 'SGVsbG8=', mimeType: 'image/jpeg' }).ok).toBe(true);

    expect(validateTriageInput({ ideaText: '   ' }).ok).toBe(false);
    expect(validateTriageInput({ ideaText: 'Read TypeScript docs', estimatedContext: '20m' }).ok).toBe(true);

    expect(validateRoadmapInput({ goalTitle: '' }).ok).toBe(false);
    expect(validateRoadmapInput({ goalTitle: 'Ship SaaS', weeklyHoursAvailable: 10 }).ok).toBe(true);

    expect(validateBootstrapInput({ profile: { primaryGoal: '' } }).ok).toBe(false);
    expect(validateBootstrapInput({ profile: { name: 'Aoi', primaryGoal: 'Focus daily' } }).ok).toBe(true);

    expect(validateChatInput({ messages: [] }).ok).toBe(false);
    expect(validateChatInput({ messages: [{ role: 'user', text: 'Plan my afternoon' }] }).ok).toBe(true);
  });

  it('enforces HTTP security headers and rejects malformed API requests with 400', async () => {
    const app = createApiApp();

    const health = await requestApp(app, 'GET', '/api/health');
    expect(health.status).toBe(200);
    expect(health.json.ok).toBe(true);
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(health.headers['x-powered-by']).toBeUndefined();

    const badTriage = await requestApp(app, 'POST', '/api/gemini/triage-idea', { ideaText: '' });
    expect(badTriage.status).toBe(400);

    const badImage = await requestApp(app, 'POST', '/api/gemini/analyze-grooming', {
      imageBase64: 'SGVsbG8=',
      mimeType: 'image/svg+xml',
    });
    expect(badImage.status).toBe(400);
  });
});
