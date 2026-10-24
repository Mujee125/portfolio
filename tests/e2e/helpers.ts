import { expect, type Page } from '@playwright/test';

export const MOCK_CONTROL = 'http://127.0.0.1:4010/__control';

export type Scenario =
  | 'default'
  | 'single'
  | 'empty'
  | 'new-repo'
  | 'malformed'
  | 'rate-limited'
  | 'server-error'
  | 'slow';

/** Switches the mock GitHub scenario between tests (no app restart needed). */
export async function setScenario(scenario: Scenario): Promise<void> {
  const response = await fetch(`${MOCK_CONTROL}/scenario`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scenario }),
  });
  expect(response.ok).toBe(true);
}

export async function mockRequestCount(): Promise<number> {
  const response = await fetch(`${MOCK_CONTROL}/state`);
  const state = (await response.json()) as { requestCount: number };
  return state.requestCount;
}

/** Collects CSP violations and other console errors so a test can assert there were none. */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

/**
 * Navigates and waits for the rendered document to be usable.
 *
 * `networkidle` is deliberately avoided: Next.js keeps background RSC prefetches in
 * flight, so "no network for 500 ms" is not a stable signal. The content under test is
 * server-rendered, so `domcontentloaded` plus the main landmark is both faster and
 * deterministic.
 */
export async function gotoSettled(page: Page, path = '/'): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.getByRole('main').waitFor({ state: 'attached' });
  // `ClientReady` sets this once the interactive islands are hydrated, so tests that
  // type or click can never race hydration.
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' });
  // Coarse marker is necessary but not sufficient: the filter island is a separate client
  // chunk and can hydrate later, discarding keystrokes typed in between. When the form is
  // on the page, wait for its own readiness marker before tests type into it.
  const filterForm = page.locator('form[aria-label="Filter repositories"]');
  if ((await filterForm.count()) > 0) {
    await page
      .locator('form[aria-label="Filter repositories"][data-hydrated="true"]')
      .waitFor({ state: 'attached' });
  }
}
