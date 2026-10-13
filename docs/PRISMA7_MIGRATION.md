# Prisma 7 migration spike (deferred)

## Decision (this audit)

Remain on **Prisma 6.19.0** + `@prisma/adapter-d1@6.19.0`. Do **not** upgrade to Prisma 7 in this increment.

## Why deferred

1. Prisma 7 changes generator defaults (`runtime = "cloudflare"`, client output path).
2. D1 still lacks real transactions; Prisma 7 queryCompiler savepoint behavior has known rough edges with D1.
3. Security and product work are higher priority than a major ORM bump.

## Suggested future spike (owner-approved)

1. Branch from main with local-only `wrangler.local.jsonc`.
2. Upgrade `prisma` / `@prisma/client` / `@prisma/adapter-d1` together to the same 7.x.
3. Update `schema.prisma` generator; regenerate client; fix imports.
4. Run `npm run test:local-d1` + unit tests; no production deploy until green.
5. Document any upsert/transaction patterns that must be rewritten.

## Owner decision needed

Approve a dedicated Prisma 7 spike PR only after P0 deploy and local D1 suite stay green.
