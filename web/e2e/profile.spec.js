import { expect, test } from './fixtures.js';

test('you can change your display name on the website', async ({ person }) => {
  const a = await person('namer');
  const { page } = a;
  await page.goto(`/u/${a.username}`);
  const heading = page.locator('.profile__name');
  await expect(heading).toHaveText(a.username);

  const change = page.getByRole('button', { name: 'Change your display name' });
  const box = page.getByLabel('Display name');
  const save = page.getByRole('button', { name: 'Save', exact: true });

  // Names that would read as Mimyne itself are refused.
  await change.click();
  await box.fill('Mimyne Staff');
  await save.click();
  await expect(page.getByRole('alert')).toContainText('kept for Mimyne');

  // Hidden characters are dropped; the name stays after a reload.
  await box.fill('  Ada​   Lovelace ');
  await save.click();
  await expect(heading).toHaveText('Ada Lovelace');
  await page.reload();
  await expect(page.locator('.profile__name')).toHaveText('Ada Lovelace');

  // Someone else can't change it for you.
  await expect(page.getByRole('button', { name: 'Change your display name' })).toBeVisible();
  const b = await person('visitor');
  await b.page.goto(`/u/${a.username}`);
  await expect(b.page.locator('.profile__name')).toHaveText('Ada Lovelace');
  await expect(b.page.getByRole('button', { name: 'Change your display name' })).toHaveCount(0);

  // Empty goes back to the username.
  await page.getByRole('button', { name: 'Change your display name' }).click();
  await page.getByLabel('Display name').fill('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.profile__name')).toHaveText(a.username);
});
