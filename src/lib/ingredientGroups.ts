export type IngredientInput = {
  name?: string
  value?: string
  amount?: string
  unit?: string
  measurement?: string
}

export type IngredientGroupInput = {
  heading: string
  items: IngredientInput[]
}

export type IngredientRow = {
  value: string
  measurement: string
  heading: string | null
  groupIndex: number
  position: number
}

export type StoredIngredientItem = {
  id: number
  value: string
  measurement: string
  heading?: string | null
  groupIndex?: number
  position?: number
}

export const MAX_HEADING_LENGTH = 120

function toRow(ing: IngredientInput): { value: string; measurement: string } | null {
  const value = String(ing?.name ?? ing?.value ?? '').trim()
  if (!value) return null
  const measurement = [ing.amount, ing.unit, ing.measurement]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => String(part).trim())
    .join(' ')
  return { value, measurement }
}

/**
 * Parse the `ingredientGroups` form field: `[{ heading, items: [{ name, amount, unit }] }]`,
 * ordered top-to-bottom as shown on the post page. Every group needs a non-blank heading.
 * Groups whose items are all blank are dropped.
 */
export function parseIngredientGroups(raw: unknown): { groups: IngredientGroupInput[] } | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(String(raw))
  } catch {
    return { error: 'ingredientGroups must be valid JSON' }
  }
  if (!Array.isArray(parsed)) return { error: 'ingredientGroups must be an array' }

  const groups: IngredientGroupInput[] = []
  for (const group of parsed) {
    const heading = typeof group?.heading === 'string' ? group.heading.trim() : ''
    if (!heading) return { error: 'Every ingredient group needs a heading' }
    if (heading.length > MAX_HEADING_LENGTH) {
      return { error: `Ingredient group headings must be at most ${MAX_HEADING_LENGTH} characters` }
    }
    const items = Array.isArray(group?.items) ? group.items : []
    groups.push({ heading, items })
  }
  return { groups }
}

/** Flatten groups into item rows, keeping group order (groupIndex) and item order (position). */
export function flattenIngredientGroups(groups: IngredientGroupInput[]): IngredientRow[] {
  const rows: IngredientRow[] = []
  let groupIndex = 0
  for (const group of groups) {
    const items = group.items.map(toRow).filter((r): r is { value: string; measurement: string } => r !== null)
    if (items.length === 0) continue
    items.forEach((item, position) => rows.push({ ...item, heading: group.heading, groupIndex, position }))
    groupIndex += 1
  }
  return rows
}

/** Legacy flat `ingredients` payload: a single group without a heading. */
export function flattenLegacyIngredients(ingredients: IngredientInput[]): IngredientRow[] {
  return ingredients
    .map(toRow)
    .filter((r): r is { value: string; measurement: string } => r !== null)
    .map((item, position) => ({ ...item, heading: null, groupIndex: 0, position }))
}

function toApiItem(item: StoredIngredientItem) {
  return {
    id: item.id,
    name: item.value,
    amount: item.measurement,
    value: item.value,
    measurement: item.measurement,
  }
}

/** Group stored items for the API, in the same order they were submitted. */
export function groupIngredientItems(items: StoredIngredientItem[]) {
  const sorted = [...items].sort(
    (a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0) || (a.position ?? 0) - (b.position ?? 0) || a.id - b.id
  )
  const groups: Array<{ heading: string | null; items: ReturnType<typeof toApiItem>[] }> = []
  let currentIndex: number | null = null
  for (const item of sorted) {
    const index = item.groupIndex ?? 0
    if (index !== currentIndex) {
      groups.push({ heading: item.heading ?? null, items: [] })
      currentIndex = index
    }
    groups[groups.length - 1].items.push(toApiItem(item))
  }
  return { ingredients: sorted.map(toApiItem), ingredientGroups: groups }
}
