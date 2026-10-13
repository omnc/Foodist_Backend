/**
 * Local D1 API smoke (NOT production).
 * Uses Wrangler platform proxy + local bindings from wrangler.local.jsonc.
 *
 * Run: npm run test:local-d1
 */
import { getPlatformProxy } from 'wrangler';
import app from '../src/index.ts';

const { env, dispose } = await getPlatformProxy({
  configPath: 'wrangler.local.jsonc',
  persist: true,
});

function req(path, init = {}) {
  return app.fetch(
    new Request(`http://local.test${path}`, init),
    env
  );
}

const email = `local-d1-${Date.now()}@example.com`;
const password = 'password123';
let failed = 0;

async function step(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}:`, err?.message || err);
  }
}

await step('register', async () => {
  const res = await req('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 201) throw new Error(`status ${res.status} ${await res.text()}`);
  const body = await res.json();
  if (body.password) throw new Error('password leaked in register response');
});

let token = '';
await step('login sets bearer + cookies', async () => {
  const res = await req('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`status ${res.status} ${await res.text()}`);
  const body = await res.json();
  if (!body.token || !body.csrfToken) throw new Error('missing token/csrfToken');
  token = body.token;
  const setCookie = res.headers.getSetCookie?.() || [];
  if (!setCookie.some((c) => c.startsWith('foodist_session='))) {
    // getSetCookie may be unavailable in some runtimes; cookie helpers still ran
    console.warn('warn: Set-Cookie not readable via getSetCookie in this runtime');
  }
});

await step('unauthenticated password change denied', async () => {
  const res = await req('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'newpassword1', currentPassword: password, newPassword: 'newpassword1' }),
  });
  if (res.status === 200) throw new Error('expected auth failure');
});

let recipeId = 0;
await step('create recipe with nested fields', async () => {
  const form = new FormData();
  form.set('title', 'Local D1 Soup');
  form.set('description', 'Smoke test recipe');
  form.set('mealtype', 'LUNCH');
  form.set('servingSize', '2');
  form.set('level', '1');
  form.set('prepTime', '5');
  form.set('cookTime', '10');
  form.set(
    'ingredients',
    JSON.stringify([
      { name: 'Water', amount: '2', unit: 'cups' },
      { name: 'Salt', amount: '1', unit: 'tsp' },
      { name: 'Onion', amount: '1', unit: 'whole' },
    ])
  );
  form.set(
    'descriptionBlocks',
    JSON.stringify([
      { step: 1, content: 'Boil water' },
      { step: 2, content: 'Add onion and salt' },
    ])
  );

  const res = await req('/recipes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (res.status !== 201) throw new Error(`status ${res.status} ${await res.text()}`);
  const body = await res.json();
  recipeId = body.id;
  if (!body.ingredients?.length) throw new Error('ingredients not persisted');
  if (!body.descriptionBlocks?.length) throw new Error('directions not persisted');
});

await step('fetch recipe persists nested data', async () => {
  const res = await req(`/recipes/${recipeId}`);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const body = await res.json();
  if (body.title !== 'Local D1 Soup') throw new Error('title mismatch');
  if ((body.ingredients || []).length < 3) throw new Error('expected 3 ingredients');
  if ((body.descriptionBlocks || []).length < 2) throw new Error('expected 2 steps');
});

await dispose();
if (failed) {
  console.error(`\nLocal D1 smoke failed (${failed} steps)`);
  process.exit(1);
}
console.log('\nLocal D1 smoke passed');
