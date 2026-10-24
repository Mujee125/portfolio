import { expect, test } from '@playwright/test';
import { gotoSettled, setScenario } from './helpers';

test.beforeEach(async () => {
  await setScenario('default');
});

test.describe('theming', () => {
  test('follows the operating system preference by default', async ({ browser }) => {
    const dark = await browser.newContext({ colorScheme: 'dark' });
    const darkPage = await dark.newPage();
    await gotoSettled(darkPage);
    await expect(darkPage.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    const background = await darkPage.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgb(11, 13, 16)');
    await dark.close();

    const light = await browser.newContext({ colorScheme: 'light' });
    const lightPage = await light.newPage();
    await gotoSettled(lightPage);
    const lightBackground = await lightPage.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(lightBackground).toBe('rgb(245, 242, 234)');
    await light.close();
  });

  test('persists an explicit choice across reloads, navigation and tabs', async ({ page, context }) => {
    await gotoSettled(page);
    await page.getByRole('radio', { name: 'Dark theme' }).check();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('radio', { name: 'Dark theme' })).toBeChecked();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.goto('/repositories/nebula-ui', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const secondTab = await context.newPage();
    await secondTab.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(secondTab.locator('html')).toHaveAttribute('data-theme', 'dark');
    await secondTab.close();
  });

  test('returns to the system preference when "System" is selected', async ({ page }) => {
    await gotoSettled(page);
    await page.getByRole('radio', { name: 'Dark theme' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('radio', { name: 'System theme' }).check();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  });

  test('renders the stored theme on the server (no flash of the wrong theme)', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    await context.addCookies([{ name: 'theme', value: 'dark', url: 'http://127.0.0.1:3100' }]);
    const page = await context.newPage();

    // Disable JS entirely: the correct theme must already be in the HTML.
    await context.addInitScript(() => {});
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const html = await (await page.request.get('/')).text();
    expect(html).toContain('data-theme="dark"');
    await context.close();
  });

  test('honours prefers-reduced-motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await gotoSettled(page);
    const durationMs = await page.evaluate(() => {
      const animated = document.querySelector('[class*="animate-rise"]');
      if (!animated) return 0;
      const value = getComputedStyle(animated).animationDuration;
      return value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
    });
    expect(durationMs).toBeLessThanOrEqual(0.01);
    await context.close();
  });
});
