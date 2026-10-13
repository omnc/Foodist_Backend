import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { authMiddleware } from './authMiddleware'
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from '../lib/session'

const SECRET = 'test-secret-for-csrf'

async function makeApp() {
  const app = new Hono<{
    Bindings: { JWT_SECRET: string }
    Variables: { user: { id: number }; authVia: 'bearer' | 'cookie' }
  }>()
  app.post('/protected', authMiddleware, (c) => c.json({ ok: true, via: c.get('authVia') }))
  app.get('/protected', authMiddleware, (c) => c.json({ ok: true, via: c.get('authVia') }))
  return app
}

describe('authMiddleware cookie CSRF', () => {
  it('allows Bearer mutations without CSRF header', async () => {
    const app = await makeApp()
    const token = await sign({ id: 1, exp: Math.floor(Date.now() / 1000) + 60 }, SECRET)
    const res = await app.request(
      '/protected',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      },
      { JWT_SECRET: SECRET }
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, via: 'bearer' })
  })

  it('rejects cookie mutations without CSRF', async () => {
    const app = await makeApp()
    const token = await sign({ id: 1, exp: Math.floor(Date.now() / 1000) + 60 }, SECRET)
    const res = await app.request(
      '/protected',
      {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      },
      { JWT_SECRET: SECRET }
    )
    expect(res.status).toBe(403)
  })

  it('allows cookie mutations with matching CSRF header', async () => {
    const app = await makeApp()
    const token = await sign({ id: 1, exp: Math.floor(Date.now() / 1000) + 60 }, SECRET)
    const csrf = 'abc123csrf'
    const res = await app.request(
      '/protected',
      {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE}=${token}; ${CSRF_COOKIE}=${csrf}`,
          [CSRF_HEADER]: csrf,
        },
      },
      { JWT_SECRET: SECRET }
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, via: 'cookie' })
  })

  it('allows cookie GET without CSRF', async () => {
    const app = await makeApp()
    const token = await sign({ id: 1, exp: Math.floor(Date.now() / 1000) + 60 }, SECRET)
    const res = await app.request(
      '/protected',
      {
        method: 'GET',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      },
      { JWT_SECRET: SECRET }
    )
    expect(res.status).toBe(200)
  })
})
