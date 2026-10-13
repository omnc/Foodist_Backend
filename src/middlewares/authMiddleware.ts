import { verify } from 'hono/jwt'
import { Context, Next } from 'hono'
import type { AuthUser } from '../lib/authz'
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_COOKIE,
  parseCookieHeader,
  timingSafeEqualString,
} from '../lib/session'

type Bindings = {
  FOODIST: D1Database
  JWT_SECRET: string
}

type Variables = {
  user: AuthUser
  authVia: 'bearer' | 'cookie'
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const authMiddleware = async (
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next
) => {
  const authHeader = c.req.header('Authorization')
  const bearer = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : undefined

  const cookies = parseCookieHeader(c.req.header('Cookie'))
  const cookieToken = cookies[SESSION_COOKIE]

  const token = bearer || cookieToken
  if (!token) {
    return c.json({ error: 'No token provided' }, 401)
  }

  const authVia: 'bearer' | 'cookie' = bearer ? 'bearer' : 'cookie'

  // Cookie-authenticated mutations require CSRF double-submit
  if (authVia === 'cookie' && !SAFE_METHODS.has(c.req.method.toUpperCase())) {
    const csrfCookie = cookies[CSRF_COOKIE] || ''
    const csrfHeader = c.req.header(CSRF_HEADER) || ''
    if (!csrfCookie || !csrfHeader || !timingSafeEqualString(csrfCookie, csrfHeader)) {
      return c.json({ error: 'CSRF validation failed' }, 403)
    }
  }

  try {
    const decoded = (await verify(token, c.env.JWT_SECRET)) as AuthUser
    if (!decoded || decoded.id === undefined || decoded.id === null) {
      return c.json({ error: 'Invalid token' }, 401)
    }
    c.set('user', decoded)
    c.set('authVia', authVia)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
}
