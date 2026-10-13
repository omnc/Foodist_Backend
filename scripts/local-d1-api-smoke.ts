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
} finally {
  await worker?.stop()
}

if (failed) {
  console.error(`\nLocal D1 smoke failed (${failed} steps)`)
  process.exit(1)
}
console.log('\nLocal D1 smoke passed')
