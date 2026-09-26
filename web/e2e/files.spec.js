import { expect, makeHub, tag, test } from './fixtures.js';

test('Hub files show how much of your storage is used, and a full one says so', async ({ person, storage }) => {
  const a = await person('alpha');
  const slug = `files${tag()}`;
  await makeHub(a.page, 'File Shelf', slug);
  await a.page.goto(`/h/${slug}?tab=files`);
  await expect(a.page.locator('.shelf__storage')).toContainText('of 5 GB');

  await a.page.locator('.shelf input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello shelf') });
  await expect(a.page.locator('.tile__name', { hasText: 'notes.txt' })).toBeVisible();

  // Full up: the upload is refused with the file service's reason.
  storage.used = storage.limit;
  await a.page.locator('.shelf input[type=file]').setInputFiles({ name: 'big.txt', mimeType: 'text/plain', buffer: Buffer.from('too much') });
  await expect(a.page.locator('.shelf__uploads .is-error')).toContainText('Delete some files');
});

test('a download is checked against the SHA-256 taken when it was stored, and a changed file is refused', async ({ person, storage }) => {
  const a = await person('keeper');
  const slug = `hash${tag()}`;
  await makeHub(a.page, 'Hash Shelf', slug);
  await a.page.goto(`/h/${slug}?tab=files`);
  await a.page.locator('.shelf input[type=file]').setInputFiles({ name: 'map.txt', mimeType: 'text/plain', buffer: Buffer.from('the real map') });
  const tile = a.page.locator('.tile', { hasText: 'map.txt' });
  await expect(tile).toBeVisible();

  // Same bytes: saved, under its own name.
  const saved = a.page.waitForEvent('download');
  await tile.getByRole('button', { name: 'Download map.txt' }).click();
  const download = await saved;
  expect(download.suggestedFilename()).toBe('map.txt');
  expect((await import('node:fs')).readFileSync(await download.path(), 'utf8')).toBe('the real map');

  // Someone changes the stored file: it isn't saved, and the person is told.
  const [path] = [...storage.files.keys()].filter((p) => p.endsWith('/map.txt'));
  storage.files.set(path, Buffer.from('a swapped map'));
  let swapped = false;
  a.page.once('download', () => { swapped = true; });
  await tile.getByRole('button', { name: 'Download map.txt' }).click();
  await expect(tile.getByRole('alert')).toContainText("isn't the one that was shared");
  expect(swapped).toBe(false);
});

test('a program asks first, and a disguised one says what it really is', async ({ person }) => {
  const a = await person('wary');
  const slug = `exe${tag()}`;
  await makeHub(a.page, 'Tools', slug);
  await a.page.goto(`/h/${slug}?tab=files`);
  await a.page.locator('.shelf input[type=file]').setInputFiles({ name: 'holiday.jpg.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ not really') });
  const tile = a.page.locator('.tile', { hasText: 'holiday.jpg.exe' });
  await expect(tile).toBeVisible();

  await tile.getByRole('button', { name: 'Download holiday.jpg.exe' }).click();
  const dialog = a.page.getByRole('dialog', { name: 'This file can run on your computer' });
  await expect(dialog).toContainText("look like a .jpg file, but it's really a .exe file");
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);

  await tile.getByRole('button', { name: 'Download holiday.jpg.exe' }).click();
  const saved = a.page.waitForEvent('download');
  await a.page.getByRole('dialog').getByRole('button', { name: 'Download anyway' }).click();
  expect((await saved).suggestedFilename()).toBe('holiday.jpg.exe');
});
