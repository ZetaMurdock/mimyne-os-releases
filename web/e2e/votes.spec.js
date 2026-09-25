import { expect, makeHub, tag, test } from './fixtures.js';

test('approvals and views still show when Firestore says "too many requests"', async ({ person }) => {
  const a = await person('poster');
  const slug = `votes${tag()}`;
  await makeHub(a.page, 'Votes Hub', slug);
  await a.page.goto(`/h/${slug}?tab=board`);
  await a.page.locator('.composer__input').first().fill('Vote on this');
  await a.page.locator('.composer button[type=submit]').first().click();
  await expect(a.page.locator('.post', { hasText: 'Vote on this' })).toBeVisible();

  const b = await person('voter');
  await b.page.goto(`/h/${slug}?tab=board`);
  const post = b.page.locator('.post', { hasText: 'Vote on this' });
  await post.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(post.locator('.approve__count')).toHaveText('1');

  // Now the counts are refused the way the live site saw it (429,
  // resource-exhausted) the first few times each is asked.
  const refused = new Map();
  await b.page.context().route('**/*:runAggregationQuery*', async (route) => {
    const key = route.request().postData();
    const n = refused.get(key) ?? 0;
    if (n < 2) {
      refused.set(key, n + 1);
      return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 429, message: 'Quota exceeded.', status: 'RESOURCE_EXHAUSTED' } }) });
    }
    return route.continue();
  });
  await b.page.reload();
  await expect(post.locator('.approve__count')).toHaveText('1', { timeout: 20_000 });
  await expect(post.locator('.post__views')).toBeVisible();
  expect(refused.size).toBeGreaterThan(0);
});
