import { Hono } from "hono";
import { authMiddleware } from "../middlewares/authMiddleware";
import prismaClients from "../lib/prismaClient";

type Bindings = {
    FOODIST: D1Database;
    JWT_SECRET: string;
}

type Variables = {
    user: any;
}

const savedRecipeController = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Get all saved recipes for current user
savedRecipeController.get('/', authMiddleware, async (c) => {
    const user = c.get('user');
    
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const savedRecipes = await prisma.savedRecipe.findMany({
        where: { userID: user.id },
        include: {
            recipe: {
                include: {
                    user: {
                        select: { id: true, email: true, username: true }
                    }
                }
            }
        },
        orderBy: { savedAt: 'desc' }
    });
    
    return c.json(savedRecipes);
})

// Save a recipe
savedRecipeController.post('/:recipeId', authMiddleware, async (c) => {
    const user = c.get('user');
    
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const recipeID = parseInt(c.req.param('recipeId'));
    const { note } = await c.req.json().catch(() => ({ note: null }));
    
    // Check if recipe exists
    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeID }
    });
    
    if (!recipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }
    
    // Check if already saved
    const existing = await prisma.savedRecipe.findFirst({
        where: {
            userID: user.id,
            recipeID
        }
    });
    
    if (existing) {
        return c.json({ error: 'Recipe already saved' }, 400);
    }
    
    // Save recipe
    const savedRecipe = await prisma.savedRecipe.create({
        data: {
            userID: user.id,
            recipeID,
            note
        },
        include: {
            recipe: true
        }
    });
    
    return c.json(savedRecipe, 201);
})

// Update note on saved recipe
savedRecipeController.put('/:recipeId', authMiddleware, async (c) => {
    const user = c.get('user');
    
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const recipeID = parseInt(c.req.param('recipeId'));
    const { note } = await c.req.json();
    
    // Find saved recipe
    const savedRecipe = await prisma.savedRecipe.findFirst({
        where: {
            userID: user.id,
            recipeID
        }
    });
    
    if (!savedRecipe) {
        return c.json({ error: 'Recipe not saved' }, 404);
    }
    
    // Update note
    const updated = await prisma.savedRecipe.update({
        where: { id: savedRecipe.id },
        data: { note }
    });
    
    return c.json(updated);
})

// Unsave a recipe (delete)
savedRecipeController.delete('/:recipeId', authMiddleware, async (c) => {
    const user = c.get('user');
    
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const recipeID = parseInt(c.req.param('recipeId'));
    
    // Find saved recipe
    const savedRecipe = await prisma.savedRecipe.findFirst({
        where: {
            userID: user.id,
            recipeID
        }
    });
    
    if (!savedRecipe) {
        return c.json({ error: 'Recipe not saved' }, 404);
    }
    
    // Delete saved recipe
    await prisma.savedRecipe.delete({
        where: { id: savedRecipe.id }
    });
    
    return c.json({ message: 'Recipe unsaved successfully' });
})

// Check if a recipe is saved by current user
savedRecipeController.get('/check/:recipeId', authMiddleware, async (c) => {
    const user = c.get('user');
    
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const recipeID = parseInt(c.req.param('recipeId'));
    
    const savedRecipe = await prisma.savedRecipe.findFirst({
        where: {
            userID: user.id,
            recipeID
        }
    });
    
    return c.json({
        isSaved: !!savedRecipe,
        savedRecipe: savedRecipe || null
    });
})

export default savedRecipeController;

