import { Suspense } from 'react';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { Hero } from '@/components/hero/Hero';
import { RepoListSkeleton } from '@/components/repo/RepoListSkeleton';
import { FeaturedSection, FeaturedSectionSkeleton } from '@/features/repositories/FeaturedSection';
import { RepositorySection } from '@/features/repositories/RepositorySection';
import { StatsPanel, StatsPanelSkeleton } from '@/features/repositories/StatsPanel';
import { AboutSection } from '@/features/profile/AboutSection';
import { getConfig } from '@/lib/config';
import { parseRepositoryQuery, type RawSearchParams } from '@/lib/repos/params';

/**
 * Rendered per request on purpose: a prerendered page would freeze the repository
 * list at build time, which would defeat the "new repositories appear by themselves"
 * requirement (ADR-0004). Cost is absorbed by the inventory cache.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const query = parseRepositoryQuery(params);
  const config = getConfig();

  return (
    <>
      <Hero
        config={config}
        stats={
          <Suspense fallback={<StatsPanelSkeleton />}>
            <StatsPanel />
          </Suspense>
        }
      />

      <Suspense fallback={<FeaturedSectionSkeleton />}>
        <FeaturedSection />
      </Suspense>

      <section id="work" aria-labelledby="work-heading" className="container-page scroll-mt-24 pt-14 sm:pt-16">
        <SectionHeading
          id="work-heading"
          eyebrow="Repository index"
          title="Every eligible public repository"
          description="Fetched from the GitHub REST API, filtered and sorted on the server. Filters live in the URL, so any view can be bookmarked or shared."
        />

        <div className="mt-6">
          <Suspense fallback={<RepoListSkeleton />}>
            <RepositorySection query={query} />
          </Suspense>
        </div>
      </section>

      <AboutSection config={config} />
    </>
  );
}
