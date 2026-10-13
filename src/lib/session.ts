/**
 * Cookie session + CSRF helpers for cross-origin Pages ↔ Workers.
 *
 * Plan (dual-mode during migration):
 * 1. Login still returns a Bearer JWT for backward compatibility.
 * 2. Login also sets HttpOnly `foodist_session` + readable `foodist_csrf`.
 * 3. Mutating requests authenticated via cookie MUST send matching
 *    `X-CSRF-Token` (double-submit cookie pattern).
 * 4. Bearer Authorization skips CSRF (token not auto-sent by browsers).
 * 5. Frontend should prefer cookies + credentials:'include' once deployed
 *    with matching Secure/SameSite settings; Bearer remains for tools/tests.
 */

export const SESSION_COOKIE = 'foodist_session';
export const CSRF_COOKIE = 'foodist_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

export function createCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Cookie attributes for cross-site SPA (Pages) → API (Workers). */
export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'None' as const,
    path: '/',
    maxAge,
  };
}

export function csrfCookieOptions(maxAge = SESSION_MAX_AGE_SEC) {
  return {
    httpOnly: false, // readable by SPA JS for double-submit header
    secure: true,
    sameSite: 'None' as const,
    path: '/',
    maxAge,
  };
}

export function clearCookieOptions() {
  return {
    path: '/',
    secure: true,
    sameSite: 'None' as const,
    maxAge: 0,
  };
}
