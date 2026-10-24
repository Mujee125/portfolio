export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {description ? <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:text-base">{description}</p> : null}
    </div>
  );
}
