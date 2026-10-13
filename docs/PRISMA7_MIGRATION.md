# Prisma 7 migration

## Status

Upgrade implemented on branch `cursor/prisma7-upgrade-fde9` as a **draft PR targeting `main`**. Do not merge until owner review.

## What changed

1. Pins `prisma`, `@prisma/client`, and `@prisma/adapter-d1` to **7.10.0**.
2. Generator uses `provider = "prisma-client"`, `runtime = "cloudflare"`, output `../src/generated/prisma`.
3. Datasource URL moved to `prisma.config.ts` (Prisma 7 CLI config); Workers still use `PrismaD1` adapter.
4. Runtime import: `../generated/prisma/client` (generated client; gitignored).
5. Local D1 smoke runs under `wrangler` `unstable_dev` so Cloudflare WASM loads (Node/`tsx` alone cannot).

## Verification (local)

- `npm test` — 22 unit tests
- `npx tsc --noEmit`
- `npm run test:local-d1` — register/login/CSRF deny/create recipe/fetch nested data

## Caveats

- D1 still lacks real interactive transactions; nested writes remain sequential.
- Deploy only after owner review of this PR (no auto-deploy from this work).
- `prisma.config.ts` falls back to `file:./dev.db` when `DATABASE_URL` is unset so CI/`prisma generate` works without a committed `.env`.
