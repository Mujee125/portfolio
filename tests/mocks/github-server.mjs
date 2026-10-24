/**
 * Dependency-free mock of the GitHub repository endpoint.
 *
 * Purpose: produce deterministic failure paths (rate limits, timeouts, malformed
 * payloads, empty accounts, mid-pagination additions) that the live API cannot be
 * asked to produce on demand. Scenario switching happens out-of-band through
 * `POST /__control/scenario`, so the app under test needs no test-only code.
 *
 * Usage: MOCK_PORT=4010 node tests/mocks/github-server.mjs
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const USER = process.env.MOCK_USERNAME ?? 'octocat';
const BASE = `http://127.0.0.1:${PORT}`;

function repo(name, overrides = {}) {
  return {
    name,
    full_name: `${USER}/${name}`,
    html_url: `https://github.com/${USER}/${name}`,
    description: `${name} — a deterministic fixture repository.`,
    language: 'TypeScript',
    topics: ['fixture', 'portfolio'],
    stargazers_count: 10,
    forks_count: 2,
    archived: false,
    fork: false,
    disabled: false,
    private: false,
    homepage: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-06-01T00:00:00Z',
    pushed_at: '2024-05-30T00:00:00Z',
    license: { spdx_id: 'MIT' },
    ...overrides,
  };
}

const PAGE_ONE = [
  repo('nebula-ui', { language: 'TypeScript', stargazers_count: 240, topics: ['react', 'design-system'] }),
  repo('rust-parser', { language: 'Rust', stargazers_count: 96, topics: ['parser', 'cli'] }),
  repo('a-fork', { fork: true, description: 'Forked fixture that must be hidden by default.' }),
];

const PAGE_TWO = [
  repo('legacy-tool', { archived: true, language: 'Go', stargazers_count: 4 }),
  repo('bare-repo', { description: null, language: null, topics: [], stargazers_count: 0 }),
];

const NEW_REPO = repo('freshly-created', { language: 'TypeScript', stargazers_count: 1, topics: ['new'] });

const SCENARIOS = {
  default: [PAGE_ONE, PAGE_TWO],
  single: [[...PAGE_ONE, ...PAGE_TWO]],
  empty: [[]],
  /** Adds a repository that did not exist before: proves discovery after the TTL. */
  'new-repo': [[...PAGE_ONE, NEW_REPO], PAGE_TWO],
  malformed: 'malformed',
  'rate-limited': 'rate-limited',
  'server-error': 'server-error',
  slow: 'slow',
};

let scenario = 'default';
let requestCount = 0;

function json(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'x-ratelimit-limit': '60',
    'x-ratelimit-remaining': String(Math.max(0, 60 - requestCount)),
    'x-ratelimit-used': String(requestCount),
    'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
    ...headers,
  });
  res.end(payload);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', BASE);

  if (url.pathname === '/__control/scenario' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const next = JSON.parse(body || '{}').scenario;
      if (!(next in SCENARIOS)) {
        json(res, 400, { error: `unknown scenario: ${String(next)}` });
        return;
      }
      scenario = next;
      requestCount = 0;
      json(res, 200, { ok: true, scenario });
    });
    return;
  }

  if (url.pathname === '/__control/state') {
    json(res, 200, { scenario, requestCount });
    return;
  }

  const match = /^\/users\/([^/]+)\/repos$/.exec(url.pathname);
  if (!match) {
    json(res, 404, { message: 'Not Found' });
    return;
  }
  if (match[1] !== USER) {
    json(res, 404, { message: 'Not Found' });
    return;
  }

  requestCount += 1;
  const behaviour = SCENARIOS[scenario];

  if (behaviour === 'malformed') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ unexpected: 'object instead of array' }));
    return;
  }

  if (behaviour === 'rate-limited') {
    res.writeHead(403, {
      'content-type': 'application/json',
      'x-ratelimit-limit': '60',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 900),
    });
    res.end(JSON.stringify({ message: 'API rate limit exceeded for 127.0.0.1.' }));
    return;
  }

  if (behaviour === 'server-error') {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'Service Unavailable' }));
    return;
  }

  if (behaviour === 'slow') {
    setTimeout(() => json(res, 200, PAGE_ONE), 20_000);
    return;
  }

  const page = Number(url.searchParams.get('page') ?? '1');
  const pages = Array.isArray(behaviour) ? behaviour : [PAGE_ONE, PAGE_TWO];
  const body = pages[page - 1] ?? [];

  const headers = {};
  if (page < pages.length) {
    headers.link = `<${BASE}/users/${USER}/repos?per_page=100&type=owner&page=${page + 1}>; rel="next", <${BASE}/users/${USER}/repos?per_page=100&type=owner&page=${pages.length}>; rel="last"`;
  }
  json(res, 200, body, headers);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`mock-github listening on ${BASE} (scenario: ${scenario})\n`);
});
