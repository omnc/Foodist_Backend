/**
 * Local D1 API smoke (NOT production).
 * Starts a local Worker via wrangler (workerd) so Prisma 7 `runtime=cloudflare` WASM loads.
 *
 * Run: npm run test:local-d1
 */
import { unstable_dev } from 'wrangler'
import type { Unstable_DevWorker } from 'wrangler'

const email = `local-d1-${Date.now()}@example.com`
const password = 'password123'
let failed = 0
let worker: Unstable_DevWorker | undefined

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (err: unknown) {
    failed += 1
    const message = err instanceof Error ? err.message : String(err)
    console.error(`FAIL ${name}:`, message)
  }
}

async function req(path: string, init: RequestInit = {}) {
  if (!worker) throw new Error('worker not started')
  return worker.fetch(`http://local.test${path}`, init)
}

// unstable_dev worker.fetch does not always set the multipart boundary for raw FormData,
// so serialise through a Request first.
async function multipart(form: FormData) {
  const prepared = new Request('http://local.test/', { method: 'POST', body: form })
  return {
    contentType: prepared.headers.get('Content-Type') || 'multipart/form-data',
    body: await prepared.arrayBuffer(),
  }
}

const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (ch) => ch.charCodeAt(0)
)

try {
  worker = await unstable_dev('src/index.ts', {
    config: 'wrangler.local.jsonc',
    experimental: { disableExperimentalWarning: true },
    persist: true,
    local: true,
  })

  await step('register', async () => {
    const res = await req('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (res.status !== 201) throw new Error(`status ${res.status} ${await res.text()}`)
    const body = (await res.json()) as Record<string, unknown>
    if (body.password) throw new Error('password leaked in register response')
  })

  let token = ''
  await step('login sets bearer + cookies', async () => {
    const res = await req('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (res.status !== 200) throw new Error(`status ${res.status} ${await res.text()}`)
    const body = (await res.json()) as { token?: string; csrfToken?: string }
    if (!body.token || !body.csrfToken) throw new Error('missing token/csrfToken')
    token = body.token
  })

  await step('unauthenticated password change denied', async () => {
    const res = await req('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'newpassword1',
        currentPassword: password,
        newPassword: 'newpassword1',
      }),
    })
    if (res.status === 200) throw new Error('expected auth failure')
  })

  let recipeId = 0
  await step('create recipe with nested fields', async () => {
    const form = new FormData()
    form.set('title', 'Local D1 Soup')
    form.set('description', 'Smoke test recipe')
    form.set('mealtype', 'LUNCH')
    form.set('servingSize', '2')
    form.set('level', '1')
    form.set('prepTime', '5')
    form.set('cookTime', '10')
    form.set(
      'ingredients',
      JSON.stringify([
        { name: 'Water', amount: '2', unit: 'cups' },
        { name: 'Salt', amount: '1', unit: 'tsp' },
        { name: 'Onion', amount: '1', unit: 'whole' },
      ])
    )
    form.set(
      'descriptionBlocks',
      JSON.stringify([
        { step: 1, content: 'Boil water' },
        { step: 2, content: 'Add onion and salt' },
      ])
    )

    // Build a Request so undici sets multipart Content-Type + boundary;
    // unstable_dev worker.fetch does not always do that for raw FormData init.
    const prepared = new Request('http://local.test/recipes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    const res = await req('/recipes', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': prepared.headers.get('Content-Type') || 'multipart/form-data',
      },
      body: await prepared.arrayBuffer(),
    })
    if (res.status !== 201) throw new Error(`status ${res.status} ${await res.text()}`)
    const body = (await res.json()) as {
      id: number
      ingredients?: unknown[]
      descriptionBlocks?: unknown[]
    }
    recipeId = body.id
    if (!body.ingredients?.length) throw new Error('ingredients not persisted')
    if (!body.descriptionBlocks?.length) throw new Error('directions not persisted')
  })

  await step('fetch recipe persists nested data', async () => {
    const res = await req(`/recipes/${recipeId}`)
    if (res.status !== 200) throw new Error(`status ${res.status}`)
    const body = (await res.json()) as {
      title: string
      ingredients?: unknown[]
      descriptionBlocks?: unknown[]
    }
    if (body.title !== 'Local D1 Soup') throw new Error('title mismatch')
    if ((body.ingredients || []).length < 3) throw new Error('expected 3 ingredients')
    if ((body.descriptionBlocks || []).length < 2) throw new Error('expected 2 steps')
  })

  const auth = () => ({ Authorization: `Bearer ${token}` })
  let imageRecipeId = 0
  let titleImagePath = ''
  await step('create recipe with images; images are served by the worker', async () => {
    const form = new FormData()
    form.set('title', 'Local D1 Pancakes')
    form.set('description', 'Image smoke recipe')
    form.set('mealtype', 'BREAKFAST')
    form.set('ingredients', JSON.stringify([{ name: 'Flour', amount: '1', unit: 'cup' }]))
    form.set('descriptionBlocks', JSON.stringify([{ step: 1, content: 'Mix' }]))
    form.set('titleImage', new File([PNG_1PX], 'cover.png', { type: 'image/png' }))
    form.set('stepImage_0', new File([PNG_1PX], 'step.png', { type: 'image/png' }))
    const { contentType, body } = await multipart(form)
    const res = await req('/recipes', { method: 'POST', headers: { ...auth(), 'Content-Type': contentType }, body })
    if (res.status !== 201) throw new Error(`status ${res.status} ${await res.text()}`)
    const recipe = (await res.json()) as {
      id: number
      titleImageUrl: string | null
      descriptionBlocks: Array<{ imageUrl: string | null }>
    }
    imageRecipeId = recipe.id
    const url = new URL(recipe.titleImageUrl || '')
    if (!url.pathname.startsWith('/images/recipes/')) throw new Error(`unexpected titleImageUrl ${recipe.titleImageUrl}`)
    titleImagePath = url.pathname
    const stepUrl = recipe.descriptionBlocks[0]?.imageUrl || ''
    if (!stepUrl.includes('/images/description-blocks/')) throw new Error(`unexpected step imageUrl ${stepUrl}`)

    const img = await req(titleImagePath)
    if (img.status !== 200) throw new Error(`image status ${img.status}`)
    if (img.headers.get('content-type') !== 'image/png') throw new Error(`content-type ${img.headers.get('content-type')}`)
    const bytes = new Uint8Array(await img.arrayBuffer())
    if (bytes.length !== PNG_1PX.length) throw new Error('image bytes mismatch')

    const etag = img.headers.get('etag') || ''
    const cached = await req(titleImagePath, { headers: { 'If-None-Match': etag } })
    if (cached.status !== 304) throw new Error(`conditional status ${cached.status}`)
  })

  await step('image route rejects bad keys and missing objects', async () => {
    for (const [path, expected] of [
      ['/images/recipes/does-not-exist.png', 404],
      ['/images/secrets/x.png', 400],
      ['/images/recipes/..%2F..%2Fx', 400],
    ] as const) {
      const res = await req(path)
      if (res.status !== expected) throw new Error(`${path}: expected ${expected}, got ${res.status}`)
    }
  })

  await step('save / check / list / note / unsave', async () => {
    const check = await req(`/saved-recipes/check/${imageRecipeId}`, { headers: auth() })
    if (check.status !== 200 || (await check.json() as { isSaved: boolean }).isSaved) throw new Error('expected unsaved')

    const save = await req(`/saved-recipes/${imageRecipeId}`, {
      method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: 'null',
    })
    if (save.status !== 201) throw new Error(`save with null body: ${save.status} ${await save.text()}`)

    const again = await req(`/saved-recipes/${imageRecipeId}`, { method: 'POST', headers: auth() })
    if (again.status !== 400) throw new Error(`duplicate save: ${again.status}`)

    const list = await req('/saved-recipes', { headers: auth() })
    const items = (await list.json()) as Array<{ recipe: { id: number; titleImageUrl: string | null } }>
    const entry = items.find((i) => i.recipe.id === imageRecipeId)
    if (!entry) throw new Error('saved recipe missing from list')
    if (!entry.recipe.titleImageUrl?.includes('/images/recipes/')) throw new Error('saved list image not resolved')

    const note = await req(`/saved-recipes/${imageRecipeId}`, { method: 'PUT', headers: auth() })
    if (note.status !== 200) throw new Error(`note without body: ${note.status}`)

    const unsave = await req(`/saved-recipes/${imageRecipeId}`, { method: 'DELETE', headers: auth() })
    if (unsave.status !== 200) throw new Error(`unsave: ${unsave.status}`)
  })

  await step('invalid ids return 400, not 500', async () => {
    for (const [method, path] of [
      ['POST', '/saved-recipes/abc'],
      ['GET', '/saved-recipes/check/undefined'],
      ['DELETE', '/saved-recipes/0'],
      ['PUT', '/recipes/abc'],
      ['DELETE', '/recipes/1.5'],
      ['PUT', '/recipes/comments/abc'],
    ] as const) {
      const res = await req(path, { method, headers: auth() })
      if (res.status !== 400) throw new Error(`${method} ${path}: ${res.status}`)
    }
  })

  await step('delete cascades comments, saves, steps, and images', async () => {
    const save = await req(`/saved-recipes/${imageRecipeId}`, { method: 'POST', headers: auth() })
    if (save.status !== 201) throw new Error(`save: ${save.status}`)
    const comment = await req(`/recipes/${imageRecipeId}/comments`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Tasty', rating: 4 }),
    })
    if (comment.status !== 201) throw new Error(`comment: ${comment.status}`)

    const del = await req(`/recipes/${imageRecipeId}`, { method: 'DELETE', headers: auth() })
    if (del.status !== 200) throw new Error(`delete: ${del.status} ${await del.text()}`)

    if ((await req(`/recipes/${imageRecipeId}`)).status !== 404) throw new Error('recipe still exists')
    const list = (await (await req('/saved-recipes', { headers: auth() })).json()) as Array<{ recipeID: number }>
    if (list.some((s) => s.recipeID === imageRecipeId)) throw new Error('save survived delete')
    if ((await req(titleImagePath)).status !== 404) throw new Error('title image survived delete')
  })
} finally {
  await worker?.stop()
}

if (failed) {
  console.error(`\nLocal D1 smoke failed (${failed} steps)`)
  process.exit(1)
}
console.log('\nLocal D1 smoke passed')
