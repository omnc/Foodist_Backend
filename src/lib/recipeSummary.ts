import { resolveImageUrl } from './images'

export type RatingSummary = {
  /** Mean of comment ratings rounded to 1 decimal, or null when nobody has rated yet. */
  averageRating: number | null
  ratingCount: number
  totalComments: number
}

/** Every comment carries a required 1–5 rating, so the recipe rating is the mean of comment ratings. */
export function ratingSummary(comments: Array<{ rating: number }> | null | undefined): RatingSummary {
  const ratings = (comments ?? []).map((c) => c.rating).filter((r) => Number.isFinite(r))
  const count = ratings.length
  const averageRating = count > 0 ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / count) * 10) / 10 : null
  return { averageRating, ratingCount: count, totalComments: comments?.length ?? 0 }
}

/** Prisma include for recipe cards (lists, search, saved, my recipes). */
export const recipeCardInclude = {
  user: { select: { id: true, email: true, username: true } },
  comments: { select: { rating: true } },
} as const

export function withImageUrls<T extends { titleImage?: string | null }>(recipe: T, base: string) {
  const titleImage = resolveImageUrl(recipe.titleImage, base)
  return { ...recipe, titleImage, titleImageUrl: titleImage }
}

type CardRecipe = {
  titleImage?: string | null
  user?: { username?: string | null; email?: string | null } | null
  comments: Array<{ rating: number }>
}

export function toRecipeCard<T extends CardRecipe>(recipe: T, base: string) {
  const { comments, ...rest } = recipe
  return {
    ...withImageUrls(rest, base),
    authorName: recipe.user?.username || recipe.user?.email || null,
    ...ratingSummary(comments),
  }
}
