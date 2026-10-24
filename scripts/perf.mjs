#!/usr/bin/env node
/**
 * Lab measurement of Core Web Vitals against a running production build.
 *
 * Conditions (documented, reproducible): Chromium, mobile viewport 412×915, 4× CPU
 * throttling, "Slow 4G" network (1.6 Mbit/s down, 750 kbit/s up, 150 ms RTT), cold
 * cache per run. That profile is stricter than the field p75 these targets refer to,
 * so the numbers reported are a worst-case bound rather than a marketing claim.
 *
 * Usage: PORT=3000 node scripts/perf.mjs [url]
 */
import { chromium, devices } from '@playwright/test';

const PORT = process.env.PORT ?? '3000';
const target = process.argv[2] ?? `http://127.0.0.1:${PORT}/`;
const TARGETS = { lcpMs: 2500, cls: 0.1, ttfbMs: 800 };

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'] });
const page = await context.newPage();

await page.addInitScript(() => {
  window.__vitals = { lcp: 0, cls: 0, longTasks: 0 };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__vitals.lcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) window.__vitals.cls += entry.value;
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    window.__vitals.longTasks += list.getEntries().length;
  }).observe({ type: 'longtask', buffered: true });
});

const client = await context.newCDPSession(page);
await client.send('Network.enable');
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});
await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

const started = Date.now();
await page.goto(target, { waitUntil: 'load' });
const loadMs = Date.now() - started;

// Interaction probe (INP proxy): activate the theme control and time the paint update.
const interaction = await page.evaluate(async () => {
  const radio = document.querySelector('input[value="dark"]');
  const start = performance.now();
  radio?.click();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return performance.now() - start;
});

await page.waitForTimeout(1500);
const vitals = await page.evaluate(() => ({
  ...window.__vitals,
  ttfb: performance.getEntriesByType('navigation')[0]?.responseStart ?? 0,
  domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? 0,
  transferred: performance
    .getEntriesByType('resource')
    .reduce((total, entry) => total + (entry.transferSize ?? 0), 0),
  requests: performance.getEntriesByType('resource').length,
}));

await browser.close();

const report = {
  url: target,
  conditions: 'Chromium headless, Pixel 7 viewport, 4x CPU throttle, Slow 4G (1.6/0.75 Mbit/s, 150 ms RTT), cold cache',
  measured: {
    lcpMs: Math.round(vitals.lcp),
    cls: Number(vitals.cls.toFixed(4)),
    ttfbMs: Math.round(vitals.ttfb),
    loadMs,
    interactionMs: Math.round(interaction),
    longTasks: vitals.longTasks,
    requests: vitals.requests,
    transferredKb: Math.round(vitals.transferred / 1024),
  },
  targets: TARGETS,
};

report.withinTargets = {
  lcp: report.measured.lcpMs <= TARGETS.lcpMs,
  cls: report.measured.cls <= TARGETS.cls,
  ttfb: report.measured.ttfbMs <= TARGETS.ttfbMs,
};

console.log(JSON.stringify(report, null, 2));
const failed = Object.entries(report.withinTargets).filter(([, ok]) => !ok);
console.log(
  failed.length === 0
    ? '\n✔ All measured vitals are within the documented targets under the stated conditions.'
    : `\n✖ Outside target: ${failed.map(([key]) => key).join(', ')}`,
);
process.exit(failed.length === 0 ? 0 : 1);
