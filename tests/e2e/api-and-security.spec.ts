import { expect, test } from '@playwright/test';
import { gotoSettled, setScenario } from './helpers';

test.beforeEach(async () => {
  await setScenario('default');
});

test.describe('security headers', () => {
  test('sends a nonce-based CSP and the hardened header set on HTML routes', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();

    const csp = headers['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('uses a fresh nonce per request', async ({ request }) => {
    const first = (await request.get('/')).headers()['content-security-policy'] ?? '';
    const second = (await request.get('/')).headers()['content-security-policy'] ?? '';
    const nonce = (value: string) => /'nonce-([a-f0-9]+)'/.exec(value)?.[1];
    expect(nonce(first)).toBeTruthy();
    expect(nonce(first)).not.toBe(nonce(second));
  });

  test('the app still hydrates under the CSP (theme control is interactive)', async ({ page }) => {
    await gotoSettled(page);
    await page.getByRole('radio', { name: 'Dark theme' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('published JSON API', () => {
  test('returns the inventory with explicit metadata', async ({ request }) => {
    const response = await request.get('/api/repositories');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['cache-control']).toContain('s-maxage');

    const body = await response.json();
    expect(body.meta).toMatchObject({ username: 'octocat', stale: false, truncated: false });
    expect(body.meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data).toHaveLength(4);
    expect(body.data[0]).toHaveProperty('url');
    expect(body.data.map((repo: { name: string }) => repo.name)).not.toContain('a-fork');
  });

  test('applies the same filters as the UI', async ({ request }) => {
    const response = await request.get('/api/repositories?q=rust&sort=stars');
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.meta.totalMatched).toBe(1);
  });

  test('rejects invalid query parameters with a structured 400', async ({ request }) => {
    const badSort = await request.get('/api/repositories?sort=bogus');
    expect(badSort.status()).toBe(400);
    const body = await badSort.json();
    expect(body.error.code).toBe('invalid_query');
    expect(body.error.details[0].field).toBe('sort');

    const tooLong = await request.get(`/api/repositories?q=${'x'.repeat(101)}`);
    expect(tooLong.status()).toBe(400);
  });

  test('excludes archived repositories when asked', async ({ request }) => {
    const response = await request.get('/api/repositories?includeArchived=false');
    const body = await response.json();
    expect(body.data.map((repo: { name: string }) => repo.name)).not.toContain('legacy-tool');
  });

  test('health endpoint reports state without secrets', async ({ request }) => {
    await request.get('/api/repositories'); // warm the snapshot
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');

    const body = await response.json();
    expect(['ok', 'degraded']).toContain(body.status);
    expect(body.checks).toHaveProperty('cache');
    expect(body.upstream).toMatchObject({ username: 'octocat', authenticated: false });
    expect(JSON.stringify(body)).not.toMatch(/token/i);
  });
});

test.describe('failure transparency through the API', () => {
  test('reports a rate limit as 503 with a retry time', async ({ request }) => {
    await setScenario('rate-limited');
    const response = await request.get('/api/repositories');
    expect(response.status()).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe('github_rate_limited');
    expect(response.headers()['retry-after']).toBeDefined();
  });

  test('reports a malformed upstream payload as 502, not an empty list', async ({ request }) => {
    await setScenario('malformed');
    const response = await request.get('/api/repositories');
    expect(response.status()).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe('github_unavailable');
    expect(body.data).toBeUndefined();
  });
});
