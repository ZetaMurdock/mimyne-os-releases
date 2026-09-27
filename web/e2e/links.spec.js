import { expect, makeHub, tag, test } from './fixtures.js';

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SHORT = 'https://youtube.com/shorts/abcDEF12345?si=share';

// Width over height of what's on screen.
const ratio = async (locator) => {
  const box = await locator.boundingBox();
  return box.width / box.height;
};

test('a YouTube video plays wide and a Short plays upright', async ({ person }) => {
  const a = await person('viewer');
  // The test stays offline: YouTube's pictures and players aren't loaded.
  await a.page.route(/(ytimg|youtube-nocookie)\.com/, (route) => route.abort());
  await makeHub(a.page, 'Watch Party', `watch${tag()}`);
  await a.page.locator('.room-tile', { hasText: 'General' }).locator('.room-tile__open').click();
  const box = a.page.getByPlaceholder('Message #general');
  for (const link of [VIDEO, SHORT]) {
    await box.fill(link);
    await box.press('Enter');
    await expect(a.page.locator(`.linkp[title="${link}"]`)).toBeVisible();
    await expect(box).toHaveValue(''); // sent, not just shown
  }

  const video = a.page.locator(`.linkp[title="${VIDEO}"]`);
  const short = a.page.locator(`.linkp[title="${SHORT}"]`);
  await expect(video.locator('.linkp__site')).toHaveText('YouTube');
  await expect(short.locator('.linkp__site')).toHaveText('YouTube Shorts');
  expect(await ratio(video.locator('.linkp__cover'))).toBeCloseTo(16 / 9, 1);
  expect(await ratio(short.locator('.linkp__cover'))).toBeCloseTo(9 / 16, 1);

  // Pressed, each opens YouTube's player in the same shape.
  await short.locator('.linkp__card').click();
  await expect(short.locator('iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/abcDEF12345\?/);
  expect(await ratio(short.locator('.linkp__player'))).toBeCloseTo(9 / 16, 1);
  await video.locator('.linkp__card').click();
  expect(await ratio(video.locator('.linkp__player'))).toBeCloseTo(16 / 9, 1);
});
