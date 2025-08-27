const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllRecipes = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
        const skip = (page - 1) * limit;
        const sort = (req.query.sort || 'createdAt').toString();
        const order = (req.query.order || 'desc').toString().toLowerCase() === 'asc' ? 'asc' : 'desc';

        const [total, recipes] = await Promise.all([
            prisma.recipe.count(),
            prisma.recipe.findMany({
                skip,
                take: limit,
                orderBy: { [sort]: order },
                include: {
                    user: { select: { id: true, email: true } },
                    ingredientBlock: true,
                    descriptionBlocks: true
                }
            })
        ]);

        res.json({ data: recipes, page, limit, total });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
};

exports.getRecipeById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const recipe = await prisma.recipe.findUnique({
            where: { id },
            include: {
                user: { select: { id: true, email: true } },
                ingredientBlock: true,
                descriptionBlocks: true
            }
        });
        if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
        res.json(recipe);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
};

exports.createRecipe = async (req, res) => {
    try {
        const { title, description, mealtype, servingSize, level, prepTime, cookTime, ingredientBlockID } = req.body;
        const userId = req.user.id;

        // title image from file upload (same single field 'image')
        let titleImage = null;
        if (req.file) {
            titleImage = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        }

        // optional descriptionBlocks provided as JSON string or object array
        let descriptionBlocksInput = req.body.descriptionBlocks;
        if (typeof descriptionBlocksInput === 'string') {
            try {
                descriptionBlocksInput = JSON.parse(descriptionBlocksInput);
            } catch (_) {
                descriptionBlocksInput = undefined;
            }
        }
        const descriptionBlocksData = Array.isArray(descriptionBlocksInput)
            ? descriptionBlocksInput
                .filter(b => b && typeof b.description === 'string' && b.description.trim().length > 0)
                .map(b => ({ description: b.description.trim(), imageUrl: b.imageUrl || null }))
            : undefined;

        const newRecipe = await prisma.recipe.create({
            data: {
                title,
                description,
                mealtype,
                servingSize: Number(servingSize),
                level: Number(level),
                prepTime: Number(prepTime),
                cookTime: Number(cookTime),
                ingredientBlock: { connect: { id: Number(ingredientBlockID) } },
                user: { connect: { id: userId } },
                titleImage,
                // keep legacy imageUrl equal to titleImage if present for backward compatibility
                imageUrl: titleImage || null,
                ...(descriptionBlocksData ? { descriptionBlocks: { create: descriptionBlocksData } } : {})
            },
            include: {
                descriptionBlocks: true
            }
        });
        res.json(newRecipe);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'cannot create recipe' });
    }
};

exports.getMyRecipes = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
        const skip = (page - 1) * limit;

        const [total, recipes] = await Promise.all([
            prisma.recipe.count({ where: { userID: userId } }),
            prisma.recipe.findMany({
                where: { userID: userId },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    ingredientBlock: true,
                    descriptionBlocks: true
                }
            })
        ]);

        res.json({ data: recipes, page, limit, total });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
};

exports.updateRecipe = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const userId = req.user.id;

        const existing = await prisma.recipe.findUnique({ where: { id }, select: { userID: true } });
        if (!existing) return res.status(404).json({ error: 'Recipe not found' });
        if (existing.userID !== userId) return res.status(403).json({ error: 'Forbidden' });

        const { title, description, mealtype, servingSize, level, prepTime, cookTime, ingredientBlockID } = req.body;

        let titleImage;
        if (req.file) {
            titleImage = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        }

        let descriptionBlocksInput = req.body.descriptionBlocks;
        if (typeof descriptionBlocksInput === 'string') {
            try { descriptionBlocksInput = JSON.parse(descriptionBlocksInput); } catch (_) { descriptionBlocksInput = undefined; }
        }
        const descriptionBlocksData = Array.isArray(descriptionBlocksInput)
            ? descriptionBlocksInput
                .filter(b => b && typeof b.description === 'string' && b.description.trim().length > 0)
                .map(b => ({ description: b.description.trim(), imageUrl: b.imageUrl || null }))
            : undefined;

        const dataUpdate = {
            ...(title !== undefined ? { title } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(mealtype !== undefined ? { mealtype } : {}),
            ...(servingSize !== undefined ? { servingSize: Number(servingSize) } : {}),
            ...(level !== undefined ? { level: Number(level) } : {}),
            ...(prepTime !== undefined ? { prepTime: Number(prepTime) } : {}),
            ...(cookTime !== undefined ? { cookTime: Number(cookTime) } : {}),
            ...(ingredientBlockID !== undefined ? { ingredientBlock: { connect: { id: Number(ingredientBlockID) } } } : {}),
            ...(titleImage ? { titleImage, imageUrl: titleImage } : {})
        };

        const txOps = [];
        if (descriptionBlocksData) {
            txOps.push(prisma.descriptionBlock.deleteMany({ where: { recipeId: id } }));
        }
        txOps.push(prisma.recipe.update({ where: { id }, data: dataUpdate }));
        if (descriptionBlocksData) {
            txOps.push(prisma.descriptionBlock.createMany({ data: descriptionBlocksData.map(b => ({ ...b, recipeId: id })) }));
        }

        await prisma.$transaction(txOps);

        const updated = await prisma.recipe.findUnique({
            where: { id },
            include: { ingredientBlock: true, descriptionBlocks: true }
        });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'cannot update recipe' });
    }
};

exports.deleteRecipe = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const userId = req.user.id;

        const existing = await prisma.recipe.findUnique({ where: { id }, select: { userID: true } });
        if (!existing) return res.status(404).json({ error: 'Recipe not found' });
        if (existing.userID !== userId) return res.status(403).json({ error: 'Forbidden' });

        await prisma.$transaction([
            prisma.descriptionBlock.deleteMany({ where: { recipeId: id } }),
            prisma.recipe.delete({ where: { id } })
        ]);

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'cannot delete recipe' });
    }
};