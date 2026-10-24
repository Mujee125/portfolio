import Link from 'next/link';
import { GitHubIcon } from '@/components/ui/icons';
import type { AppConfig } from '@/lib/config';
import { relativeFromSeconds } from '@/lib/format';

export function SiteFooter({
  config,
  cacheAgeSeconds,
}: {
  config: AppConfig;
  cacheAgeSeconds: number | null;
}) {
  const refreshMinutes = Math.max(1, Math.round(config.repos.cacheTtlSeconds / 60));
  const cadence = `at most every ${refreshMinutes} ${refreshMinutes === 1 ? 'minute' : 'minutes'}`;

  return (
    <footer className="mt-24 border-t border-line bg-surface/60">
      <div className="container-page flex flex-col gap-4 py-10 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-ink">{config.site.name}</p>
          <p>
            Repository data comes from the{' '}
            <a
              href="https://docs.github.com/en/rest"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-line-strong underline-offset-2 hover:text-ink"
            >
              GitHub REST API
            </a>{' '}
            {`and is re-read ${cadence}.`}
            {cacheAgeSeconds !== null ? ` Last snapshot ${relativeFromSeconds(cacheAgeSeconds)}.` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/api/repositories" className="hover:text-ink">
            JSON API
          </Link>
          <Link href="/api/health" className="hover:text-ink">
            Health
          </Link>
          <a
            href={config.profile.links.github}
            target="_blank"
            rel="noopener noreferrer me"
            className="inline-flex items-center gap-1.5 hover:text-ink"
          >
            <GitHubIcon width={14} height={14} />
            github.com/{config.profile.username}
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
