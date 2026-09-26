import { expect, makeHub, seed, tag, test } from './fixtures.js';

test('the pricing page sells each plan to the account that is signed in', async ({ page, person }) => {
  // Signed out: the plans, and a sign-in before buying.
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: /Start free/ })).toBeVisible();
  await expect(page.locator('.plan')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Sign in to buy' }).first()).toBeVisible();

  // Signed in: every checkout link carries who is buying.
  const a = await person('buyer');
  await a.page.goto('/pricing');
  const plus = a.page.getByRole('link', { name: 'Get Plus' });
  await expect(plus).toHaveAttribute('href', new RegExp(`ad7a424c.*checkout%5Bcustom%5D%5Buid%5D=${a.uid}`));
  await a.page.getByRole('radio', { name: /Yearly/ }).click();
  await expect(a.page.getByRole('link', { name: 'Get Plus' })).toHaveAttribute('href', /8b158738/);
  await expect(a.page.locator('.plan--featured .plan__amount')).toHaveText('$79');
  await expect(a.page.getByRole('link', { name: 'Get Deep' })).toHaveAttribute('href', /8a3c2c5e/);
  await expect(a.page.getByRole('link', { name: 'Get both' })).toHaveAttribute('href', /f134d82e/);

  // Hub Pro is bought for one of your own Hubs.
  const slug = `pro${tag()}`;
  await makeHub(a.page, 'Pro Hub', slug);
  await a.page.goto('/pricing');
  const row = a.page.locator('.plan__hub', { hasText: 'Pro Hub' });
  await expect(row.getByRole('link', { name: 'Get Hub Pro' })).toHaveAttribute('href', new RegExp(`ec6b4879.*checkout%5Bcustom%5D%5Bhub%5D=${slug}`));

  // Once Lemon Squeezy has reported the payment, the plan shows as yours.
  const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await seed(`entitlements/${a.uid}`, { plus: { mapValue: { fields: {
    active: { booleanValue: true }, status: { stringValue: 'active' }, plan: { stringValue: 'plus' },
    until: { timestampValue: until }, portal: { stringValue: 'https://mimyne.lemonsqueezy.com/billing' },
  } } } });
  await expect(a.page.locator('.pricing__mine')).toContainText('Mimyne Plus');
  await expect(a.page.locator('.plan--featured').getByRole('link', { name: /Manage/ })).toHaveAttribute('href', 'https://mimyne.lemonsqueezy.com/billing');
  await seed(`hub_billing/${slug}`, { pro: { mapValue: { fields: { active: { booleanValue: true }, until: { timestampValue: until } } } } });
  await expect(row.getByRole('button', { name: 'Yours' })).toBeVisible();
});
