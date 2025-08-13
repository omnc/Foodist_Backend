const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllRecipes = async (req, res) => {
    try {
        const recipes = await prisma.recipe.findMany({
            include: {
                user: {
                    select: { id: true, email: true }
                },
                ingredientBlock: true
            }
        });
        res.json(recipes);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
};

exports.createRecipe = async (req, res) => {
    try {
        const { title, description, mealtype, servingSize, level, prepTime, cookTime, ingredientBlockID } = req.body;
        const userId = req.user.id;
        const newRecipe = await prisma.recipe.create({
            data: {
                title,
                description,
                mealtype,
                servingSize,
                level,
                prepTime,
                cookTime,
                ingredientBlock: { connect: { id: ingredientBlockID } },
                user: { connect: { id: userId } }
            }
        });
        res.json(newRecipe);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'cannot create recipe' });
    }
};