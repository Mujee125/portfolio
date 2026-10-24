/**
 * `link` header parsing.
 *
 * GitHub's documentation is explicit: follow `link: rel="next"` and never build
 * pagination URLs by hand. A `link` value is still an external input, so every URL
 * is re-validated against the configured API origin before it is fetched
 * (defence against a malicious or hijacked redirect pointing at another host).
 */

export type LinkRelations = Record<string, string>;

export function parseLinkHeader(header: string | null | undefined): LinkRelations {
  const relations: LinkRelations = {};
  if (!header) return relations;

  for (const part of header.split(',')) {
    const match = /<([^>]+)>\s*;\s*(.+)$/.exec(part.trim());
    if (!match) continue;
    const url = match[1];
    const params = match[2];
    if (!url || !params) continue;
    const relMatch = /rel\s*=\s*"?([^";]+)"?/.exec(params);
    const rel = relMatch?.[1]?.trim().toLowerCase();
    if (!rel) continue;
    for (const token of rel.split(/\s+/)) {
      if (token && relations[token] === undefined) relations[token] = url;
    }
  }

  return relations;
}

export function isAllowedApiUrl(candidate: string, allowedOrigin: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.username !== '' || url.password !== '') return false;

  let allowed: URL;
  try {
    allowed = new URL(allowedOrigin);
  } catch {
    return false;
  }

  if (url.protocol !== allowed.protocol) return false;
  if (url.host !== allowed.host) return false;

  const basePath = allowed.pathname.replace(/\/+$/, '');
  return basePath === '' || url.pathname === basePath || url.pathname.startsWith(`${basePath}/`);
}

/**
 * Returns the validated `next` URL, `null` when pagination is finished, and throws
 * for a `next` link that points outside the configured API origin.
 */
export function nextPageUrl(header: string | null | undefined, allowedOrigin: string): string | null {
  const next = parseLinkHeader(header).next;
  if (next === undefined) return null;
  if (!isAllowedApiUrl(next, allowedOrigin)) {
    throw new Error(`Refusing to follow a pagination link outside the GitHub API origin: ${safeHost(next)}`);
  }
  return next;
}

function safeHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return '<unparseable>';
  }
}
