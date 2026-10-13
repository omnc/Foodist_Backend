import { describe, expect, it } from 'vitest'
import {
  flattenIngredientGroups,
  flattenLegacyIngredients,
  groupIngredientItems,
  parseIngredientGroups,
} from './ingredientGroups'

describe('parseIngredientGroups', () => {
  it('accepts groups with headings in submitted order', () => {
    const result = parseIngredientGroups(
      JSON.stringify([
        { heading: ' Sauce ', items: [{ name: 'Tomato', amount: '2', unit: 'cups' }] },
        { heading: 'Pasta', items: [{ name: 'Spaghetti', amount: '200', unit: 'g' }] },
      ])
    )
    expect(result).toEqual({
      groups: [
        { heading: 'Sauce', items: [{ name: 'Tomato', amount: '2', unit: 'cups' }] },
        { heading: 'Pasta', items: [{ name: 'Spaghetti', amount: '200', unit: 'g' }] },
      ],
    })
  })

  it('rejects blank headings, non-arrays, and invalid JSON', () => {
    expect(parseIngredientGroups(JSON.stringify([{ heading: '  ', items: [] }]))).toEqual({
      error: 'Every ingredient group needs a heading',
    })
    expect(parseIngredientGroups(JSON.stringify([{ items: [] }]))).toHaveProperty('error')
    expect(parseIngredientGroups('{}')).toEqual({ error: 'ingredientGroups must be an array' })
    expect(parseIngredientGroups('not json')).toEqual({ error: 'ingredientGroups must be valid JSON' })
    expect(parseIngredientGroups(JSON.stringify([{ heading: 'x'.repeat(121), items: [] }]))).toHaveProperty('error')
  })
})

describe('flattening', () => {
  it('assigns groupIndex/position and drops blank items and empty groups', () => {
    const rows = flattenIngredientGroups([
      { heading: 'Empty', items: [{ name: '  ' }] },
      { heading: 'Sauce', items: [{ name: 'Tomato', amount: '2', unit: 'cups' }, { name: 'Salt' }] },
      { heading: 'Pasta', items: [{ name: 'Spaghetti', amount: '200', unit: 'g' }] },
    ])
    expect(rows).toEqual([
      { value: 'Tomato', measurement: '2 cups', heading: 'Sauce', groupIndex: 0, position: 0 },
      { value: 'Salt', measurement: '', heading: 'Sauce', groupIndex: 0, position: 1 },
      { value: 'Spaghetti', measurement: '200 g', heading: 'Pasta', groupIndex: 1, position: 0 },
    ])
  })

  it('treats the legacy flat payload as one unheaded group', () => {
    expect(flattenLegacyIngredients([{ name: 'Water', amount: '1', unit: 'l' }, { name: '' }])).toEqual([
      { value: 'Water', measurement: '1 l', heading: null, groupIndex: 0, position: 0 },
    ])
  })
})

describe('groupIngredientItems', () => {
  it('rebuilds groups in submitted order regardless of row order', () => {
    const { ingredientGroups, ingredients } = groupIngredientItems([
      { id: 3, value: 'Spaghetti', measurement: '200 g', heading: 'Pasta', groupIndex: 1, position: 0 },
      { id: 2, value: 'Salt', measurement: '', heading: 'Sauce', groupIndex: 0, position: 1 },
      { id: 1, value: 'Tomato', measurement: '2 cups', heading: 'Sauce', groupIndex: 0, position: 0 },
    ])
    expect(ingredientGroups.map((g) => [g.heading, g.items.map((i) => i.name)])).toEqual([
      ['Sauce', ['Tomato', 'Salt']],
      ['Pasta', ['Spaghetti']],
    ])
    expect(ingredients.map((i) => i.name)).toEqual(['Tomato', 'Salt', 'Spaghetti'])
  })

  it('returns one unheaded group for legacy rows without group columns', () => {
    const { ingredientGroups } = groupIngredientItems([
      { id: 1, value: 'Water', measurement: '1 l' },
      { id: 2, value: 'Salt', measurement: '' },
    ])
    expect(ingredientGroups).toEqual([
      {
        heading: null,
        items: [
          { id: 1, name: 'Water', amount: '1 l', value: 'Water', measurement: '1 l' },
          { id: 2, name: 'Salt', amount: '', value: 'Salt', measurement: '' },
        ],
      },
    ])
  })

  it('returns no groups for no items', () => {
    expect(groupIngredientItems([])).toEqual({ ingredients: [], ingredientGroups: [] })
  })
})
