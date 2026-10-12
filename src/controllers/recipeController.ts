import { Hono } from "hono";
import { authMiddleware } from "../middlewares/authMiddleware";
import { uploadImage } from "../lib/imageUpload";
import prismaClients from "../lib/prismaClient";
import { isValidMealType, VALID_MEAL_TYPES, type MealType } from "../lib/mealTypes";
import { getAuthUserId, type AuthUser } from "../lib/authz";

type Bindings = {
    FOODIST: D1Database;
    IMAGES: R2Bucket;
    JWT_SECRET: string;
}

type Variables = {
    user: AuthUser;
}

type IngredientInput = {
    name?: string;
    value?: string;
    amount?: string;
    unit?: string;
    measurement?: string;
};

const recipeInclude = {
    comments: {
        include: {
            user: {
                select: { id: true, email: true, username: true }
            }
        },
        orderBy: { createdAt: 'desc' as const }
    },
    user: {
        select: { id: true, email: true, username: true }
    },
    descriptionBlocks: {
        orderBy: { id: 'asc' as const }
    },
    ingredientBlock: {
        include: {
            items: true
        }
    }
};

const recipeController = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function parseIngredients(raw: unknown): IngredientInput[] {
    if (!raw || typeof raw !== 'string') return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function parseDescriptionBlocks(raw: unknown): Array<{ content?: string; description?: string; step?: number }> {
    if (!raw || typeof raw !== 'string') return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function serializeRecipe(recipe: any) {
    const averageRating = recipe.comments?.length > 0
        ? recipe.comments.reduce((sum: number, comment: { rating: number }) => sum + comment.rating, 0) / recipe.comments.length
        : null;

    return {
        ...recipe,
        // Contract aliases used by frontend
        titleImageUrl: recipe.titleImage ?? null,
        authorName: recipe.user?.username || recipe.user?.email || null,
        averageRating: averageRating === null ? null : Math.round(averageRating * 10) / 10,
        totalComments: recipe.comments?.length ?? 0,
        ingredients: recipe.ingredientBlock?.items?.map((item: { value: string; measurement: string; id: number }) => ({
            id: item.id,
            name: item.value,
            amount: item.measurement,
            value: item.value,
            measurement: item.measurement,
        })) ?? [],
    };
}

//get all recipes
recipeController.get('/', async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const limitRaw = c.req.query('limit');
    const limit = Math.min(Math.max(parseInt(limitRaw || '50', 10) || 50, 1), 100);

    const recipes = await prisma.recipe.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
            user: { select: { id: true, email: true, username: true } },
            comments: { select: { rating: true } },
        }
    });

    return c.json(recipes.map((recipe) => ({
        ...recipe,
        titleImageUrl: recipe.titleImage ?? null,
        authorName: recipe.user?.username || recipe.user?.email || null,
        averageRating: recipe.comments.length > 0
            ? Math.round((recipe.comments.reduce((s, c) => s + c.rating, 0) / recipe.comments.length) * 10) / 10
            : null,
        totalComments: recipe.comments.length,
    })));
})

//search for recipes — must be registered before /:id
recipeController.get('/search', async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const query = c.req.query('q')?.trim() || '';
    const mealtypeRaw = c.req.query('mealtype');
    const level = c.req.query('level');
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10) || 50, 1), 100);

    if (mealtypeRaw && !isValidMealType(mealtypeRaw)) {
        return c.json({
            error: `Invalid mealtype. Must be one of: ${VALID_MEAL_TYPES.join(', ')}`
        }, 400);
    }

    const recipes = await prisma.recipe.findMany({
        where: {
            ...(query && {
                OR: [
                    { title: { contains: query } },
                    { description: { contains: query } }
                ]
            }),
            ...(mealtypeRaw && { mealtype: mealtypeRaw as MealType }),
            ...(level && !Number.isNaN(parseInt(level, 10)) && { level: parseInt(level, 10) })
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
            user: { select: { id: true, email: true, username: true } },
            comments: { select: { rating: true } },
        }
    });

    return c.json(recipes.map((recipe) => ({
        ...recipe,
        titleImageUrl: recipe.titleImage ?? null,
        authorName: recipe.user?.username || recipe.user?.email || null,
        averageRating: recipe.comments.length > 0
            ? Math.round((recipe.comments.reduce((s, c) => s + c.rating, 0) / recipe.comments.length) * 10) / 10
            : null,
        totalComments: recipe.comments.length,
    })));
})

//get a recipe by id with comments, ingredients, directions, and average rating
recipeController.get('/:id', async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const id = parseInt(c.req.param('id'), 10);
    if (!Number.isInteger(id) || id <= 0) {
        return c.json({ error: 'Invalid recipe id' }, 400);
    }

    const recipe = await prisma.recipe.findUnique({
        where: { id },
        include: recipeInclude,
    });

    if (!recipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }

    return c.json(serializeRecipe(recipe));
})

//post a comment(authenticated)
recipeController.post('/:id/comments', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const userId = getAuthUserId(c.get('user'));

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const recipeID = parseInt(c.req.param('id'), 10);
    if (!Number.isInteger(recipeID) || recipeID <= 0) {
        return c.json({ error: 'Invalid recipe id' }, 400);
    }

    const bodyJson = await c.req.json().catch(() => null);
    const body = typeof bodyJson?.body === 'string' ? bodyJson.body.trim() : '';
    const rating = Number(bodyJson?.rating);

    if (!body) {
        return c.json({ error: 'Comment body is required' }, 400);
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return c.json({ error: 'Rating must be an integer between 1 and 5' }, 400);
    }

    const recipe = await prisma.recipe.findUnique({ where: { id: recipeID } });
    if (!recipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }

    const existingComment = await prisma.comment.findFirst({
        where: { userID: userId, recipeID }
    });

    if (existingComment) {
        return c.json({ error: 'You already commented on this recipe' }, 400);
    }

    const comment = await prisma.comment.create({
        data: { body, rating, userID: userId, recipeID },
        include: {
            user: {
                select: { id: true, email: true, username: true }
            }
        }
    });

    return c.json(comment, 201);
})

//update a comment(authenticated)
recipeController.put('/comments/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const userId = getAuthUserId(c.get('user'));

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const commentID = parseInt(c.req.param('id'), 10);
    const bodyJson = await c.req.json().catch(() => null);
    const body = typeof bodyJson?.body === 'string' ? bodyJson.body.trim() : '';
    const rating = Number(bodyJson?.rating);

    if (!body) {
        return c.json({ error: 'Comment body is required' }, 400);
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return c.json({ error: 'Rating must be an integer between 1 and 5' }, 400);
    }

    const comment = await prisma.comment.findUnique({
        where: { id: commentID }
    });

    if (!comment) {
        return c.json({ error: 'Comment not found' }, 404);
    }

    if (comment.userID !== userId) {
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
    const userId = getAuthUserId(c.get('user'));

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const commentID = parseInt(c.req.param('id'), 10);

    const comment = await prisma.comment.findUnique({
        where: { id: commentID }
    });

    if (!comment) {
        return c.json({ error: 'Comment not found' }, 404);
    }

    if (comment.userID !== userId) {
        return c.json({ error: 'Not authorized to delete this comment' }, 403);
    }

    await prisma.comment.delete({
        where: { id: commentID }
    });

    return c.json({ message: 'Comment deleted' });
})

//post a new recipe with nested ingredients/directions and optional image(authenticated)
recipeController.post('/', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const userId = getAuthUserId(c.get('user'));

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const formData = await c.req.formData();

    const title = (formData.get('title') as string | null)?.trim() || '';
    const description = (formData.get('description') as string | null)?.trim() || '';
    const mealtypeRaw = formData.get('mealtype') as string | null;
    const servingSizeRaw = formData.get('servingSize') as string | null;
    const levelRaw = formData.get('level') as string | null;
    const prepTimeRaw = formData.get('prepTime') as string | null;
    const cookTimeRaw = formData.get('cookTime') as string | null;
    const ingredientBlockIDRaw = formData.get('ingredientBlockID') as string | null;

    if (!title) {
        return c.json({ error: 'title is required' }, 400);
    }
    if (!description) {
        return c.json({ error: 'description is required' }, 400);
    }
    if (!mealtypeRaw) {
        return c.json({ error: 'mealtype is required' }, 400);
    }
    if (!isValidMealType(mealtypeRaw)) {
        return c.json({
            error: `Invalid mealtype. Must be one of: ${VALID_MEAL_TYPES.join(', ')}`
        }, 400);
    }
    const mealtype = mealtypeRaw;

    const servingSize = servingSizeRaw ? parseInt(servingSizeRaw, 10) : 1;
    const level = levelRaw ? parseInt(levelRaw, 10) : 1;
    const prepTime = prepTimeRaw ? parseInt(prepTimeRaw, 10) : 0;
    const cookTime = cookTimeRaw ? parseInt(cookTimeRaw, 10) : 0;

    if ([servingSize, level, prepTime, cookTime].some((n) => Number.isNaN(n))) {
        return c.json({ error: 'servingSize, level, prepTime, and cookTime must be numbers' }, 400);
    }

    const ingredients = parseIngredients(formData.get('ingredients'));
    const descriptionBlocksInput = parseDescriptionBlocks(formData.get('descriptionBlocks'));

    // Handle title image upload (R2 — not rolled back by DB)
    const titleImageFile = formData.get('titleImage') as File | null;
    let titleImageUrl: string | null = null;
    let uploadedImageKey: string | null = null;

    if (titleImageFile && titleImageFile instanceof File && titleImageFile.size > 0) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(titleImageFile.type)) {
            return c.json({ error: 'titleImage must be jpeg, png, webp, or gif' }, 400);
        }

        if (titleImageFile.size > 5 * 1024 * 1024) {
            return c.json({ error: 'Image too large (max 5MB)' }, 400);
        }

        titleImageUrl = await uploadImage(titleImageFile, c.env.IMAGES, 'recipes');
        uploadedImageKey = titleImageUrl;
    }

    let ingredientBlockID: number | undefined;
    if (ingredientBlockIDRaw) {
        ingredientBlockID = parseInt(ingredientBlockIDRaw, 10);
        if (Number.isNaN(ingredientBlockID)) {
            return c.json({ error: 'ingredientBlockID must be a valid number' }, 400);
        }
        const ingredientBlock = await prisma.ingredientBlock.findUnique({
            where: { id: ingredientBlockID }
        });
        if (!ingredientBlock) {
            return c.json({ error: 'IngredientBlock not found' }, 404);
        }
    }

    try {
        // D1/Prisma: use sequential writes (interactive transactions not reliably supported).
        // Create nested records first, then the recipe, then description blocks.
        if (!ingredientBlockID) {
            const newIngredientBlock = await prisma.ingredientBlock.create({
                data: { title: 'Ingredients' }
            });
            ingredientBlockID = newIngredientBlock.id;

            for (const ing of ingredients) {
                const value = (ing.name || ing.value || '').trim();
                const measurement = [ing.amount, ing.unit, ing.measurement].filter(Boolean).join(' ').trim() || '';
                if (!value) continue;
                await prisma.ingredientBlockItem.create({
                    data: {
                        value,
                        measurement,
                        ingredientBlockID: ingredientBlockID!,
                    }
                });
            }
        }

        const recipe = await prisma.recipe.create({
            data: {
                title,
                description,
                mealtype,
                servingSize,
                level,
                prepTime,
                cookTime,
                ingredientBlockID: ingredientBlockID!,
                titleImage: titleImageUrl,
                userID: userId
            }
        });

        for (const block of descriptionBlocksInput) {
            const text = (block.content || block.description || '').trim();
            if (!text) continue;
            await prisma.descriptionBlock.create({
                data: {
                    description: text,
                    recipeId: recipe.id,
                }
            });
        }

        // Optional per-step images from multipart (stepImage_0, stepImage_1, ...)
        for (let i = 0; i < descriptionBlocksInput.length; i++) {
            const stepImage = formData.get(`stepImage_${i}`) as File | null;
            if (stepImage && stepImage instanceof File && stepImage.size > 0) {
                const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
                if (!allowedTypes.includes(stepImage.type) || stepImage.size > 5 * 1024 * 1024) {
                    continue;
                }
                const imageUrl = await uploadImage(stepImage, c.env.IMAGES, 'description-blocks');
                const blocks = await prisma.descriptionBlock.findMany({
                    where: { recipeId: recipe.id },
                    orderBy: { id: 'asc' }
                });
                if (blocks[i]) {
                    await prisma.descriptionBlock.update({
                        where: { id: blocks[i].id },
                        data: { imageUrl }
                    });
                }
            }
        }

        const full = await prisma.recipe.findUnique({
            where: { id: recipe.id },
            include: recipeInclude,
        });

        return c.json(serializeRecipe(full), 201);
    } catch (err) {
        console.error('Recipe create failed', err);
        // Note: R2 object at uploadedImageKey may be orphaned; cleanup is a follow-up task.
        void uploadedImageKey;
        return c.json({ error: 'Failed to create recipe' }, 500);
    }
})

//update a recipe with optional new image(authenticated)
recipeController.put('/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const userId = getAuthUserId(c.get('user'));

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const recipeID = parseInt(c.req.param('id'), 10);

    const existingRecipe = await prisma.recipe.findUnique({
        where: { id: recipeID }
    });

    if (!existingRecipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }

    if (existingRecipe.userID !== userId) {
        return c.json({ error: 'Not authorized to edit this recipe' }, 403);
    }

    const formData = await c.req.formData();

    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const mealtypeRaw = formData.get('mealtype') as string | null;
    const servingSize = parseInt(formData.get('servingSize') as string, 10);
    const level = parseInt(formData.get('level') as string, 10);
    const prepTime = parseInt(formData.get('prepTime') as string, 10);
    const cookTime = parseInt(formData.get('cookTime') as string, 10);
    const ingredientBlockID = parseInt(formData.get('ingredientBlockID') as string, 10);

    if (mealtypeRaw && !isValidMealType(mealtypeRaw)) {
        return c.json({
            error: `Invalid mealtype. Must be one of: ${VALID_MEAL_TYPES.join(', ')}`
        }, 400);
    }

    const titleImageFile = formData.get('titleImage') as File | null;
    let titleImageUrl = existingRecipe.titleImage;

    if (titleImageFile && titleImageFile instanceof File && titleImageFile.size > 0) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(titleImageFile.type)) {
            return c.json({ error: 'titleImage must be jpeg, png, webp, or gif' }, 400);
        }

        if (titleImageFile.size > 5 * 1024 * 1024) {
            return c.json({ error: 'Image too large (max 5MB)' }, 400);
        }

        titleImageUrl = await uploadImage(titleImageFile, c.env.IMAGES, 'recipes');
    }

    const recipe = await prisma.recipe.update({
        where: { id: recipeID },
        data: {
            ...(title && { title }),
            ...(description && { description }),
            ...(mealtypeRaw && { mealtype: mealtypeRaw as MealType }),
            ...(Number.isInteger(servingSize) && { servingSize }),
            ...(Number.isInteger(level) && { level }),
            ...(Number.isInteger(prepTime) && { prepTime }),
            ...(Number.isInteger(cookTime) && { cookTime }),
            ...(Number.isInteger(ingredientBlockID) && { ingredientBlockID }),
            titleImage: titleImageUrl
        },
        include: recipeInclude,
    });

    return c.json(serializeRecipe(recipe));
})

//delete a recipe(authenticated)
recipeController.delete('/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const userId = getAuthUserId(c.get('user'));

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const recipeID = parseInt(c.req.param('id'), 10);

    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeID }
    });

    if (!recipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }

    if (recipe.userID !== userId) {
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
    const userId = getAuthUserId(c.get('user'));

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const recipeId = parseInt(c.req.param('id'), 10);

    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeId }
    });

    if (!recipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }

    if (recipe.userID !== userId) {
        return c.json({ error: 'Not authorized' }, 403);
    }

    const formData = await c.req.formData();
    const description = formData.get('description') as string;
    const imageFile = formData.get('image') as File | null;

    let imageUrl: string | null = null;
    if (imageFile && imageFile instanceof File && imageFile.size > 0) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(imageFile.type)) {
            return c.json({ error: 'Must be jpeg, png, webp, or gif' }, 400);
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
