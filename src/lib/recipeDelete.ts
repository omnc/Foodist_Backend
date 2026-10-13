/**
 * Delete a recipe and everything that references it in one atomic D1 batch:
 * everyone's saves, its comments, its steps, then the recipe, then its ingredient
 * block if no other recipe still uses it.
 */
export async function deleteRecipeCascade(db: D1Database, recipeId: number, ingredientBlockId: number): Promise<void> {
  const blockUnused = 'NOT EXISTS (SELECT 1 FROM "Recipe" WHERE "ingredientBlockID" = ?1)'
  await db.batch([
    db.prepare('DELETE FROM "SavedRecipe" WHERE "recipeID" = ?1').bind(recipeId),
    db.prepare('DELETE FROM "Comment" WHERE "recipeID" = ?1').bind(recipeId),
    db.prepare('DELETE FROM "DescriptionBlock" WHERE "recipeId" = ?1').bind(recipeId),
    db.prepare('DELETE FROM "Recipe" WHERE "id" = ?1').bind(recipeId),
    db.prepare(`DELETE FROM "IngredientBlockItem" WHERE "ingredientBlockID" = ?1 AND ${blockUnused}`).bind(ingredientBlockId),
    db.prepare(`DELETE FROM "IngredientBlock" WHERE "id" = ?1 AND ${blockUnused}`).bind(ingredientBlockId),
  ])
}
