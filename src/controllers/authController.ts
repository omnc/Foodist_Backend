import { Hono } from "hono";
import prismaClients from "../lib/prismaClient";
import { authMiddleware } from "../middlewares/authMiddleware";
import { sign } from 'hono/jwt';
import bcrypt from 'bcryptjs';

type Bindings = {
  FOODIST: D1Database;
  JWT_SECRET: string;
}

type Variables = {
  user: any;
}

const authController = new Hono<{ Bindings: Bindings; Variables: Variables }>();


authController.post('/register', async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const { email, password } = await c.req.json();
    const existingUser = await prisma.user.findUnique({
        where: { email },
    });
    if (existingUser) {
        return c.json({ error: 'User already exists' }, 400);
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
        data: { email, password: hashedPassword },
    });
    return c.json(user);
})

authController.post('/login', async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const { email, password } = await c.req.json();
    
    const user = await prisma.user.findUnique({
        where: { email },
    });
    
    if (!user) {
        return c.json({ error: 'User not found' }, 404);
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return c.json({ error: 'Invalid password' }, 401);
    }
    
    // Generate JWT token
    const token = await sign(
        { 
            id: user.id, 
            email: user.email,
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // 7 days
        },
        c.env.JWT_SECRET
    );
    
    return c.json({ 
        message: 'Login successful',
        token,
        user: {
            id: user.id,
            email: user.email
        }
    });
})

//get current authenticated user - check if signed in
authController.get('/me', authMiddleware, async (c) => {
    const authenticatedUser = c.get('user');
    
    if (!authenticatedUser) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const user = await prisma.user.findUnique({
        where: { id: authenticatedUser.id },
        select: {
            id: true,
            email: true,
            username: true,
            pfpUrl: true,
            bio: true,
            createdAt: true,
            updatedAt: true
            // Don't send password!
        }
    });
    
    if (!user) {
        return c.json({ error: 'User not found' }, 404);
    }
    
    return c.json(user);
})

//get a user by ID (authenticated)
authController.get('/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const authenticatedUser = c.get('user');
    if (!authenticatedUser) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const { id } = c.req.param();
    const user = await prisma.user.findUnique({
        where: { id: parseInt(id) },
    });
    return c.json(user);
})

//update a user(authenticated)
authController.put('/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const { id } = c.req.param();
    const { email, password } = await c.req.json();
    const hashedPassword = await bcrypt.hash(password, 10);
    const updatedUser = await prisma.user.update({
        where: { id: parseInt(id) },
        data: { email, password: hashedPassword },
    });
    return c.json(updatedUser);
})
    
//delete a user(authenticated)
authController.delete('/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const { id } = c.req.param();
    const deletedUser = await prisma.user.delete({
        where: { id: parseInt(id) },
    });
    return c.json(deletedUser);
})

//change the password- not authenticated
authController.post('/change-password', async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const { email, password } = await c.req.json();
    const user = await prisma.user.findUnique({
        where: { email },
    });
    if (!user) {
        return c.json({ error: 'User not found' }, 404);
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
    });
    return c.json(updatedUser);
})

export default authController;