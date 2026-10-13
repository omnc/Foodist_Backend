let ingredientGroupColumnsPresent = false

/**
 * Whether migration 0005 (IngredientBlockItem.heading/groupIndex/position) has been applied.
 * Workers Builds deploys code on merge but does not run D1 migrations, so the code must work
 * on both schemas. Only a positive result is cached, so applying the migration takes effect
 * without a redeploy.
 */
export async function hasIngredientGroupColumns(db: D1Database): Promise<boolean> {
  if (ingredientGroupColumnsPresent) return true
  // Not a SELECT probe: SQLite treats an unknown double-quoted identifier as a string literal.
  try {
    const { results } = await db.prepare('PRAGMA table_info("IngredientBlockItem")').all<{ name: string }>()
    const columns = new Set(results.map((col) => col.name))
    ingredientGroupColumnsPresent = ['heading', 'groupIndex', 'position'].every((name) => columns.has(name))
  } catch {
    ingredientGroupColumnsPresent = false
  }
  return ingredientGroupColumnsPresent
}
