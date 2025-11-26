import { Hono } from "hono";
import { authMiddleware } from "../middlewares/authMiddleware";
import { uploadImage } from "../lib/imageUpload";
import prismaClients from "../lib/prismaClient";

type Bindings = {
    FOODIST: D1Database;
    IMAGES: R2Bucket;
    JWT_SECRET: string;
}

type Variables = {
    user: any;
}

const recipeController = new Hono<{ Bindings: Bindings; Variables: Variables }>();

//get all recipes
recipeController.get('/', async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const recipes = await prisma.recipe.findMany();
    return c.json(recipes);
})

//get a recipe by id with comments and average rating
recipeController.get('/:id', async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const { id } = c.req.param();
    
    const recipe = await prisma.recipe.findUnique({
        where: { id: parseInt(id) },
        include: {
            comments: {
                include: {
                    user: {
                        select: { id: true, email: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            },
            user: {
                select: { id: true, email: true }
            },
            descriptionBlocks: true
        }
    });
    
    if (!recipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }
    
    // Calculate average rating
    const averageRating = recipe.comments.length > 0
        ? recipe.comments.reduce((sum: number, comment: any) => sum + comment.rating, 0) / recipe.comments.length
        : 0;
    
    return c.json({
        ...recipe,
        averageRating: Math.round(averageRating * 10) / 10,
        totalComments: recipe.comments.length
    });
})

//post a comment(authenticated)
recipeController.post('/:id/comments', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const user = c.get('user');
    
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { id } = c.req.param();
    const recipeID = parseInt(id);
    const { body, rating } = await c.req.json();
    
    // Validate rating
    if (rating < 1 || rating > 5) {
        return c.json({ error: 'Rating must be between 1 and 5' }, 400);
    }
    
    // Check if user already commented
    const existingComment = await prisma.comment.findFirst({
        where: { userID: user.id, recipeID }
    });
    
    if (existingComment) {
        return c.json({ error: 'You already commented on this recipe' }, 400);
    }
    
    const comment = await prisma.comment.create({
        data: { body, rating, userID: user.id, recipeID },
        include: {
            user: {
                select: { id: true, email: true }
            }
        }
    });
    
    return c.json(comment, 201);
})

//update a comment(authenticated)
recipeController.put('/comments/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const user = c.get('user');
    
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { id } = c.req.param();
    const commentID = parseInt(id);
    const { body, rating } = await c.req.json();
    
    // Validate rating
    if (rating < 1 || rating > 5) {
        return c.json({ error: 'Rating must be between 1 and 5' }, 400);
    }
    
    // Check if comment exists and belongs to user
    const comment = await prisma.comment.findUnique({
        where: { id: commentID }
    });
    
    if (!comment) {
        return c.json({ error: 'Comment not found' }, 404);
    }
    
    if (comment.userID !== user.id) {
        return c.json({ error: 'Not authorized to edit this comment' }, 403);
    }
    
    const updatedComment = await prisma.comment.update({
        where: { id: commentID },
        data: { body, rating }
    });
    
    return c.json(updatedComment);
})

//delete a comment(authenticated)
recipeController.delete('/comments/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const user = c.get('user');
    
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { id } = c.req.param();
    const commentID = parseInt(id);
    
    const comment = await prisma.comment.findUnique({
        where: { id: commentID }
    });
    
    if (!comment) {
        return c.json({ error: 'Comment not found' }, 404);
    }
    
    if (comment.userID !== user.id) {
        return c.json({ error: 'Not authorized to delete this comment' }, 403);
    }
    
    await prisma.comment.delete({
        where: { id: commentID }
    });
    
    return c.json({ message: 'Comment deleted' });
})

//search for recipes
recipeController.get('/search', async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const query = c.req.query('q');
    const mealtype = c.req.query('mealtype');
    const level = c.req.query('level');
    
    const recipes = await prisma.recipe.findMany({
        where: {
            ...(query && {
                OR: [
                    { title: { contains: query } },
                    { description: { contains: query } }
                ]
            }),
            ...(mealtype && { mealtype: mealtype }),
            ...(level && { level: parseInt(level) })
        }
    });
    
    return c.json(recipes);
})

//post a new recipe with image(authenticated)
recipeController.post('/', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const user = c.get('user');
    
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Use formData for file uploads
    const formData = await c.req.formData();
    
    // Extract text fields
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const mealtype = formData.get('mealtype') as string;
    const servingSize = parseInt(formData.get('servingSize') as string);
    const level = parseInt(formData.get('level') as string);
    const prepTime = parseInt(formData.get('prepTime') as string);
    const cookTime = parseInt(formData.get('cookTime') as string);
    const ingredientBlockID = parseInt(formData.get('ingredientBlockID') as string);
    
    // Handle title image upload
    const titleImageFile = formData.get('titleImage') as File | null;
    let titleImageUrl: string | null = null;
    
    if (titleImageFile && titleImageFile instanceof File) {
        // Validate image
        if (!titleImageFile.type.startsWith('image/')) {
            return c.json({ error: 'titleImage must be an image file' }, 400);
        }
        
        if (titleImageFile.size > 5 * 1024 * 1024) { // 5MB max
            return c.json({ error: 'Image too large (max 5MB)' }, 400);
        }
        
        // Upload to R2
        titleImageUrl = await uploadImage(titleImageFile, c.env.IMAGES, 'recipes');
    }
    
    // Create recipe with image URL
    const recipe = await prisma.recipe.create({
        data: {
            title,
            description,
            mealtype,
            servingSize,
            level,
            prepTime,
            cookTime,
            ingredientBlockID,
            titleImage: titleImageUrl,
            userID: user.id
        }
    });
    
    return c.json(recipe, 201);
})

//update a recipe with optional new image(authenticated)
recipeController.put('/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const user = c.get('user');
    
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { id } = c.req.param();
    const recipeID = parseInt(id);
    
    // Check if recipe exists and belongs to user
    const existingRecipe = await prisma.recipe.findUnique({
        where: { id: recipeID }
    });
    
    if (!existingRecipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }
    
    if (existingRecipe.userID !== user.id) {
        return c.json({ error: 'Not authorized to edit this recipe' }, 403);
    }
    
    const formData = await c.req.formData();
    
    // Extract fields
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const mealtype = formData.get('mealtype') as string;
    const servingSize = parseInt(formData.get('servingSize') as string);
    const level = parseInt(formData.get('level') as string);
    const prepTime = parseInt(formData.get('prepTime') as string);
    const cookTime = parseInt(formData.get('cookTime') as string);
    const ingredientBlockID = parseInt(formData.get('ingredientBlockID') as string);
    
    // Handle new title image if provided
    const titleImageFile = formData.get('titleImage') as File | null;
    let titleImageUrl = existingRecipe.titleImage; // Keep existing by default
    
    if (titleImageFile && titleImageFile instanceof File) {
        if (!titleImageFile.type.startsWith('image/')) {
            return c.json({ error: 'titleImage must be an image file' }, 400);
        }
        
        if (titleImageFile.size > 5 * 1024 * 1024) {
            return c.json({ error: 'Image too large (max 5MB)' }, 400);
        }
        
        titleImageUrl = await uploadImage(titleImageFile, c.env.IMAGES, 'recipes');
    }
    
    const recipe = await prisma.recipe.update({
        where: { id: recipeID },
        data: {
            title,
            description,
            mealtype,
            servingSize,
            level,
            prepTime,
            cookTime,
            ingredientBlockID,
            titleImage: titleImageUrl
        }
    });
    
    return c.json(recipe);
})

//delete a recipe(authenticated)
recipeController.delete('/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const user = c.get('user');
    
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { id } = c.req.param();
    const recipeID = parseInt(id);
    
    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeID }
    });
    
    if (!recipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }
    
    if (recipe.userID !== user.id) {
        return c.json({ error: 'Not authorized to delete this recipe' }, 403);
    }
    
    await prisma.recipe.delete({
        where: { id: recipeID }
    });
    
    return c.json({ message: 'Recipe deleted' });
})

//post a description block with optional image(authenticated)
recipeController.post('/:id/description-blocks', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const user = c.get('user');
    
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { id } = c.req.param();
    const recipeId = parseInt(id);
    
    // Verify recipe exists and belongs to user
    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeId }
    });
    
    if (!recipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }
    
    if (recipe.userID !== user.id) {
        return c.json({ error: 'Not authorized' }, 403);
    }
    
    const formData = await c.req.formData();
    const description = formData.get('description') as string;
    const imageFile = formData.get('image') as File | null;
    
    let imageUrl: string | null = null;
    if (imageFile && imageFile instanceof File) {
        if (!imageFile.type.startsWith('image/')) {
            return c.json({ error: 'Must be an image file' }, 400);
        }
        
        if (imageFile.size > 5 * 1024 * 1024) {
            return c.json({ error: 'Image too large (max 5MB)' }, 400);
        }
        
        imageUrl = await uploadImage(imageFile, c.env.IMAGES, 'description-blocks');
    }
    
    const descBlock = await prisma.descriptionBlock.create({
        data: {
            description,
            imageUrl,
            recipeId
        }
    });
    
    return c.json(descBlock, 201);
})

export default recipeController;