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
| `npm run dev` | Wrangler (default config may use remote bindings — prefer `dev:local`) |
| `npm run dev:local` | Wrangler with `wrangler.local.jsonc` (**no production D1/R2**) |
| `npm run db:local:migrate` | Apply SQL migrations to local D1 |
| `npm test` | Vitest unit/security regression tests |
| `npm run test:local-d1` | Local D1 API smoke (register/login/recipe persist) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `prisma generate` |
| `npm run deploy` | Deploy worker (owner approval for production) |

Cookie session migration notes: [`docs/SESSION_COOKIE_MIGRATION.md`](docs/SESSION_COOKIE_MIGRATION.md).  
Prisma 7 spike (deferred): [`docs/PRISMA7_MIGRATION.md`](docs/PRISMA7_MIGRATION.md).

## Auth security (P0)

- `POST /auth/change-password` requires a valid JWT and the **current password**. Email alone cannot change a password. There is **no** unauthenticated reset-token flow yet.
- `PUT|DELETE /auth/:id` only succeed when the path id matches the JWT subject.
- User responses use an explicit public select/DTO — **password hashes are never returned**.

## Recipe create contract

`POST /recipes` (multipart):

- Required: `title`, `description`, `mealtype` (`BREAKFAST|LUNCH|DINNER|SIDEDISH|APPETIZER|DESSERT|DRINK|BREAD`)
- Optional numbers: `servingSize`, `level`, `prepTime`, `cookTime`
- Optional: `titleImage` (jpeg/png/webp/gif, max 5MB)
- Optional JSON strings: `ingredientGroups` `[{heading,items:[{name,amount,unit}]}]` (top-to-bottom order; every heading required, non-blank), or legacy flat `ingredients` `[{name,amount,unit}]`; `descriptionBlocks` `[{step,content}]`
- Optional: `stepImage_0`, `stepImage_1`, …

Responses include aliases `titleImageUrl`, `authorName`, `ingredients` (flat), `ingredientGroups` (`[{heading, items}]` in submitted order; legacy recipes have one group with `heading: null`), `averageRating` for frontend compatibility.

Ingredient headings need migration `0005_add_ingredient_groups.sql`. Workers Builds deploys code without running migrations, so until 0005 is applied in a given D1 database the API detects the missing columns (`PRAGMA table_info`) and stores ingredients without headings instead of failing.

## Images

- Uploads are stored in the `IMAGES` R2 bucket under `recipes/` or `description-blocks/`; D1 stores the object **key**.
- `GET /images/<folder>/<file>` streams the object from R2 (immutable cache headers, ETag/304). Responses expose absolute URLs built from the request origin, or from the optional `PUBLIC_IMAGE_BASE` var if images later move to an R2 custom domain.
- Legacy rows that stored `https://pub-5834839887-foodist-images.r2.dev/<key>` (a host that never resolved) are rewritten to the `/images/` route on read; no data migration needed.

## Ratings and my recipes

- Posting a comment requires a `rating` (integer 1–5); the comment `body` may be blank. One comment per user per recipe.
- `averageRating` is the mean of comment ratings (1 decimal), or `null` when no one has rated yet; `ratingCount`/`totalComments` accompany it on recipe cards (list, search, saved, mine) and detail.
- `GET /recipes/mine` (auth) returns the caller's recipes as cards, newest first.

## Deleting recipes

`DELETE /recipes/:id` (owner only) removes the recipe's comments, steps, everyone's saves, its unshared ingredient block, and its R2 images in one D1 batch.

## Incident / session notes

- Tokens are JWTs stored by the SPA in `localStorage` (XSS-sensitive). Migration to HttpOnly cookies needs a CSRF plan and owner approval.
- JWT lifetime: 7 days. No server-side revocation list yet — treat logout as client-side discard.
- CORS allowlist: Pages production + local Vite ports (no `*` with credentials).
- If an older unauthenticated `/auth/change-password` was ever deployed, owners should force password resets / invalidate sessions after deploying this fix. **Confirm deployed worker matches this repo before acting.**

## Prisma / D1 version alignment

Pinned for compatibility (Prisma 7 draft — see `docs/PRISMA7_MIGRATION.md`):

| Package | Version |
|---------|---------|
| `prisma` | `7.10.0` |
| `@prisma/client` | `7.10.0` |
| `@prisma/adapter-d1` | `7.10.0` |

Generator: `prisma-client` with `runtime = "cloudflare"` → `src/generated/prisma` (gitignored; run `npm run build`). CLI datasource URL lives in `prisma.config.ts`.

## Known limitations

- Prisma interactive transactions are not relied on with D1; nested recipe writes are sequential with best-effort create.
- R2 uploads are deleted best-effort if a later DB write fails during create/update.
- Admin/role-based user management is not implemented.
