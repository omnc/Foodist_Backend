# Foodist Backend

API for [Foodist](https://foodist-frontend.pages.dev/) — recipes, auth, comments, and saved recipes on **Cloudflare Workers + D1 (SQLite) + R2**.

> Stack note: the database is **Cloudflare D1 (SQLite-based)**, not PostgreSQL.

## Stack

- Hono on Cloudflare Workers
- Prisma + `@prisma/adapter-d1`
- JWT Bearer auth (`Authorization: Bearer <token>`)
- R2 for recipe images

## Local setup

```bash
npm install
cp .env.example .env   # for Prisma tooling only
npx prisma generate
# Configure wrangler D1/R2 bindings and:
#   wrangler secret put JWT_SECRET
npm run dev
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Wrangler local/dev worker |
| `npm test` | Vitest unit/security regression tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `prisma generate` |
| `npm run deploy` | Deploy worker (owner approval for production) |

## Auth security (P0)

- `POST /auth/change-password` requires a valid JWT and the **current password**. Email alone cannot change a password. There is **no** unauthenticated reset-token flow yet.
- `PUT|DELETE /auth/:id` only succeed when the path id matches the JWT subject.
- User responses use an explicit public select/DTO — **password hashes are never returned**.

## Recipe create contract

`POST /recipes` (multipart):

- Required: `title`, `description`, `mealtype` (`BREAKFAST|LUNCH|DINNER|SIDEDISH|APPETIZER|DESSERT|DRINK|BREAD`)
- Optional numbers: `servingSize`, `level`, `prepTime`, `cookTime`
- Optional: `titleImage` (jpeg/png/webp/gif, max 5MB)
- Optional JSON strings: `ingredients` `[{name,amount,unit}]`, `descriptionBlocks` `[{step,content}]`
- Optional: `stepImage_0`, `stepImage_1`, …

Responses include aliases `titleImageUrl`, `authorName`, `ingredients`, `averageRating` for frontend compatibility.

## Incident / session notes

- Tokens are JWTs stored by the SPA in `localStorage` (XSS-sensitive). Migration to HttpOnly cookies needs a CSRF plan and owner approval.
- JWT lifetime: 7 days. No server-side revocation list yet — treat logout as client-side discard.
- CORS allowlist: Pages production + local Vite ports (no `*` with credentials).
- If an older unauthenticated `/auth/change-password` was ever deployed, owners should force password resets / invalidate sessions after deploying this fix. **Confirm deployed worker matches this repo before acting.**

## Known limitations

- Prisma interactive transactions are not relied on with D1; nested recipe writes are sequential with best-effort create.
- R2 uploads are not rolled back if a later DB write fails (possible orphan objects).
- Admin/role-based user management is not implemented.
