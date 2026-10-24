import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRightIcon, DocumentIcon, GitHubIcon, MailIcon } from '@/components/ui/icons';
import type { AppConfig } from '@/lib/config';

const primaryCta =
  'inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] motion-reduce:hover:transform-none';

const secondaryCta =
  'inline-flex items-center justify-center gap-2 rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]';

export function Hero({ config, stats }: { config: AppConfig; stats: ReactNode }) {
  const { profile } = config;

  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden border-b border-line">
      <div aria-hidden="true" className="blueprint pointer-events-none absolute inset-0 -z-10" />

      <div className="container-page grid gap-12 py-14 sm:py-18 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-16 lg:py-24">
        <div className="animate-rise">
          <p className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-ink-muted uppercase">
            <span aria-hidden="true" className="pulse-dot size-1.5 rounded-full bg-teal" />
            Public repository index
          </p>

          <h1
            id="hero-heading"
            className="mt-5 text-[clamp(2.5rem,7vw,4.25rem)] leading-[0.95] font-semibold tracking-[-0.035em]"
          >
            {profile.displayName}
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-muted sm:text-xl">{profile.headline}</p>

          {profile.bio ? (
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-muted sm:text-base">{profile.bio}</p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/#work" className={primaryCta}>
              Browse repositories
              <ArrowRightIcon width={15} height={15} />
            </Link>
            <a href={profile.links.github} target="_blank" rel="noopener noreferrer me" className={secondaryCta}>
              <GitHubIcon width={15} height={15} />
              GitHub profile
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            {profile.links.resume ? (
              <a href={profile.links.resume} target="_blank" rel="noopener noreferrer" className={secondaryCta}>
                <DocumentIcon width={15} height={15} />
                Résumé
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
            {profile.links.email ? (
              <a href={`mailto:${profile.links.email}`} className={secondaryCta}>
                <MailIcon width={15} height={15} />
                Email
              </a>
            ) : null}
          </div>

          <p className="mt-8 font-mono text-xs text-ink-muted">
            github.com/{profile.username}
            {profile.location ? <span className="text-line-strong"> · </span> : null}
            {profile.location ? profile.location : null}
          </p>
        </div>

        <div className="animate-rise lg:justify-self-end lg:w-full lg:max-w-md">{stats}</div>
      </div>
    </section>
  );
}
