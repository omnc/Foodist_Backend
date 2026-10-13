# HttpOnly cookie session migration (CSRF-aware)

Status: **implemented in dual-mode** (cookie + Bearer). Frontend may adopt cookies gradually.

## Why

Bearer JWTs in `localStorage` are vulnerable to XSS exfiltration. HttpOnly cookies are not readable by page scripts.

## Cross-origin constraint

- Frontend: `https://foodist-frontend.pages.dev`
- API: `*.workers.dev`

Cookies therefore use `SameSite=None; Secure` and CORS `credentials: true` with an explicit origin allowlist (never `*`).

## CSRF

Browser auto-sends cookies, so mutating cookie-authenticated requests require:

- Cookie: `foodist_csrf=<token>` (not HttpOnly)
- Header: `X-CSRF-Token: <same token>`

Bearer `Authorization` requests skip CSRF (token is not auto-attached by the browser).

## Client adoption checklist

1. `fetch(url, { credentials: 'include' })` for all API calls.
2. After login, store `csrfToken` from JSON (or read `foodist_csrf` cookie) and send `X-CSRF-Token` on POST/PUT/PATCH/DELETE.
3. Prefer dropping `localStorage` token once cookie path is verified in staging.
4. Call `POST /auth/logout` to clear cookies; also clear any remaining local token.
5. Confirm Pages ↔ Workers are both HTTPS in production.

## Local testing

Use `wrangler.local.jsonc` (**no `remote: true`**):

```bash
npx wrangler dev -c wrangler.local.jsonc
npx wrangler d1 migrations apply FOODIST_LOCAL --local -c wrangler.local.jsonc
```

## Out of scope / owner decisions

- Forced logout of existing Bearer sessions after deploy
- Disabling Bearer responses entirely
- Production deploy
