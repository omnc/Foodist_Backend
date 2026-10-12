import { verify } from 'hono/jwt'
import { Context, Next } from 'hono'
import type { AuthUser } from '../lib/authz'

type Bindings = {
  FOODIST: D1Database
  JWT_SECRET: string
}

type Variables = {
  user: AuthUser
}

export const authMiddleware = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined

    if (!token) {
        return c.json({ error: 'No token provided' }, 401)
    }

    try {
        const decoded = await verify(token, c.env.JWT_SECRET) as AuthUser
        if (!decoded || decoded.id === undefined || decoded.id === null) {
            return c.json({ error: 'Invalid token' }, 401)
        }
        c.set('user', decoded)
        await next()
    } catch {
        return c.json({ error: 'Invalid token' }, 401)
    }
}