import { GitHubIcon, MailIcon, DocumentIcon, ExternalIcon } from '@/components/ui/icons';
import { SectionHeading } from '@/components/layout/SectionHeading';
import type { AppConfig } from '@/lib/config';

/**
 * Rendered only from real configuration. With no bio, location or links configured
 * this section (and its navigation entry) does not exist at all — no lorem ipsum,
 * no dead buttons.
 */
export function AboutSection({ config }: { config: AppConfig }) {
  const { profile } = config;
  const externalLinks = [
    profile.links.website ? { href: profile.links.website, label: 'Website', icon: ExternalIcon } : null,
    profile.links.linkedin ? { href: profile.links.linkedin, label: 'LinkedIn', icon: ExternalIcon } : null,
    profile.links.resume ? { href: profile.links.resume, label: 'Résumé', icon: DocumentIcon } : null,
    profile.links.email ? { href: `mailto:${profile.links.email}`, label: 'Email', icon: MailIcon } : null,
  ].filter((link): link is { href: string; label: string; icon: typeof ExternalIcon } => link !== null);

  if (!profile.bio && !profile.location && externalLinks.length === 0) return null;

  return (
    <section id="about" aria-labelledby="about-heading" className="container-page scroll-mt-24 pt-16">
      <SectionHeading id="about-heading" eyebrow="About" title={`About ${profile.displayName}`} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {profile.bio ? <p className="max-w-prose text-sm leading-relaxed text-ink-muted sm:text-base">{profile.bio}</p> : null}
          {profile.location ? (
            <p className="font-mono text-xs text-ink-muted">Based in {profile.location}</p>
          ) : null}
        </div>
        <ul className="flex flex-wrap gap-2 sm:gap-3 lg:justify-end">
          <li>
            <a
              href={profile.links.github}
              target="_blank"
              rel="noopener noreferrer me"
              className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              <GitHubIcon width={15} height={15} />
              github.com/{profile.username}
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
          {externalLinks.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                {...(link.href.startsWith('mailto:') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              >
                <link.icon width={15} height={15} />
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
