const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const recipeController = require('../controllers/recipeController');

router.get('/',auth, recipeController.getAllRecipes);
router.post('/',auth, recipeController.createRecipe);

module.exports = router;