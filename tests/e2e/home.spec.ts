import { expect, test } from '@playwright/test';
import { gotoSettled, setScenario, watchConsole } from './helpers';

test.beforeEach(async () => {
  await setScenario('default');
});

test.describe('home page', () => {
  test('renders the hero, live statistics and the repository inventory', async ({ page }) => {
    await gotoSettled(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('octocat');
    await expect(page.getByRole('link', { name: /Browse repositories/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /GitHub profile/ })).toHaveAttribute(
      'href',
      'https://github.com/octocat',
    );

    // Statistics are derived from the inventory: 4 eligible repositories (the fork is excluded).
    await expect(page.getByText('Live from GitHub')).toBeVisible();
    await expect(page.getByText('Public repositories')).toBeVisible();
    await expect(page.locator('dd').first()).toHaveText('4');

    // Every eligible repository is listed, the fork is not.
    const grid = page.locator('ul[aria-label="Repositories"] > li');
    await expect(grid).toHaveCount(4);
    await expect(page.getByRole('heading', { name: 'a-fork' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'legacy-tool' }).first()).toBeVisible();
  });

  test('badges archived repositories instead of hiding their status', async ({ page }) => {
    await gotoSettled(page);
    const archived = page.getByRole('article').filter({ hasText: 'legacy-tool' });
    await expect(archived.getByText('Archived')).toBeVisible();
  });

  test('links every card to its detail page and to GitHub', async ({ page }) => {
    await gotoSettled(page);
    const firstCard = page.locator('ul[aria-label="Repositories"] > li').first();
    await expect(firstCard.getByRole('link').first()).toHaveAttribute('href', /^\/repositories\//);
    await expect(firstCard.getByRole('link', { name: /Repository/ })).toHaveAttribute('target', '_blank');
    await expect(firstCard.getByRole('link', { name: /Repository/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });

  test('exposes SEO metadata, canonical URL and social preview tags', async ({ page }) => {
    await gotoSettled(page);
    await expect(page).toHaveTitle(/octocat · Test Portfolio/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'http://127.0.0.1:3100');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /octocat/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('serves robots.txt and a sitemap that lists repository detail URLs', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain('Sitemap: http://127.0.0.1:3100/sitemap.xml');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    expect(xml).toContain('/repositories/nebula-ui');
    expect(xml).toContain('/repositories/legacy-tool');
  });

  test('generates a social preview image', async ({ request }) => {
    const image = await request.get('/opengraph-image');
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/png');
  });

  test('produces no console errors or CSP violations', async ({ page }) => {
    const problems = watchConsole(page);
    await gotoSettled(page);
    await page.waitForTimeout(500);
    expect(problems).toEqual([]);
  });
});

test.describe('empty inventory', () => {
  test('explains the situation instead of showing a bare page', async ({ page }) => {
    await setScenario('empty');
    await gotoSettled(page);
    await expect(page.getByRole('heading', { name: 'No eligible public repositories yet' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'github.com/octocat' }).first()).toBeVisible();
  });
});
