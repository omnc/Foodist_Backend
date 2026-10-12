/** Canonical meal-type values accepted by the API (matches Prisma MealTypes). */
export const VALID_MEAL_TYPES = [
  'BREAKFAST',
  'LUNCH',
  'DINNER',
  'SIDEDISH',
  'APPETIZER',
  'DESSERT',
  'DRINK',
  'BREAD',
] as const;

export type MealType = (typeof VALID_MEAL_TYPES)[number];

export function isValidMealType(value: string): value is MealType {
  return (VALID_MEAL_TYPES as readonly string[]).includes(value);
}
