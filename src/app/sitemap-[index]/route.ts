import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { getRepositoryInventory } from '@/lib/github';
import type { Repository } from '@/lib/github/types';

export const dynamic = 'force-dynamic';

/**
 * Paginated sitemap for large portfolios.
 *
 * Route: /sitemap-[index].xml
 * Generates XML sitemap for a subset of repositories.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ index?: string }> },
) {
  const { index } = await context.params;
  const pageIndex = Number(index);
  const config = getConfig();
  const { inventory } = await getRepositoryInventory();

  if (!inventory) {
    return new Response('Inventory unavailable', { status: 503 });
  }

  const start = pageIndex * config.sitemap.maxUrls;
  const end = start + config.sitemap.maxUrls;
  const repos = inventory.repos.slice(start, end);

  if (repos.length === 0) {
    return new Response('Invalid sitemap index', { status: 404 });
  }

  const xml = generateSitemapXml(config, repos, inventory.generatedAt);

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
    },
  });
}

function generateSitemapXml(
  config: ReturnType<typeof getConfig>,
  repos: readonly Repository[],
  generatedAt: Date,
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const repo of repos) {
    const lastMod = repo.pushedAt ?? repo.updatedAt ?? generatedAt.toISOString();
    lines.push(
      `  <url>
    <loc>${config.site.url}/repositories/${encodeURIComponent(repo.name)}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`,
    );
  }

  lines.push('</urlset>');
  return lines.join('\n');
}
