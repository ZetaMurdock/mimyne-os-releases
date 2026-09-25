import { expect, makeHub, seed, tag, test } from './fixtures.js';

test('anyone can report a Hub, only staff see reports, and staff resolve them', async ({ person }) => {
  const owner = await person('owner');
  const slug = `bad${tag()}`;
  await makeHub(owner.page, 'Free Stuff', slug);

  const reporter = await person('reporter');
  await reporter.page.goto(`/h/${slug}`);
  await reporter.page.getByRole('button', { name: 'Report this Hub' }).click();
  await reporter.page.getByRole('radio', { name: 'Spam or scams' }).click();
  await reporter.page.locator('.report textarea').fill('Fake giveaways');
  await reporter.page.getByRole('button', { name: 'Send report' }).click();
  await expect(reporter.page.getByText('Thanks for telling us')).toBeVisible();

  // Not staff: nothing to see.
  await reporter.page.goto('/staff/reports');
  await expect(reporter.page.getByText('Nothing here')).toBeVisible();

  // Staff: made a Developer by hand, as the Owner would.
  const staff = await person('staff');
  await seed(`account_types/${staff.uid}`, { type: { stringValue: 'developer' }, grantedAt: { timestampValue: new Date().toISOString() }, days: { nullValue: null } });
  await staff.page.goto('/staff/reports');
  const row = staff.page.locator('.report-row', { hasText: 'Fake giveaways' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Spam or scams');
  await expect(row).toContainText('Free Stuff');
  await row.getByRole('button', { name: 'Resolve' }).click();
  await expect(row).toHaveCount(0);
  await staff.page.getByRole('tab', { name: 'Resolved' }).click();
  await expect(staff.page.locator('.report-row', { hasText: 'Fake giveaways' })).toBeVisible();
});

test('you can report a post, but not your own', async ({ person }) => {
  const a = await person('poster');
  const slug = `posts${tag()}`;
  await makeHub(a.page, 'Posts Here', slug);
  await a.page.goto(`/h/${slug}?tab=board`);
  await a.page.locator('.composer__input').first().fill('Click this link for free skins');
  await a.page.locator('.composer button[type=submit]').first().click();
  const post = a.page.locator('.post', { hasText: 'free skins' });
  await expect(post).toBeVisible();
  await expect(post.getByRole('button', { name: 'Report this post' })).toHaveCount(0);

  const b = await person('reader');
  await b.page.goto(`/h/${slug}?tab=board`);
  await b.page.locator('.post', { hasText: 'free skins' }).getByRole('button', { name: 'Report this post' }).click();
  await expect(b.page.getByRole('heading', { name: 'Report this post' })).toBeVisible();
  await b.page.getByRole('radio', { name: 'Spam or scams' }).click();
  await b.page.getByRole('button', { name: 'Send report' }).click();
  await expect(b.page.getByText('Thanks for telling us')).toBeVisible();
});
