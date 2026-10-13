import { Hono } from "hono";
import { authMiddleware } from "../middlewares/authMiddleware";
import { deleteImages, uploadImage } from "../lib/imageUpload";
import { imageBaseFor, imageKeyFromStored, resolveImageUrl, validateImageFile } from "../lib/images";
import { parseId, readFormData, readJsonObject } from "../lib/http";
import { deleteRecipeCascade } from "../lib/recipeDelete";
import { ratingSummary, recipeCardInclude, toRecipeCard, withImageUrls } from "../lib/recipeSummary";
import {
    flattenIngredientGroups,
    flattenLegacyIngredients,
    groupIngredientItems,
    parseIngredientGroups,
    type IngredientInput,
    type IngredientRow,
} from "../lib/ingredientGroups";
import { hasIngredientGroupColumns } from "../lib/schemaFeatures";
import prismaClients from "../lib/prismaClient";
import { isValidMealType, VALID_MEAL_TYPES, type MealType } from "../lib/mealTypes";
import { getAuthUserId, type AuthUser } from "../lib/authz";

type Bindings = {
    FOODIST: D1Database;
    IMAGES: R2Bucket;
    JWT_SECRET: string;
    PUBLIC_IMAGE_BASE?: string;
}

type Variables = {
    user: AuthUser;
}

const recipeIncludeBase = {
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
};

const LEGACY_ITEM_SELECT = { id: true, value: true, measurement: true, ingredientBlockID: true } as const;

/** Detail include; before migration 0005 the group columns must not be selected. */
async function recipeIncludeFor(db: D1Database) {
    const groupsEnabled = await hasIngredientGroupColumns(db);
    return {
        ...recipeIncludeBase,
        ingredientBlock: {
            include: {
                items: groupsEnabled ? true : { select: LEGACY_ITEM_SELECT },
            },
        },
    } as const;
}

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

function serializeRecipe(recipe: any, base: string) {
    return {
        ...withImageUrls(recipe, base),
        descriptionBlocks: recipe.descriptionBlocks?.map((block: { imageUrl?: string | null }) => ({
            ...block,
            imageUrl: resolveImageUrl(block.imageUrl, base),
        })) ?? [],
        authorName: recipe.user?.username || recipe.user?.email || null,
        ...ratingSummary(recipe.comments),
        ...groupIngredientItems(recipe.ingredientBlock?.items ?? []),
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
        include: recipeCardInclude,
    });

    const base = imageBaseFor(c.req.url, c.env.PUBLIC_IMAGE_BASE);
    return c.json(recipes.map((recipe) => toRecipeCard(recipe, base)));
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
        include: recipeCardInclude,
    });

    const base = imageBaseFor(c.req.url, c.env.PUBLIC_IMAGE_BASE);
    return c.json(recipes.map((recipe) => toRecipeCard(recipe, base)));
})

//get the authenticated user's own recipes — must be registered before /:id
recipeController.get('/mine', authMiddleware, async (c) => {
    const userId = getAuthUserId(c.get('user'));
    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const recipes = await prisma.recipe.findMany({
        where: { userID: userId },
        orderBy: { createdAt: 'desc' },
        include: recipeCardInclude,
    });

    const base = imageBaseFor(c.req.url, c.env.PUBLIC_IMAGE_BASE);
    return c.json(recipes.map((recipe) => toRecipeCard(recipe, base)));
})

//get a recipe by id with comments, ingredients, directions, and average rating
recipeController.get('/:id', async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const id = parseId(c.req.param('id'));
    if (!id) {
        return c.json({ error: 'Invalid recipe id' }, 400);
    }

    const recipe = await prisma.recipe.findUnique({
        where: { id },
        include: await recipeIncludeFor(c.env.FOODIST),
    });

    if (!recipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }

    return c.json(serializeRecipe(recipe, imageBaseFor(c.req.url, c.env.PUBLIC_IMAGE_BASE)));
})

//post a comment(authenticated)
recipeController.post('/:id/comments', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const userId = getAuthUserId(c.get('user'));

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const recipeID = parseId(c.req.param('id'));
    if (!recipeID) {
        return c.json({ error: 'Invalid recipe id' }, 400);
    }

    const bodyJson = await readJsonObject(c.req);
    const body = typeof bodyJson.body === 'string' ? bodyJson.body.trim() : '';
    const rating = Number(bodyJson.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return c.json({ error: 'A rating between 1 and 5 is required' }, 400);
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

    const commentID = parseId(c.req.param('id'));
    if (!commentID) {
        return c.json({ error: 'Invalid comment id' }, 400);
    }
    const bodyJson = await readJsonObject(c.req);
    const body = typeof bodyJson.body === 'string' ? bodyJson.body.trim() : '';
    const rating = Number(bodyJson.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return c.json({ error: 'A rating between 1 and 5 is required' }, 400);
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

    const commentID = parseId(c.req.param('id'));
    if (!commentID) {
        return c.json({ error: 'Invalid comment id' }, 400);
    }

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

    const formData = await readFormData(c.req);
    if (!formData) {
        return c.json({ error: 'Expected multipart/form-data body' }, 400);
    }

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

    let ingredientRows: IngredientRow[];
    const ingredientGroupsRaw = formData.get('ingredientGroups');
    if (typeof ingredientGroupsRaw === 'string' && ingredientGroupsRaw.trim()) {
        const parsedGroups = parseIngredientGroups(ingredientGroupsRaw);
        if ('error' in parsedGroups) {
            return c.json({ error: parsedGroups.error }, 400);
        }
        ingredientRows = flattenIngredientGroups(parsedGroups.groups);
    } else {
        ingredientRows = flattenLegacyIngredients(parseIngredients(formData.get('ingredients')));
    }
    const descriptionBlocksInput = parseDescriptionBlocks(formData.get('descriptionBlocks'));

    const titleImageFile = formData.get('titleImage');
    const hasTitleImage = titleImageFile instanceof File && titleImageFile.size > 0;
    if (hasTitleImage) {
        const imageError = validateImageFile(titleImageFile);
        if (imageError) {
            return c.json({ error: `titleImage: ${imageError}` }, 400);
        }
    }

    let ingredientBlockID: number | undefined;
    if (ingredientBlockIDRaw) {
        const parsedBlockId = parseId(ingredientBlockIDRaw);
        if (!parsedBlockId) {
            return c.json({ error: 'ingredientBlockID must be a valid number' }, 400);
        }
        const ingredientBlock = await prisma.ingredientBlock.findUnique({
            where: { id: parsedBlockId }
        });
        if (!ingredientBlock) {
            return c.json({ error: 'IngredientBlock not found' }, 404);
        }
        ingredientBlockID = parsedBlockId;
    }

    // R2 writes are not rolled back with D1, so track keys and remove them if the DB writes fail.
    const uploadedKeys: string[] = [];
    try {
        const titleImageKey = hasTitleImage
            ? await uploadImage(titleImageFile, c.env.IMAGES, 'recipes')
            : null;
        if (titleImageKey) uploadedKeys.push(titleImageKey);

        // D1/Prisma: use sequential writes (interactive transactions not reliably supported).
        if (!ingredientBlockID) {
            const newIngredientBlock = await prisma.ingredientBlock.create({
                data: { title: 'Ingredients' }
            });
            ingredientBlockID = newIngredientBlock.id;

            const groupsEnabled = await hasIngredientGroupColumns(c.env.FOODIST);
            for (const row of ingredientRows) {
                if (groupsEnabled) {
                    await prisma.ingredientBlockItem.create({
                        data: {
                            value: row.value,
                            measurement: row.measurement,
                            heading: row.heading,
                            groupIndex: row.groupIndex,
                            position: row.position,
                            ingredientBlockID: ingredientBlockID!,
                        },
                    });
                } else {
                    // Prisma references every model column on insert, so bypass it until 0005 is applied.
                    await c.env.FOODIST
                        .prepare('INSERT INTO "IngredientBlockItem" ("value", "measurement", "ingredientBlockID") VALUES (?1, ?2, ?3)')
                        .bind(row.value, row.measurement, ingredientBlockID!)
                        .run();
                }
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
                titleImage: titleImageKey,
                userID: userId
            }
        });

        // Step images are matched by the step's index in the submitted descriptionBlocks (stepImage_<i>).
        for (let i = 0; i < descriptionBlocksInput.length; i++) {
            const block = descriptionBlocksInput[i];
            const text = (block.content || block.description || '').trim();
            if (!text) continue;

            let imageKey: string | null = null;
            const stepImage = formData.get(`stepImage_${i}`);
            if (stepImage instanceof File && stepImage.size > 0 && !validateImageFile(stepImage)) {
                imageKey = await uploadImage(stepImage, c.env.IMAGES, 'description-blocks');
                uploadedKeys.push(imageKey);
            }

            await prisma.descriptionBlock.create({
                data: {
                    description: text,
                    imageUrl: imageKey,
                    recipeId: recipe.id,
                }
            });
        }

        const full = await prisma.recipe.findUnique({
            where: { id: recipe.id },
            include: await recipeIncludeFor(c.env.FOODIST),
        });

        return c.json(serializeRecipe(full, imageBaseFor(c.req.url, c.env.PUBLIC_IMAGE_BASE)), 201);
    } catch (err) {
        console.error('Recipe create failed', err);
        await deleteImages(c.env.IMAGES, uploadedKeys);
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

    const recipeID = parseId(c.req.param('id'));
    if (!recipeID) {
        return c.json({ error: 'Invalid recipe id' }, 400);
    }

    const existingRecipe = await prisma.recipe.findUnique({
        where: { id: recipeID }
    });

    if (!existingRecipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }

    if (existingRecipe.userID !== userId) {
        return c.json({ error: 'Not authorized to edit this recipe' }, 403);
    }

    const formData = await readFormData(c.req);
    if (!formData) {
        return c.json({ error: 'Expected multipart/form-data body' }, 400);
    }

    const title = (formData.get('title') as string | null)?.trim();
    const description = (formData.get('description') as string | null)?.trim();
    const mealtypeRaw = formData.get('mealtype') as string | null;
    const servingSize = parseInt(formData.get('servingSize') as string, 10);
    const level = parseInt(formData.get('level') as string, 10);
    const prepTime = parseInt(formData.get('prepTime') as string, 10);
    const cookTime = parseInt(formData.get('cookTime') as string, 10);

    if (mealtypeRaw && !isValidMealType(mealtypeRaw)) {
        return c.json({
            error: `Invalid mealtype. Must be one of: ${VALID_MEAL_TYPES.join(', ')}`
        }, 400);
    }

    const ingredientBlockIDRaw = formData.get('ingredientBlockID') as string | null;
    let ingredientBlockID: number | null = null;
    if (ingredientBlockIDRaw) {
        ingredientBlockID = parseId(ingredientBlockIDRaw);
        if (!ingredientBlockID || !(await prisma.ingredientBlock.findUnique({ where: { id: ingredientBlockID } }))) {
            return c.json({ error: 'IngredientBlock not found' }, 404);
        }
    }

    const titleImageFile = formData.get('titleImage');
    let newTitleImageKey: string | null = null;
    if (titleImageFile instanceof File && titleImageFile.size > 0) {
        const imageError = validateImageFile(titleImageFile);
        if (imageError) {
            return c.json({ error: `titleImage: ${imageError}` }, 400);
        }
        newTitleImageKey = await uploadImage(titleImageFile, c.env.IMAGES, 'recipes');
    }

    try {
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
                ...(ingredientBlockID && { ingredientBlockID }),
                ...(newTitleImageKey && { titleImage: newTitleImageKey }),
            },
            include: await recipeIncludeFor(c.env.FOODIST),
        });

        if (newTitleImageKey) {
            await deleteImages(c.env.IMAGES, [imageKeyFromStored(existingRecipe.titleImage)]);
        }

        return c.json(serializeRecipe(recipe, imageBaseFor(c.req.url, c.env.PUBLIC_IMAGE_BASE)));
    } catch (err) {
        console.error('Recipe update failed', err);
        await deleteImages(c.env.IMAGES, [newTitleImageKey]);
        return c.json({ error: 'Failed to update recipe' }, 500);
    }
})

//delete a recipe with its comments, steps, and everyone's saves (authenticated)
recipeController.delete('/:id', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const userId = getAuthUserId(c.get('user'));

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const recipeID = parseId(c.req.param('id'));
    if (!recipeID) {
        return c.json({ error: 'Invalid recipe id' }, 400);
    }

    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeID },
        include: { descriptionBlocks: { select: { imageUrl: true } } },
    });

    if (!recipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }

    if (recipe.userID !== userId) {
        return c.json({ error: 'Not authorized to delete this recipe' }, 403);
    }

    await deleteRecipeCascade(c.env.FOODIST, recipe.id, recipe.ingredientBlockID);
    await deleteImages(c.env.IMAGES, [
        imageKeyFromStored(recipe.titleImage),
        ...recipe.descriptionBlocks.map((block) => imageKeyFromStored(block.imageUrl)),
    ]);

    return c.json({ message: 'Recipe deleted' });
})

//post a description block with optional image(authenticated)
recipeController.post('/:id/description-blocks', authMiddleware, async (c) => {
    const prisma = await prismaClients.fetch(c.env.FOODIST);
    const userId = getAuthUserId(c.get('user'));

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const recipeId = parseId(c.req.param('id'));
    if (!recipeId) {
        return c.json({ error: 'Invalid recipe id' }, 400);
    }

    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeId }
    });

    if (!recipe) {
        return c.json({ error: 'Recipe not found' }, 404);
    }

    if (recipe.userID !== userId) {
        return c.json({ error: 'Not authorized' }, 403);
    }

    const formData = await readFormData(c.req);
    if (!formData) {
        return c.json({ error: 'Expected multipart/form-data body' }, 400);
    }
    const description = ((formData.get('description') as string | null) || '').trim();
    if (!description) {
        return c.json({ error: 'description is required' }, 400);
    }
    const imageFile = formData.get('image');

    let imageKey: string | null = null;
    if (imageFile instanceof File && imageFile.size > 0) {
        const imageError = validateImageFile(imageFile);
        if (imageError) {
            return c.json({ error: imageError }, 400);
        }
        imageKey = await uploadImage(imageFile, c.env.IMAGES, 'description-blocks');
    }

    try {
        const descBlock = await prisma.descriptionBlock.create({
            data: {
                description,
                imageUrl: imageKey,
                recipeId
            }
        });

        return c.json({
            ...descBlock,
            imageUrl: resolveImageUrl(descBlock.imageUrl, imageBaseFor(c.req.url, c.env.PUBLIC_IMAGE_BASE)),
        }, 201);
    } catch (err) {
        console.error('Description block create failed', err);
        await deleteImages(c.env.IMAGES, [imageKey]);
        return c.json({ error: 'Failed to add step' }, 500);
    }
})

export default recipeController;
