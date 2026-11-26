# Security Summary

**Reviewed Files**: 17
**Issues Resolved**: 5

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Unsanitized HTML Export | `src/utils/storage.ts` | 261 | Schedule block titles inside the exported portable HTML companion were concatenated into `div.innerHTML`. | High | Fixed | Replaced `innerHTML` with explicit `document.createElement` and `textContent` node population. |
| Unvalidated External Links | `src/pages/GoalsPage.tsx`, `src/pages/CoachPage.tsx` | 380, 322 | Grounding source URIs from AI responses were bound directly to `<a href>` without protocol filtering. | Medium | Fixed | Added `sanitizeExternalUrl` in `src/utils/validation.ts` and filtered all external URLs on both server and client to `http:` and `https:` schemes only. |
| Missing Server Input Validation & Size Caps | `server.ts`, `server/security.ts` | 120–450 | AI route handlers passed unvalidated request fields and unverified MIME types directly to Gemini requests. | Medium | Fixed | Added strict schema validators (`validateTriageInput`, `validateRoadmapInput`, `validateAudioTranscribeInput`, `validateGroomingImageInput`, `validateChatInput`, `validateBootstrapInput`) with length bounds and MIME allowlists. |
| Missing HTTP Security Headers & Rate Limiting | `server.ts`, `server/security.ts` | 105–120 | Express server lacked defensive response headers and per-IP rate limiting on `/api/gemini/*`. | Medium | Fixed | Disabled `x-powered-by`, added `securityHeadersMiddleware` (`nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS on HTTPS, popup-safe COOP), and added sliding-window rate limiting + WebSocket payload cap (`256 KB`). |
| Internal Error Message Reflection | `server.ts` | 40–68 | `formatApiError` returned raw SDK error text on 400/500 failures. | Low | Fixed | Sanitized error responses returned to callers while keeping full diagnostic logs server-side. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Secrets | `server.ts`, `.env.example` | `GEMINI_API_KEY` is read strictly from server-side `process.env` and never bundled or exposed to the browser. |
| Google Workspace OAuth | `src/utils/firebaseWorkspace.ts` | OAuth access tokens remain strictly in JS memory (never `localStorage` or `sessionStorage`) and every write requires explicit user confirmation via `ConfirmDialog`. |
| Dependency Audit | `bun.lock`, `package.json` | Verified via `bun audit`; no project-level hardcoded secrets exist, and transitive advisories (`firebase` `@grpc/grpc-js`, `vite-plugin-pwa` `workbox-build`) are tracked at the latest available upstream major versions (`13.4.0`, `2.0.0`) with zero direct Firestore gRPC runtime usage in client code. |

## PoC Verification

### Unsanitized Schedule Title in Portable HTML Export
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsanitized HTML Rendering |
| Impact | High |
| Affected File | `src/utils/storage.ts:258-270` |
| Test Scenario | Export portable HTML containing a schedule title set to `<img src=x onerror=alert(1)>Deep Work`. |

#### How It Was Fixed
Replaced `div.innerHTML = '<strong>' + s.time + ' — ' + s.title + '</strong>...'` with `document.createElement('strong')` and `strong.textContent = ...` so HTML markup in user-supplied schedule titles is rendered purely as inert text.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `buildPortableHtmlApp(state)` serializes `state.schedule` with `<` escaped as `\u003c` at `src/utils/storage.ts:196`. | Escaped JSON embedded |
| 2 | Client script iterates `DATA.schedule` and assigns `strong.textContent` at `src/utils/storage.ts:262`. | No HTML parsing occurs |
| 3 | Automated test in `src/__tests__/storage.test.ts` asserts absence of `div.innerHTML` and presence of `textContent`. | **Handled Safely** |

#### Conclusion
**Fix Verified** - Script tags or event-handler attributes inside schedule block titles can no longer execute in exported HTML companions.

### Unsafe External Link Protocol in Grounding References
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsafe URL Scheme Handling |
| Impact | Medium |
| Affected File | `src/utils/validation.ts:5-18`, `server.ts:340`, `src/pages/GoalsPage.tsx:200` |
| Test Scenario | Grounding metadata returns `javascript:alert(1)` or `data:text/html,<script>alert(1)</script>`. |

#### How It Was Fixed
Implemented `sanitizeExternalUrl` using `new URL(rawUrl)` with an explicit allowlist restricting links to `http:` and `https:` before storing or rendering anchor tags.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | URI string enters `sanitizeExternalUrl` on both `server.ts` and `GoalsPage.tsx` / `CoachPage.tsx`. | Parsed via `URL` constructor |
| 2 | Protocol check verifies `parsed.protocol === 'http:' || parsed.protocol === 'https:'`. | `javascript:` / `data:` returns `null` |
| 3 | Null entries are filtered out before rendering `<a>` tags, verified in `src/__tests__/security.test.ts`. | **Handled Safely** |

#### Conclusion
**Fix Verified** - Only standard `http:` and `https:` URLs can render as clickable references.
