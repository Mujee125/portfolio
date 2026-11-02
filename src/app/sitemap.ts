import type { MetadataRoute } from 'next';
import { getConfig } from '@/lib/config';
import { getRepositoryInventory } from '@/lib/github';

export const dynamic = 'force-dynamic';

/**
 * Generated from the live inventory so a newly created repository is discoverable
 * without a rebuild. When GitHub is unavailable the home page is still listed
 * rather than returning an error or an empty sitemap.
 *
 * For large portfolios (>1000 repos), returns a sitemap index referencing
 * paginated sitemaps (ADR-0015).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const config = getConfig();
  const { inventory } = await getRepositoryInventory();
  const lastModified = inventory?.generatedAt ?? new Date();

  const totalRepos = inventory?.repos.length ?? 0;

  // Single sitemap for small portfolios (backwards compatible)
  if (!inventory || totalRepos <= config.sitemap.maxUrls) {
    return generateSingleSitemap(config, inventory, lastModified);
  }

  // Sitemap index for large portfolios
  return generateSitemapIndex(config, inventory, lastModified);
}

function generateSingleSitemap(
  config: ReturnType<typeof getConfig>,
  inventory: Awaited<ReturnType<typeof getRepositoryInventory>>['inventory'],
  lastModified: Date,
): MetadataRoute.Sitemap {
  if (!inventory) {
    return [
      {
        url: `${config.site.url}/`,
        lastModified,
        changeFrequency: 'daily',
        priority: 1,
      },
    ];
  }

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${config.site.url}/`,
      lastModified,
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  for (const repo of inventory.repos) {
    entries.push({
      url: `${config.site.url}/repositories/${encodeURIComponent(repo.name)}`,
      lastModified: repo.pushedAt ?? repo.updatedAt ?? inventory.generatedAt.toISOString(),
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  return entries;
}

function generateSitemapIndex(
  config: ReturnType<typeof getConfig>,
  inventory: Awaited<ReturnType<typeof getRepositoryInventory>>['inventory'],
  lastModified: Date,
): MetadataRoute.Sitemap {
  if (!inventory) {
    return [];
  }

  const totalPages = Math.ceil(inventory.repos.length / config.sitemap.maxUrls);
  const entries: MetadataRoute.Sitemap = [];

  // Add sitemap index entry for each paginated sitemap
  for (let i = 0; i < totalPages; i++) {
    entries.push({
      url: `${config.site.url}/sitemap-${i}.xml`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.8,
    });
  }

  return entries;
}
