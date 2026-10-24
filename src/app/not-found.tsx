import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-start py-24">
      <p className="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">This page does not exist</h1>
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-muted sm:text-base">
        The link may be out of date, or the repository may no longer be public or no longer eligible under this
        site’s inclusion rules.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        >
          Back to the repository index
        </Link>
      </div>
    </div>
  );
}
