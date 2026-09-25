import { expect, makeHub, tag, test } from './fixtures.js';

test('approvals and views still show when Firestore refuses count queries', async ({ person }) => {
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

  // Now every count query is refused the way the live site saw it (429,
  // resource-exhausted), every time: the counts come from the votes and
  // views themselves instead.
  let refused = 0;
  await b.page.context().route('**/*:runAggregationQuery*', (route) => {
    refused += 1;
    return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 429, message: 'Quota exceeded.', status: 'RESOURCE_EXHAUSTED' } }) });
  });
  await b.page.reload();
  await expect(post.locator('.approve__count')).toHaveText('1', { timeout: 20_000 });
  await expect(post.locator('.post__views')).toBeVisible();
  expect(refused).toBeGreaterThan(0);
});
