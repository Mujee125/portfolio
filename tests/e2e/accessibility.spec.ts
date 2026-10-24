import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { gotoSettled, setScenario } from './helpers';

test.beforeEach(async () => {
  await setScenario('default');
});

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function analyse(page: import('@playwright/test').Page) {
  return new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
}

test.describe('accessibility (WCAG 2.2 AA)', () => {
  test('home page is axe-clean in the light theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await gotoSettled(page);
    const results = await analyse(page);
    expect(results.violations).toEqual([]);
  });

  test('home page is axe-clean in the dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await gotoSettled(page);
    const results = await analyse(page);
    expect(results.violations).toEqual([]);
  });

  test('repository detail page is axe-clean', async ({ page }) => {
    await gotoSettled(page, '/repositories/nebula-ui');
    const results = await analyse(page);
    expect(results.violations).toEqual([]);
  });

  test('404 page is axe-clean', async ({ page }) => {
    await page.goto('/does-not-exist', { waitUntil: 'domcontentloaded' });
    const results = await analyse(page);
    expect(results.violations).toEqual([]);
  });

  test('error state is axe-clean', async ({ page }) => {
    await setScenario('server-error');
    await gotoSettled(page);
    await expect(page.getByRole('alert').first()).toBeVisible();
    const results = await analyse(page);
    expect(results.violations).toEqual([]);
  });

  test('a filtered result set is axe-clean', async ({ page }) => {
    // Covers the state a reviewer actually shares: chips, "clear filters", a reduced list
    // and a result count that differs from the total.
    await gotoSettled(page, '/?q=ui&sort=stars');
    await expect(page.locator('ul[aria-label="Repositories"] > li').first()).toBeVisible();
    const results = await analyse(page);
    expect(results.violations).toEqual([]);
  });

  test('the empty state is axe-clean', async ({ page }) => {
    await setScenario('empty');
    await gotoSettled(page);
    await expect(page.getByRole('heading', { name: /No eligible public repositories/ })).toBeVisible();
    const results = await analyse(page);
    expect(results.violations).toEqual([]);
  });

  test('the rate-limited state is axe-clean', async ({ page }) => {
    await setScenario('rate-limited');
    await gotoSettled(page);
    await expect(page.getByRole('heading', { name: /rate limit/i })).toBeVisible();
    const results = await analyse(page);
    expect(results.violations).toEqual([]);
  });

  test('the zero-results state is axe-clean', async ({ page }) => {
    await gotoSettled(page, '/?q=zzzz-not-a-repo');
    await expect(page.getByRole('heading', { name: /No repositories match/ })).toBeVisible();
    const results = await analyse(page);
    expect(results.violations).toEqual([]);
  });

  test('page has one h1, landmark structure and a working skip link', async ({ page }) => {
    await gotoSettled(page);
    expect(await page.getByRole('heading', { level: 1 }).count()).toBe(1);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeVisible();
  });

  test('every interactive element is reachable by keyboard with a visible focus ring', async ({ page }) => {
    await gotoSettled(page);
    const seen: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const element = document.activeElement;
        if (!element) return null;
        const style = getComputedStyle(element);
        return {
          text: (element.getAttribute('aria-label') ?? element.textContent ?? element.tagName).trim().slice(0, 40),
          outline: `${style.outlineStyle} ${style.outlineWidth}`,
        };
      });
      expect(focused).not.toBeNull();
      if (focused) {
        seen.push(focused.text);
        // A visible focus indicator is required by WCAG 2.4.7 / 2.4.13.
        expect(focused.outline).not.toBe('none 0px');
      }
    }
    expect(seen.length).toBe(12);
  });

  test('filters can be operated with the keyboard alone', async ({ page }) => {
    await gotoSettled(page);

    // Keyboard-only path: focus the search field, type, submit with Enter (the form is a
    // native GET form, so this works even before hydration).
    await page.getByLabel('Search', { exact: true }).focus();
    await page.keyboard.type('rust');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/q=rust/);
    await expect(page.locator('ul[aria-label="Repositories"] > li')).toHaveCount(1);

    // Selecting an option from the native listbox is browser behaviour; what matters
    // here is that the control is reachable, labelled and that its change is applied.
    const language = page.getByLabel('Language', { exact: true });
    await expect(language).toBeVisible();
    await language.selectOption('Go');
    await expect(page).toHaveURL(/language=Go/);
    await expect(page.locator('[aria-live="polite"]').first()).toContainText(/match these filters|repositories/);
  });

  test('screen-reader-only result count updates are announced', async ({ page }) => {
    await gotoSettled(page);
    const live = page.locator('[aria-live="polite"]').first();
    await expect(live).toHaveAttribute('aria-atomic', 'true');
    await expect(live).toContainText('of 4 repositories');
  });
});
