import type { MetadataRoute } from 'next';
import { getConfig } from '@/lib/config';
import { getRepositoryInventory } from '@/lib/github';

export const dynamic = 'force-dynamic';

/**
 * Generated from the live inventory so a newly created repository is discoverable
 * without a rebuild. When GitHub is unavailable the home page is still listed
 * rather than returning an error or an empty sitemap.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const config = getConfig();
  const { inventory } = await getRepositoryInventory();
  const lastModified = inventory?.generatedAt ?? new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${config.site.url}/`,
      lastModified,
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  if (inventory) {
    for (const repo of inventory.repos) {
      entries.push({
        url: `${config.site.url}/repositories/${encodeURIComponent(repo.name)}`,
        lastModified: repo.pushedAt ?? repo.updatedAt ?? inventory.generatedAt.toISOString(),
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }
  }

  return entries;
}
