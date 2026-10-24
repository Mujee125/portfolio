import { expect, test } from '@playwright/test';
import { gotoSettled, setScenario } from './helpers';

test.beforeEach(async () => {
  await setScenario('default');
});

test.describe('search, filters and sorting', () => {
  test('filters by search term and keeps the term in the URL', async ({ page }) => {
    await gotoSettled(page);
    await page.getByLabel('Search', { exact: true }).fill('rust');
    await expect(page).toHaveURL(/\?q=rust/);
    const grid = page.locator('ul[aria-label="Repositories"] > li');
    await expect(grid).toHaveCount(1);
    await expect(grid.getByRole('heading', { name: 'rust-parser' })).toBeVisible();
  });

  test('restores state from the URL on a fresh load (shareable links)', async ({ page }) => {
    await gotoSettled(page, '/?language=Rust');
    await expect(page.getByLabel('Language', { exact: true })).toHaveValue('Rust');
    await expect(page.locator('ul[aria-label="Repositories"] > li')).toHaveCount(1);
  });

  test('filters by language and topic', async ({ page }) => {
    await gotoSettled(page);
    await page.getByLabel('Language', { exact: true }).selectOption('Go');
    await expect(page).toHaveURL(/language=Go/);
    await expect(page.locator('ul[aria-label="Repositories"] > li')).toHaveCount(1);

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page).toHaveURL('http://127.0.0.1:3100/');
    await page.getByLabel('Topic', { exact: true }).selectOption('cli');
    await expect(page).toHaveURL(/topic=cli/);
    await expect(page.getByRole('heading', { name: 'rust-parser' }).first()).toBeVisible();
  });

  test('sorts by stars, name and recency', async ({ page }) => {
    await gotoSettled(page);
    await page.getByLabel('Sort by', { exact: true }).selectOption('stars');
    await expect(page).toHaveURL(/sort=stars/);
    const headings = page.locator('ul[aria-label="Repositories"] > li h3');
    await expect(headings.first()).toHaveText('nebula-ui');

    await page.getByLabel('Sort by', { exact: true }).selectOption('name');
    await expect(headings.first()).toHaveText('bare-repo');

    await page.getByLabel('Sort by', { exact: true }).selectOption('updated');
    await expect(page).toHaveURL('http://127.0.0.1:3100/');
  });

  test('shows a helpful empty state for a search with no matches', async ({ page }) => {
    await gotoSettled(page, '/?q=zzzz');
    await expect(page.getByRole('heading', { name: 'No repositories match those filters' })).toBeVisible();
    await page.getByRole('link', { name: 'Clear all filters' }).click();
    await expect(page).toHaveURL('http://127.0.0.1:3100/');
  });

  test('falls back to defaults for a malformed URL instead of failing', async ({ page }) => {
    await gotoSettled(page, '/?sort=%3Cscript%3E&language=');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('ul[aria-label="Repositories"] > li')).toHaveCount(4);
  });

  test('works without JavaScript (progressive enhancement)', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/?language=Rust', { waitUntil: 'load' });
    await expect(page.locator('ul[aria-label="Repositories"] > li')).toHaveCount(1);
    await context.close();
  });
});

test.describe('repository detail page', () => {
  test('navigates from a card to the detail page and back', async ({ page }) => {
    await gotoSettled(page);
    // Two grids show this repository (highlights + full index); open it from the index.
    await page
      .locator('ul[aria-label="Repositories"]')
      .getByRole('heading', { name: 'nebula-ui' })
      .getByRole('link')
      .click();

    await expect(page).toHaveURL(/\/repositories\/nebula-ui$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('nebula-ui');
    await expect(page.getByRole('link', { name: /View on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/octocat/nebula-ui',
    );
    await expect(page.getByText('Repository facts')).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'http://127.0.0.1:3100/repositories/nebula-ui',
    );

    await page.getByRole('link', { name: /All repositories/ }).click();
    await expect(page).toHaveURL(/\/#work$/);
  });

  test('returns 404 for a repository that is not eligible', async ({ page }) => {
    const response = await page.goto('/repositories/a-fork', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'This page does not exist' })).toBeVisible();
  });

  test('returns 404 for a nonsense path', async ({ page }) => {
    const response = await page.goto('/repositories/%2E%2E%2Fetc%2Fpasswd', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(404);
  });
});
