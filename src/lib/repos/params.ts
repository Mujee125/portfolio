import { z } from 'zod';
import { DEFAULT_QUERY, SORT_OPTIONS, type RepositoryQuery, type SortOption } from './query';

export { toSearchString } from './query';

/**
 * URL query parsing for the repository index.
 *
 * Unknown or malformed values fall back to defaults rather than erroring: a
 * shared link with a stale filter should still render the site. This is also the
 * single place where user input is validated before it influences rendering.
 */
const searchParamsSchema = z.object({
  q: z.string().max(100).optional(),
  language: z.string().max(50).optional(),
  topic: z.string().max(50).optional(),
  sort: z.enum(SORT_OPTIONS).optional(),
});

export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function parseRepositoryQuery(params: RawSearchParams): RepositoryQuery {
  const flat: Record<string, string | undefined> = {};
  for (const key of ['q', 'language', 'topic', 'sort'] as const) {
    const value = firstValue(params[key]);
    if (value !== undefined) flat[key] = value;
  }

  const parsed = searchParamsSchema.safeParse(flat);
  if (!parsed.success) return DEFAULT_QUERY;

  const clean = (value: string | undefined): string | null => {
    if (value === undefined) return null;
    const trimmed = value.trim().replace(/\s+/g, ' ');
    return trimmed === '' ? null : trimmed;
  };

  const sort = parsed.data.sort;

  return {
    q: clean(parsed.data.q) ?? '',
    language: clean(parsed.data.language),
    topic: clean(parsed.data.topic),
    sort: sort !== undefined && SORT_OPTIONS.includes(sort) ? sort : DEFAULT_QUERY.sort,
  };
}

/** Strict parsing for the JSON API: invalid input is a client error, not a silent default. */
export const apiQuerySchema = z.object({
  q: z
    .string()
    .max(100, 'must be at most 100 characters')
    .optional()
    .transform((value) => value?.trim() ?? ''),
  language: z.string().max(50, 'must be at most 50 characters').optional(),
  topic: z.string().max(50, 'must be at most 50 characters').optional(),
  sort: z.enum(SORT_OPTIONS).default('updated'),
  includeArchived: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type ApiQuery = z.infer<typeof apiQuerySchema>;

export function toApiQuery(query: RepositoryQuery): ApiQuery & { sort: SortOption } {
  return {
    q: query.q,
    ...(query.language === null ? {} : { language: query.language }),
    ...(query.topic === null ? {} : { topic: query.topic }),
    sort: query.sort,
    includeArchived: true,
  };
}
