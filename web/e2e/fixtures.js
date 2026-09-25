/**
 * What every test shares: people who sign up in their own browser, a stand-in
 * for the files Worker, and a back door to the emulators for setting up what
 * the site itself can't (making someone staff).
 */
import { test as base, expect } from '@playwright/test';

export { expect };

const WORKER = 'https://mimyne-os.despits-tyrek.workers.dev';
const EMULATOR = 'http://127.0.0.1:8085/v1/projects/mimyne-os/databases/(default)/documents';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/mimyne-os';

/** A short random tag, so tests never trip over each other's names. */
export const tag = () => Math.random().toString(36).slice(2, 8);

const TYPES = { png: 'image/png', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', webm: 'video/webm' };

/**
 * The files Worker, in memory. `storage` is what /usage answers and what an
 * upload is checked against: { used, limit }.
 */
async function fakeWorker(context, storage) {
  const store = new Map();
  await context.route(`${WORKER}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const token = (req.headers().authorization ?? '').split(' ')[1];
    const uid = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).user_id : null;
    const reply = (json, status = 200) => route.fulfill({ status, headers: cors, json });

    if (url.pathname === '/usage') return uid ? reply({ used: storage.used, limit: storage.limit, files: 0, paid: false }) : reply({ error: 'sign-in-required' }, 401);
    if (url.pathname === '/uploads') {
      const { name, size } = req.postDataJSON();
      if (storage.limit && storage.used + size > storage.limit) {
        return reply({ error: 'storage-full', message: "You've used all of your storage. Delete some files to make room for this one." }, 413);
      }
      const path = `uploads/${uid}/e2e${tag()}${tag()}/${name}`;
      return reply({ mode: 'object', ticket: path, path, parts: 1 });
    }
    if (url.pathname === '/uploads/object') {
      const path = url.searchParams.get('ticket');
      const bytes = req.postDataBuffer() ?? Buffer.alloc(0);
      store.set(path, bytes);
      storage.used += bytes.length;
      return reply({ path });
    }
    if (url.pathname === '/downloads') {
      const { path } = req.postDataJSON();
      return reply({ url: `${WORKER}/files/${path}?exp=1&sig=e2e` });
    }
    if (url.pathname.startsWith('/files/')) {
      const path = decodeURIComponent(url.pathname.slice('/files/'.length));
      const body = store.get(path);
      if (!body) return route.fulfill({ status: 404, headers: cors });
      const type = TYPES[path.split('.').pop()] ?? 'application/octet-stream';
      return route.fulfill({ headers: { ...cors, 'content-type': type, 'content-length': String(body.length) }, body });
    }
    return reply({ error: 'not-found' }, 404);
  });
}

/** Signs a new person up through the site: { page, email, username, uid }. */
async function signUp(page, username) {
  const email = `${username}@example.com`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByText('Make an account').click();
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'password123');
  await page.getByRole('button', { name: 'Make account' }).click();
  // Signed in for real: the notch has their name. On a cold start Vite can
  // reload the page once while it bundles something new, and a reload in the
  // middle of claiming a username asks for it again.
  for (let attempt = 0; ; attempt += 1) {
    await page.fill('input[autocomplete=username]', username);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('input[autocomplete=username]')).toHaveCount(0);
    await page.goto('/feed');
    const claim = page.locator('input[autocomplete=username]');
    await expect(page.locator('.notch__name').or(claim)).toBeVisible();
    if (!(await claim.count())) break;
    if (attempt === 1) throw new Error(`${username} was asked for a username twice`);
  }
  await expect(page.locator('.notch__name')).toHaveText(username);
  const uid = await uidOf(email);
  return { page, email, username, uid };
}

/** The emulator's uid for an email. */
export async function uidOf(email) {
  const res = await fetch(`${AUTH}/accounts:query`, {
    method: 'POST', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: '{}',
  });
  return (await res.json()).userInfo.find((u) => u.email === email)?.localId;
}

/** Writes a document straight into the emulator, past the rules. */
export async function seed(path, fields) {
  const res = await fetch(`${EMULATOR}/${path}`, {
    method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`seed ${path}: ${res.status} ${await res.text()}`);
}

/** Makes a Hub through the site, as `page`'s person, and opens it. */
export async function makeHub(page, name, slug) {
  await page.goto('/hubs/new');
  await page.locator('form .field__input').nth(0).fill(name);
  await page.locator('form .field__input').nth(1).fill(slug);
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL(new RegExp(`/h/${slug}`));
  await expect(page.locator('.room-tile', { hasText: 'General' })).toBeVisible();
}

export const test = base.extend({
  // What /usage reports; tests change it before uploading.
  storage: async ({}, use) => use({ used: 0, limit: 5 * 1024 ** 3 }),

  // `person('name')` gives a signed-up person in a browser of their own.
  // Anything the page throws fails the test.
  person: async ({ browser, storage }, use) => {
    const contexts = [];
    const errors = [];
    await use(async (name) => {
      const context = await browser.newContext();
      contexts.push(context);
      await fakeWorker(context, storage);
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      return signUp(page, `${name}_${tag()}`);
    });
    await Promise.all(contexts.map((c) => c.close()));
    expect(errors, 'errors thrown in the page').toEqual([]);
  },
});
