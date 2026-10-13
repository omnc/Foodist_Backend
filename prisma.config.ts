import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

/**
 * Prisma 7 config — datasource URL lives here (not in schema.prisma).
 * Used for CLI tooling; Workers runtime uses the D1 adapter binding instead.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
