import { describe, expect, it } from 'vitest'
import { ratingSummary, toRecipeCard } from './recipeSummary'

describe('ratingSummary', () => {
  it('returns null average when there are no ratings', () => {
    expect(ratingSummary([])).toEqual({ averageRating: null, ratingCount: 0, totalComments: 0 })
    expect(ratingSummary(undefined)).toEqual({ averageRating: null, ratingCount: 0, totalComments: 0 })
  })

  it('averages comment ratings rounded to one decimal', () => {
    expect(ratingSummary([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({
      averageRating: 4.3,
      ratingCount: 3,
      totalComments: 3,
    })
    expect(ratingSummary([{ rating: 3 }]).averageRating).toBe(3)
  })
})

describe('toRecipeCard', () => {
  it('adds rating summary, author name, and resolved image without leaking comments', () => {
    const card = toRecipeCard(
      {
        id: 1,
        title: 'Soup',
        titleImage: 'recipes/1-abc.png',
        user: { username: null, email: 'cook@example.com' },
        comments: [{ rating: 2 }, { rating: 5 }],
      },
      'https://api.example'
    )
    expect(card).toMatchObject({
      id: 1,
      titleImageUrl: 'https://api.example/images/recipes/1-abc.png',
      authorName: 'cook@example.com',
      averageRating: 3.5,
      ratingCount: 2,
    })
    expect(card).not.toHaveProperty('comments')
  })
})
