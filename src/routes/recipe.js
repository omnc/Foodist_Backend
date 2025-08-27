const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const recipeController = require('../controllers/recipeController');
const upload = require('../middlewares/uploadMiddleware');

// Public list and detail
router.get('/', recipeController.getAllRecipes);
router.get('/:id', recipeController.getRecipeById);

// Authenticated operations
router.get('/mine/me', auth, recipeController.getMyRecipes);
router.post('/', auth, upload.single('image'), recipeController.createRecipe);
router.put('/:id', auth, upload.single('image'), recipeController.updateRecipe);
router.delete('/:id', auth, recipeController.deleteRecipe);

module.exports = router;