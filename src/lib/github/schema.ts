import { z } from 'zod';

/**
 * The subset of the GitHub repository payload this site consumes.
 *
 * Deliberately narrow and tolerant: unknown fields are ignored (forward compatible),
 * absent optional fields stay `undefined` and are handled by the mapper.
 * A single entry failing validation must not take down the whole page.
 */
export const githubRepositorySchema = z.object({
  name: z.string().min(1).max(255),
  full_name: z.string().min(1).max(512).optional(),
  html_url: z.string().max(2048).optional(),
  description: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  topics: z.array(z.string().max(100)).max(100).optional(),
  stargazers_count: z.number().int().nonnegative().optional(),
  forks_count: z.number().int().nonnegative().optional(),
  archived: z.boolean().optional(),
  fork: z.boolean().optional(),
  disabled: z.boolean().optional(),
  private: z.boolean().optional(),
  homepage: z.string().nullable().optional(),
  created_at: z.string().max(64).optional(),
  updated_at: z.string().max(64).optional(),
  pushed_at: z.string().max(64).nullable().optional(),
  license: z
    .object({ spdx_id: z.string().nullable().optional() })
    .nullable()
    .optional(),
});

export type GitHubRepository = z.infer<typeof githubRepositorySchema>;

export type ParsePageResult = {
  readonly valid: GitHubRepository[];
  /** Entries that could not be parsed. Surfaced so a partial page is never presented as complete. */
  readonly invalidCount: number;
};

export function parseRepositoryPage(payload: unknown): ParsePageResult {
  if (!Array.isArray(payload)) {
    throw new Error('Expected an array of repositories');
  }

  const valid: GitHubRepository[] = [];
  let invalidCount = 0;

  for (const item of payload) {
    const parsed = githubRepositorySchema.safeParse(item);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      invalidCount += 1;
    }
  }

  if (valid.length === 0 && payload.length > 0) {
    throw new Error('No repository entry in the response matched the expected shape');
  }

  return { valid, invalidCount };
}
