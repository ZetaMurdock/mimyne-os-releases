import { expect, makeHub, tag, test } from './fixtures.js';

test('notes stay where they are put, and undo takes a move back', async ({ person }) => {
  const a = await person('alpha');
  await makeHub(a.page, 'Canvas Test', `cv${tag()}`);
  const { page } = a;
  await page.locator('.room-tile', { hasText: 'General' }).locator('.room-tile__open').click();

  const stage = await page.locator('.cv__stage').boundingBox();
  const at = (fx, fy) => [stage.x + stage.width * fx, stage.y + stage.height * fy];
  await page.mouse.dblclick(...at(0.3, 0.4));
  await expect(page.getByPlaceholder('Write something…')).toBeFocused();
  await page.keyboard.type('Drag me');
  await page.mouse.click(...at(0.95, 0.1));
  const note = page.locator('.cv-node--normal', { hasText: 'Drag me' });
  await expect(note).toBeVisible();

  // Drag it, and watch every frame after letting go: it must never flick
  // back to where it started.
  const start = await note.boundingBox();
  await page.mouse.move(start.x + 30, start.y + 15);
  await page.mouse.down();
  await page.mouse.move(start.x + 330, start.y + 115, { steps: 12 });
  await page.evaluate(() => {
    window.xs = [];
    const el = document.querySelector('.cv-node--normal');
    const t0 = performance.now();
    (function tick() {
      window.xs.push(el.getBoundingClientRect().left);
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
    })();
  });
  await page.mouse.up();
  await page.waitForTimeout(1600);
  const xs = await page.evaluate(() => window.xs);
  expect(xs.some((x) => Math.abs(x - start.x) < 20), 'jumped back while settling').toBe(false);
  const moved = await note.boundingBox();
  expect(moved.x - start.x).toBeGreaterThan(250);

  // It was saved: still there after a reload, which reopens the Room.
  await page.reload();
  await expect(note).toBeVisible();

  // Undo takes it back.
  await note.click();
  const before = await note.boundingBox();
  await page.mouse.move(before.x + 30, before.y + 15);
  await page.mouse.down();
  await page.mouse.move(before.x + 130, before.y + 15, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => Math.round((await note.boundingBox()).x - before.x)).toBeLessThan(3);
});
