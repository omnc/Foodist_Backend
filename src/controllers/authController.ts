import { Hono } from "hono";
import { deleteCookie, setCookie } from 'hono/cookie';
import prismaClients from "../lib/prismaClient";
import { authMiddleware } from "../middlewares/authMiddleware";
import { sign } from 'hono/jwt';
import bcrypt from 'bcryptjs';
import { publicUserSelect, toPublicUser } from "../lib/userDto";
import { getAuthUserId, requireSelf, type AuthUser } from "../lib/authz";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  clearCookieOptions,
  createCsrfToken,
  csrfCookieOptions,
  sessionCookieOptions,
} from "../lib/session";

type Bindings = {
  FOODIST: D1Database;
  JWT_SECRET: string;
}

type Variables = {
  user: AuthUser;
  authVia: 'bearer' | 'cookie';
}

const authController = new Hono<{ Bindings: Bindings; Variables: Variables }>();

authController.post('/register', async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const body = await c.req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
        return c.json({ error: 'Email and password are required' }, 400);
    }
    if (password.length < 8) {
        return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }

    const existingUser = await prisma.user.findUnique({
        where: { email },
    });
    if (existingUser) {
        return c.json({ error: 'User already exists' }, 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
        data: { email, password: hashedPassword },
        select: publicUserSelect,
    });
    return c.json(user, 201);
})

authController.post('/login', async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const body = await c.req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
        return c.json({ error: 'Email and password are required' }, 400);
    }

    const user = await prisma.user.findUnique({
        where: { email },
    });

    // Uniform message to avoid account enumeration
    if (!user) {
        return c.json({ error: 'Invalid email or password' }, 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return c.json({ error: 'Invalid email or password' }, 401);
    }

    const token = await sign(
        {
            id: user.id,
            email: user.email,
            exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC
        },
        c.env.JWT_SECRET
    );

    const csrfToken = createCsrfToken();
    setCookie(c, SESSION_COOKIE, token, sessionCookieOptions());
    setCookie(c, CSRF_COOKIE, csrfToken, csrfCookieOptions());

    return c.json({
        message: 'Login successful',
        // Bearer kept for backward compatibility / non-browser clients
        token,
        csrfToken,
        authMode: 'cookie+bearer',
        user: toPublicUser(user as unknown as Record<string, unknown>),
    });
})

/** Clear HttpOnly session + CSRF cookies (Bearer clients should discard localStorage token). */
authController.post('/logout', async (c) => {
    deleteCookie(c, SESSION_COOKIE, clearCookieOptions());
    deleteCookie(c, CSRF_COOKIE, clearCookieOptions());
    return c.json({ message: 'Logged out' });
})

//get current authenticated user - check if signed in
authController.get('/me', authMiddleware, async (c) => {
    const authenticatedUser = c.get('user');
    const userId = getAuthUserId(authenticatedUser);

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: publicUserSelect,
    });

    if (!user) {
        return c.json({ error: 'User not found' }, 404);
    }

    return c.json(user);
})

/**
 * In-session password change.
 * Requires authenticated session + current password.
 * Identity is taken from JWT — email in the body is ignored for authorization.
 * Unauthenticated email-only password changes are not supported (no reset-token flow yet).
 */
authController.post('/change-password', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const authUser = c.get('user');
    const userId = getAuthUserId(authUser);

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword || !newPassword) {
        return c.json({ error: 'currentPassword and newPassword are required' }, 400);
    }
    if (newPassword.length < 8) {
        return c.json({ error: 'New password must be at least 8 characters' }, 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return c.json({ error: 'User not found' }, 404);
    }

    const currentOk = await bcrypt.compare(currentPassword, user.password);
    if (!currentOk) {
        return c.json({ error: 'Current password is incorrect' }, 401);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
    });

    return c.json({ message: 'Password updated successfully' });
})

// Public-ish profile by ID (authenticated): never returns password hash
authController.get('/:id', authMiddleware, async (c) => {
    const authenticatedUser = c.get('user');
    if (!getAuthUserId(authenticatedUser)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = parseInt(c.req.param('id'), 10);
    if (!Number.isInteger(id) || id <= 0) {
        return c.json({ error: 'Invalid user id' }, 400);
    }

    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const user = await prisma.user.findUnique({
        where: { id },
        select: publicUserSelect,
    });

    if (!user) {
        return c.json({ error: 'User not found' }, 404);
    }

    return c.json(user);
})

// Self-service profile update only (identity from JWT, not trusted path id alone)
authController.put('/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const authUser = c.get('user');
    const gate = requireSelf(authUser, c.req.param('id'));
    if (!gate.ok) {
        return c.json({ error: gate.error }, gate.status);
    }

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return c.json({ error: 'Invalid request body' }, 400);
    }

    // Password changes must use POST /auth/change-password (requires current password)
    if ('password' in body || 'newPassword' in body) {
        return c.json({
            error: 'Use POST /auth/change-password to update password',
        }, 400);
    }

    const data: { email?: string; username?: string | null; bio?: string | null; pfpUrl?: string | null } = {};
    if (typeof body.email === 'string' && body.email.trim()) {
        data.email = body.email.trim().toLowerCase();
    }
    if ('username' in body) {
        data.username = body.username === null ? null : String(body.username);
    }
    if ('bio' in body) {
        data.bio = body.bio === null ? null : String(body.bio);
    }
    if ('pfpUrl' in body) {
        data.pfpUrl = body.pfpUrl === null ? null : String(body.pfpUrl);
    }

    if (Object.keys(data).length === 0) {
        return c.json({ error: 'No updatable fields provided' }, 400);
    }

    try {
        const updatedUser = await prisma.user.update({
            where: { id: gate.userId },
            data,
            select: publicUserSelect,
        });
        return c.json(updatedUser);
    } catch {
        return c.json({ error: 'Unable to update user' }, 400);
    }
})

// Self-service delete only
authController.delete('/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const authUser = c.get('user');
    const gate = requireSelf(authUser, c.req.param('id'));
    if (!gate.ok) {
        return c.json({ error: gate.error }, gate.status);
    }

    await prisma.user.delete({
        where: { id: gate.userId },
    });
    return c.json({ message: 'User deleted' });
})

export default authController;
