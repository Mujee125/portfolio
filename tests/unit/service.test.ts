import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for a real, observed defect:
 *
 * Next.js emits several server bundles per process (pages, route handlers, proxy).
 * A module-level singleton is therefore duplicated per bundle, which produced two
 * independent caches in the running app: the page refreshed GitHub, and `/api/health`
 * still reported `cache: "empty"` for the very same process. The service is now kept
 * on `globalThis`, so every bundle shares one instance.
 */

const REQUIRED_ENV = {
  GITHUB_USERNAME: 'octocat',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('GITHUB_USERNAME', REQUIRED_ENV.GITHUB_USERNAME);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', REQUIRED_ENV.NEXT_PUBLIC_SITE_URL);
});

afterEach(async () => {
  const { resetInventoryService } = await import('@/lib/github');
  resetInventoryService();
  vi.unstubAllEnvs();
});

describe('inventory service singleton', () => {
  it('returns the same instance for repeated lookups', async () => {
    const { getInventoryService } = await import('@/lib/github');
    expect(getInventoryService()).toBe(getInventoryService());
  });

  it('shares one instance across separately evaluated bundles', async () => {
    const first = await import('@/lib/github');
    const instanceFromFirstBundle = first.getInventoryService();

    // Simulating a second bundle: the module is evaluated again from scratch, so any
    // module-level `let` would now be `null` and a second cache would be created.
    vi.resetModules();
    const second = await import('@/lib/github');
    expect(second.getInventoryService()).toBe(instanceFromFirstBundle);
  });

  it('creates a genuinely fresh instance after an explicit reset', async () => {
    const { getInventoryService, resetInventoryService } = await import('@/lib/github');
    const before = getInventoryService();
    resetInventoryService();
    const after = getInventoryService();
    expect(after).not.toBe(before);
  });

  it('does not leak the instance into unrelated globals', async () => {
    const { getInventoryService } = await import('@/lib/github');
    getInventoryService();
    const keys = Object.getOwnPropertySymbols(globalThis).map((symbol) => symbol.description);
    expect(keys).toContain('github-portfolio.inventory-service.v1');
  });
});
