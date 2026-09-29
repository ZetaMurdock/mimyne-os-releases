import { expect, test } from './fixtures.js';

test('a message pinned in a chat shows for both people, and search finds what was said', async ({ person }) => {
  const a = await person('alpha');
  const b = await person('beta');

  await a.page.goto('/messages');
  await a.page.getByRole('button', { name: 'New message' }).click();
  await a.page.getByPlaceholder('@username').fill(b.username);
  await a.page.getByRole('button', { name: 'Open conversation' }).click();
  await expect(a.page).toHaveURL(/\/messages\/.+/);
  const box = a.page.getByRole('textbox', { name: /^Message / });
  for (const words of ['raid on tuesday', 'bring the map', 'see you then']) {
    await box.fill(words);
    await box.press('Enter');
    await expect(a.page.locator('.msg__bubble', { hasText: words })).toBeVisible();
  }

  // Pinned from the message's tools: the pin bar, the side column and the
  // message itself say so, on both sides.
  const first = a.page.locator('.msg', { hasText: 'raid on tuesday' });
  await first.hover();
  await first.getByRole('button', { name: 'Pin' }).click();
  await expect(a.page.locator('.inbox__pinbar')).toContainText('raid on tuesday');
  await expect(a.page.locator('.inbox__pin')).toHaveCount(1);
  await expect(first.locator('.msg__pinned')).toBeVisible();

  await b.page.goto(new URL(a.page.url()).pathname);
  await expect(b.page.locator('.inbox__pinbar')).toContainText('raid on tuesday');

  // Search: what it finds is counted and marked; nothing found says so.
  await b.page.getByRole('button', { name: 'Search this chat' }).click();
  const search = b.page.getByRole('textbox', { name: 'Search this chat' });
  await search.fill('map');
  await expect(b.page.locator('.inbox__find-count')).toHaveText('1 of 1');
  await expect(b.page.locator('.msg.is-found')).toHaveCount(1);
  await expect(b.page.locator('.msg.is-found')).toContainText('bring the map');
  await search.fill('zebra');
  await expect(b.page.locator('.inbox__find-count')).toHaveText('Nothing found');
  await search.press('Escape');
  await expect(b.page.locator('.inbox__find')).toHaveCount(0);

  // The pin bar goes to the pinned message.
  await b.page.locator('.inbox__pinbar').click();
  await expect(b.page.locator('.msg.is-lit')).toContainText('raid on tuesday');

  // Unpinned from the side column: gone for both.
  await b.page.locator('.inbox__pin-off').click();
  await expect(b.page.locator('.inbox__pinbar')).toHaveCount(0);
  await expect(a.page.locator('.inbox__pinbar')).toHaveCount(0);
});
