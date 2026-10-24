#!/usr/bin/env node
/**
 * Architectural and security boundary checks.
 *
 * These are the invariants that a code review can miss and a compiler cannot see:
 *  - no HTML injection primitives anywhere in application code;
 *  - no server-only module pulled into a client bundle;
 *  - no secrets committed;
 *  - environment access confined to the configuration module.
 *
 * Exits non-zero on the first category of violation so CI fails loudly.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const violations = [];
function fail(rule, file, detail) {
  violations.push(`${rule}: ${relative(ROOT, file)} — ${detail}`);
}

const files = await listFiles(SRC);

// 1. No HTML injection primitives.
const HTML_SINKS = [/dangerouslySetInnerHTML/, /\.innerHTML\s*=/, /document\.write\(/, /\beval\(/, /new Function\(/];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const sink of HTML_SINKS) {
    if (sink.test(source)) fail('html-sink', file, `matches ${sink}`);
  }
}

// 2. Client components must not import server-only modules.
const SERVER_ONLY = ['@/lib/config', '@/lib/github', '@/lib/log', '@/lib/repos/params'];
/** Type-only imports are erased at build time and cannot pull runtime code into a bundle. */
function runtimeImports(source) {
  return source
    .split('\n')
    .filter((line) => line.trimStart().startsWith('import') && !line.trimStart().startsWith('import type'))
    .join('\n');
}
for (const file of files) {
  const source = await readFile(file, 'utf8');
  if (!/^['"]use client['"]/m.test(source)) continue;
  const runtime = runtimeImports(source);
  for (const moduleName of SERVER_ONLY) {
    if (new RegExp(`from ['"]${moduleName}(/|['"])`).test(runtime)) {
      fail('server-import-in-client', file, `imports ${moduleName}`);
    }
  }
}

// 3. Presentational components must stay presentational (no data access layer).
for (const file of files.filter((f) => f.includes('/src/components/'))) {
  const source = await readFile(file, 'utf8');
  const runtime = runtimeImports(source);
  // `@/lib/github/types` is a declaration-only module: importing it adds no code.
  if (/from ['"]@\/lib\/github(?!\/types)['"]/.test(runtime)) {
    fail('component-data-access', file, 'imports the GitHub data layer at runtime');
  }
}

// 4. Environment access is confined to the configuration module (plus NODE_ENV in proxy).
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const uses = source.match(/process\.env\.[A-Z0-9_]+/g) ?? [];
  const allowed = file.endsWith('lib/config.ts') || file.endsWith('proxy.ts');
  for (const use of uses) {
    if (!allowed && use !== 'process.env.NODE_ENV') fail('env-access', file, use);
  }
}

// 5. No credential-shaped strings in the source tree.
const SECRET_PATTERNS = [/gh[pousr]_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(source)) fail('secret', file, `looks like a committed credential`);
  }
}

// 6. Environment files must not be tracked by git.
try {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  for (const file of tracked) {
    if (/^\.env(\.|$)/.test(file) && file !== '.env.example') fail('tracked-env-file', join(ROOT, file), 'must not be committed');
  }
} catch {
  console.warn('check-boundaries: git not available, skipping tracked-file check');
}

if (violations.length > 0) {
  console.error(`✖ Boundary check failed with ${violations.length} violation(s):\n`);
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

console.log(`✔ Boundary check passed (${files.length} source files: no HTML sinks, no server imports in client code, no secrets, no stray env access).`);
