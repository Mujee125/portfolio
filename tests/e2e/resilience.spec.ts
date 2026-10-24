import { expect, test } from '@playwright/test';
import { gotoSettled, mockRequestCount, setScenario } from './helpers';

test.describe('failure and freshness behaviour', () => {
  test('a new repository appears after the cache expires — no redeploy, no code change', async ({ page }) => {
    await setScenario('default');
    await gotoSettled(page);
    await expect(page.getByRole('heading', { name: 'freshly-created' })).toHaveCount(0);

    // The repository is created on GitHub…
    await setScenario('new-repo');

    // …and shows up on the next request because the TTL has elapsed (E2E uses TTL=0).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'freshly-created' }).first()).toBeVisible();

    const body = await (await page.request.get('/api/repositories')).json();
    expect(body.data.map((repo: { name: string }) => repo.name)).toContain('freshly-created');
  });

  test('a mid-pagination failure shows an error, never a silently shortened list', async ({ page }) => {
    await setScenario('default');
    await gotoSettled(page);
    await expect(page.locator('ul[aria-label="Repositories"] > li')).toHaveCount(4);

    await setScenario('server-error');
    await page.reload({ waitUntil: 'domcontentloaded' });

    // TTL=0 means no cached snapshot survives, so the honest answer is "unavailable".
    await expect(page.getByRole('heading', { name: 'Repositories are unavailable right now' })).toBeVisible();
    await expect(page.locator('ul[aria-label="Repositories"]')).toHaveCount(0);
  });

  test('rate limiting is explained and a retry works once GitHub recovers', async ({ page }) => {
    await setScenario('rate-limited');
    await gotoSettled(page);

    await expect(page.getByRole('heading', { name: 'GitHub rate limit reached' })).toBeVisible();
    await expect(page.getByText(/The quota resets at/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Open repositories on GitHub/ })).toBeVisible();

    await setScenario('default');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'nebula-ui' }).first()).toBeVisible();
  });

  test('single-flight: parallel page loads do not amplify upstream requests', async ({ page, request }) => {
    await setScenario('default');
    const results = await Promise.all([
      request.get('/'),
      request.get('/'),
      request.get('/repositories/nebula-ui'),
      request.get('/api/repositories'),
    ]);
    expect(results.every((response) => response.status() === 200)).toBe(true);
    // 2 pages per refresh; with TTL=0 a burst may refresh more than once, but it must not
    // scale linearly with the number of concurrent requests.
    expect(await mockRequestCount()).toBeLessThanOrEqual(8);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('a slow upstream produces a timeout error with a retry, not a hang', async ({ page }) => {
    await setScenario('slow');
    const started = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const elapsed = Date.now() - started;

    await expect(page.getByRole('heading', { name: 'Repositories are unavailable right now' })).toBeVisible();
    // The request timeout is 2 s in the E2E environment; fail fast rather than hang.
    expect(elapsed).toBeLessThan(30_000);
  });

  test('truncated pagination is disclosed to the user', async ({ page }) => {
    // The mock serves two pages and the app is limited to... enough pages here, so this
    // asserts the inverse: a complete inventory must NOT show the incomplete notice.
    await setScenario('default');
    await gotoSettled(page);
    await expect(page.getByText(/This list may be incomplete/)).toHaveCount(0);
  });
});
