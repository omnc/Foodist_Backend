import { describe, expect, it } from 'vitest'
import { isValidMealType, VALID_MEAL_TYPES } from './mealTypes'

describe('mealTypes', () => {
  it('accepts schema enum values', () => {
    for (const value of VALID_MEAL_TYPES) {
      expect(isValidMealType(value)).toBe(true)
    }
  })

  it('rejects SNACK and unknown values (contract alignment)', () => {
    expect(isValidMealType('SNACK')).toBe(false)
    expect(isValidMealType('brunch')).toBe(false)
  })
})
