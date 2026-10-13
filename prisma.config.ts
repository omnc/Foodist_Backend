import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 config — datasource URL lives here (not in schema.prisma).
 * Used for CLI tooling; Workers runtime uses the D1 adapter binding instead.
 *
 * Fallback file URL keeps `prisma generate` working in CI / Workers Builds
 * when DATABASE_URL is unset (generate does not connect to the DB).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },
})
