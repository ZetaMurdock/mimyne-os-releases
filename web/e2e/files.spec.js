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
