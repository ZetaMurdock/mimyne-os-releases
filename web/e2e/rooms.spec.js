import { expect, makeHub, tag, test } from './fixtures.js';

test('a new Hub opens on its General room, and its chat reaches everyone', async ({ person }) => {
  const a = await person('alpha');
  const slug = `crew${tag()}`;
  await makeHub(a.page, 'Ashfall Crew', slug);

  await a.page.locator('.room-tile', { hasText: 'General' }).locator('.room-tile__open').click();
  const box = a.page.getByPlaceholder('Message #general');
  await box.fill('hello from alpha');
  await box.press('Enter');
  await expect(a.page.locator('.room-msg__text', { hasText: 'hello from alpha' })).toBeVisible();

  // Someone else, not in the Hub, can read it.
  const b = await person('beta');
  await b.page.goto(`/h/${slug}`);
  await b.page.locator('.room-tile', { hasText: 'General' }).locator('.room-tile__open').click();
  await expect(b.page.locator('.room-msg__text', { hasText: 'hello from alpha' })).toBeVisible();
});

test('a Room made a moment ago can be opened straight away', async ({ person }) => {
  // Opening a Room before the server had it used to crash the page.
  const a = await person('alpha');
  const slug = `fresh${tag()}`;
  await makeHub(a.page, 'Fresh Rooms', slug);
  await a.page.locator('.room-tile--add').click();
  await a.page.locator('.room-form input').first().fill('Planning');
  await a.page.getByRole('button', { name: 'Make Room' }).click();
  await expect(a.page.locator('.cv__stage')).toBeVisible();
  await a.page.reload();
  await expect(a.page.locator('.room-tile', { hasText: 'Planning' }).or(a.page.locator('.cv__stage'))).toBeVisible();
});
