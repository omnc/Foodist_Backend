import { Hono } from "hono";
import { authMiddleware } from "../middlewares/authMiddleware";
import prismaClients from "../lib/prismaClient";
import { getAuthUserId, type AuthUser } from "../lib/authz";
import { parseId, readJsonObject } from "../lib/http";
import { imageBaseFor } from "../lib/images";
import { recipeCardInclude, toRecipeCard } from "../lib/recipeSummary";

type Bindings = {
    FOODIST: D1Database;
    JWT_SECRET: string;
    PUBLIC_IMAGE_BASE?: string;
}

type Variables = {
    user: AuthUser;
}

const savedRecipeController = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Get all saved recipes for current user
savedRecipeController.get('/', authMiddleware, async (c) => {
    const userId = getAuthUserId(c.get('user'));
    
    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const savedRecipes = await prisma.savedRecipe.findMany({
        where: { userID: userId },
        include: {
            recipe: { include: recipeCardInclude }
        },
        orderBy: { savedAt: 'desc' }
    });
    
    const base = imageBaseFor(c.req.url, c.env.PUBLIC_IMAGE_BASE);
    return c.json(savedRecipes.map((entry) => ({ ...entry, recipe: toRecipeCard(entry.recipe, base) })));
})

// Save a recipe
savedRecipeController.post('/:recipeId', authMiddleware, async (c) => {
    const userId = getAuthUserId(c.get('user'));
    
    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const recipeID = parseId(c.req.param('recipeId'));
    if (!recipeID) {
        return c.json({ error: 'Invalid recipe id' }, 400);
    }
    const body = await readJsonObject(c.req);
    const note = typeof body.note === 'string' ? body.note : null;
    
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
            userID: userId,
            recipeID
        }
    });
    
    if (existing) {
        return c.json({ error: 'Recipe already saved' }, 400);
    }
    
    // Save recipe
    const savedRecipe = await prisma.savedRecipe.create({
        data: {
            userID: userId,
            recipeID,
            note
        },
    });
    
    return c.json(savedRecipe, 201);
})

// Update note on saved recipe
savedRecipeController.put('/:recipeId', authMiddleware, async (c) => {
    const userId = getAuthUserId(c.get('user'));
    
    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const recipeID = parseId(c.req.param('recipeId'));
    if (!recipeID) {
        return c.json({ error: 'Invalid recipe id' }, 400);
    }
    const body = await readJsonObject(c.req);
    const note = typeof body.note === 'string' ? body.note : null;
    
    // Find saved recipe
    const savedRecipe = await prisma.savedRecipe.findFirst({
        where: {
            userID: userId,
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
    const userId = getAuthUserId(c.get('user'));
    
    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const recipeID = parseId(c.req.param('recipeId'));
    if (!recipeID) {
        return c.json({ error: 'Invalid recipe id' }, 400);
    }
    
    // Find saved recipe
    const savedRecipe = await prisma.savedRecipe.findFirst({
        where: {
            userID: userId,
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
    const userId = getAuthUserId(c.get('user'));
    
    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const recipeID = parseId(c.req.param('recipeId'));
    if (!recipeID) {
        return c.json({ error: 'Invalid recipe id' }, 400);
    }
    
    const savedRecipe = await prisma.savedRecipe.findFirst({
        where: {
            userID: userId,
            recipeID
        }
    });
    
    return c.json({
        isSaved: !!savedRecipe,
        savedRecipe: savedRecipe || null
    });
})

export default savedRecipeController;

