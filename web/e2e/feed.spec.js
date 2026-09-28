import { expect, seed, test } from './fixtures.js';

test('a newcomer discovers a stranger’s existing post without friends or pledges', async ({ person, storage }) => {
  const author = await person('publicauthor');
  const path = `profile_pages/${author.uid}/posts/discovery`;
  await seed(path, {
    authorUid: { stringValue: author.uid }, authorName: { stringValue: author.username },
    body: { stringValue: 'A public post from before you joined' },
    createdAt: { timestampValue: '2025-01-01T12:00:00Z' },
  });
  storage.discovery = [path];
  const newcomer = await person('newreader');
  const post = newcomer.page.locator('.post', { hasText: 'A public post from before you joined' });
  await expect(post).toBeVisible();
  await newcomer.page.getByRole('button', { name: 'Popular', exact: true }).click();
  await expect(post).toBeVisible();
  await newcomer.page.getByRole('button', { name: 'Buddies', exact: true }).click();
  await expect(post).toHaveCount(0);
  // Even a stale discovery reference cannot expose a now-private profile.
  await seed(`profile_pages/${author.uid}`, { visibility: { stringValue: 'friends' } });
  await newcomer.page.goto('/feed');
  await expect(post).toHaveCount(0);
});
