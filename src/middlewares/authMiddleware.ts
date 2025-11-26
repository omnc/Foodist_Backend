import { verify } from 'hono/jwt'
import { Context, Next } from 'hono'

type Bindings = {
  FOODIST: D1Database
  JWT_SECRET: string
}

type Variables ={
    user: any
}

export const authMiddleware = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.split(' ')[1]
    
    if (!token) {
        return c.json({ message: 'No token provided' }, 401)
    }
    
    try {
        const decoded = await verify(token, c.env.JWT_SECRET)
        c.set('user', decoded)
        await next()
    } catch (err) {
        return c.json({ message: 'Invalid token' }, 401)
    }
}