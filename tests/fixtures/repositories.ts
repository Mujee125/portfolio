/** Fixture builders: realistic GitHub payloads, including hostile and incomplete ones. */

export type RawRepoOverrides = Partial<Record<string, unknown>>;

export function githubRepo(overrides: RawRepoOverrides = {}) {
  const name = (overrides.name as string | undefined) ?? 'example-repo';
  return {
    name,
    // Mirrors GitHub: full_name always follows the repository name.
    full_name: `octocat/${name}`,
    html_url: 'https://github.com/octocat/example-repo',
    description: 'An example repository used in tests.',
    language: 'TypeScript',
    topics: ['testing', 'portfolio'],
    stargazers_count: 42,
    forks_count: 7,
    archived: false,
    fork: false,
    disabled: false,
    private: false,
    homepage: 'https://example.com',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-06-01T12:00:00Z',
    pushed_at: '2024-05-30T09:30:00Z',
    license: { spdx_id: 'MIT' },
    ...overrides,
  };
}

export const FORK_REPO = githubRepo({
  name: 'a-fork',
  full_name: 'octocat/a-fork',
  fork: true,
  description: 'Forked from somewhere.',
});

export const ARCHIVED_REPO = githubRepo({
  name: 'archived-idea',
  full_name: 'octocat/archived-idea',
  archived: true,
  description: 'No longer maintained.',
});

export const HOSTILE_REPO = githubRepo({
  name: 'hostile',
  full_name: 'octocat/hostile',
  html_url: 'javascript:alert(document.cookie)',
  homepage: 'javascript:alert(1)',
  description: '<img src=x onerror="alert(1)"> <script>alert(2)</script>',
  topics: ['<script>', 'ok-topic', 'UPPER'],
});

export const MINIMAL_REPO = {
  name: 'bare-repo',
  description: null,
  language: null,
  stargazers_count: 0,
  forks_count: 0,
};

export const MULTI_PAGE_FIXTURE = {
  page1: [
    githubRepo({ name: 'alpha', full_name: 'octocat/alpha', stargazers_count: 5 }),
    githubRepo({ name: 'beta', full_name: 'octocat/beta', stargazers_count: 50, language: 'Rust' }),
    FORK_REPO,
  ],
  page2: [
    githubRepo({
      name: 'gamma',
      full_name: 'octocat/gamma',
      archived: true,
      stargazers_count: 1,
      language: 'Go',
      topics: ['cli'],
    }),
    githubRepo({ name: 'delta', full_name: 'octocat/delta', stargazers_count: 12, language: 'Rust' }),
  ],
  page3: [githubRepo({ name: 'epsilon', full_name: 'octocat/epsilon', stargazers_count: 3, language: null })],
};
