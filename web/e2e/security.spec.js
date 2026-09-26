import { expect, textedCode, test, verifyEmail } from './fixtures.js';

const PHONE = '+15555550123';

test('2-step verification: turned on with a phone, then asked for at the next sign-in', async ({ person, security }) => {
  const a = await person('careful');
  const { page } = a;

  await page.locator('.notch__name').click();
  await page.getByRole('link', { name: 'Security', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/security$/);
  await expect(page.locator('.security__state')).toHaveText('Off');

  // An unverified address can't have 2-step yet.
  await expect(page.getByText('Verify your email address before')).toBeVisible();
  await verifyEmail(a.uid);
  await page.getByRole('button', { name: /verified it/ }).click();

  await page.getByRole('button', { name: 'Add phone' }).click();
  await page.getByLabel('Phone number').fill(PHONE);
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await expect(page.getByText(`Enter the code we texted to ${PHONE}`)).toBeVisible();
  await page.getByLabel('Code').fill(await textedCode(PHONE));
  await page.getByRole('button', { name: 'Turn on' }).click();

  await expect(page.locator('.security__state')).toHaveText('On');
  await expect(page.locator('.security__item', { hasText: 'Text message' })).toContainText('5555550123');
  // The first second step comes with backup codes, shown once.
  await expect(page.getByRole('region', { name: 'Your new backup codes' }).locator('li')).toHaveCount(10);
  expect(security.calls.some(([m, p]) => m === 'POST' && p === '/security/codes')).toBe(true);
  await page.getByRole('button', { name: /saved them/ }).click();
  await expect(page.getByText('10 of 10 left')).toBeVisible();

  // A recovery email waits for its link.
  await page.getByRole('region', { name: 'Recovery email' }).getByLabel('Address').fill('careful.backup@example.com');
  await page.getByRole('button', { name: 'Send confirmation' }).click();
  await expect(page.getByText('Check careful.backup@example.com for a link')).toBeVisible();

  // Signed out and back in: the password isn't enough on its own.
  await page.locator('.notch__name').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.fill('input[type=email]', a.email);
  await page.fill('input[type=password]', 'password123');
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: '2-step verification' })).toBeVisible();
  await expect(page.locator('.notch__name')).toHaveCount(0);

  await page.getByRole('button', { name: 'Text me a code' }).click();
  await expect(page.getByLabel('Code', { exact: true })).toBeVisible();
  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toContainText("didn't work");
  await page.getByLabel('Code').fill(await textedCode(PHONE));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('.notch__name')).toHaveText(a.username);
});

test('new passwords need 10 characters', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByText('Make an account').click();
  await expect(page.locator('input[type=password]')).toHaveAttribute('minlength', '10');
  // Past the browser's own check, the form still refuses it before Firebase sees it.
  await page.locator('form').evaluate((form) => { form.noValidate = true; });
  await page.fill('input[type=email]', 'short@example.com');
  await page.fill('input[type=password]', 'short12');
  await page.locator('form').getByRole('button', { name: 'Make account' }).click();
  await expect(page.getByRole('alert')).toContainText('at least 10 characters');
});

test('someone who lost their phone gets back in with a backup code', async ({ page }) => {
  await page.route('https://mimyne-os.despits-tyrek.workers.dev/**', (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const { code } = route.request().postDataJSON();
    return code === 'abcd0-efgh0'
      ? route.fulfill({ headers: cors, json: { ok: true, done: 'recovered' } })
      : route.fulfill({ status: 400, headers: cors, json: { error: 'wrong-code', message: "That code didn't work. Check it, or use your recovery email." } });
  });
  await page.goto('/security/recover');
  await page.getByLabel("Your account's email").fill('lost@example.com');
  await page.getByLabel('Backup code').fill('wrong-wrong');
  await page.getByRole('button', { name: 'Turn off 2-step verification' }).click();
  await expect(page.getByRole('alert')).toContainText("didn't work");
  await page.getByLabel('Backup code').fill('abcd0-efgh0');
  await page.getByRole('button', { name: 'Turn off 2-step verification' }).click();
  await expect(page.getByRole('status')).toContainText('2-step verification is off');
});
