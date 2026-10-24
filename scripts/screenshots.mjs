#!/usr/bin/env node
/**
 * Regenerates the documentation screenshots from a running deployment.
 *
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/screenshots.mjs [outputDir]
 * Requires a production build (npm run build && npm start) for representative output.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const outDir = process.argv[2] ?? 'docs/screenshots';
const repoPath = process.env.SCREENSHOT_REPO_PATH ?? null;

await mkdir(outDir, { recursive: true });

const shots = [
  { name: 'home-light', path: '/', viewport: { width: 1440, height: 1000 }, scheme: 'light', fullPage: true },
  { name: 'home-dark', path: '/', viewport: { width: 1440, height: 1000 }, scheme: 'dark', fullPage: true },
  { name: 'home-mobile', path: '/', viewport: { width: 390, height: 844 }, scheme: 'light', fullPage: true },
  ...(repoPath
    ? [{ name: 'repository-detail', path: repoPath, viewport: { width: 1440, height: 1000 }, scheme: 'light', fullPage: true }]
    : []),
];

const browser = await chromium.launch();
for (const shot of shots) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    colorScheme: shot.scheme,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}${shot.path}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('main').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/${shot.name}.png`, fullPage: shot.fullPage });
  console.log(`✔ ${outDir}/${shot.name}.png`);
  await context.close();
}
await browser.close();
