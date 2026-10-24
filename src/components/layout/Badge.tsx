import type { ReactNode } from 'react';

const TONES = {
  neutral: 'border-line bg-surface-2 text-ink-muted',
  accent: 'border-transparent bg-accent-soft text-accent',
  outline: 'border-line-strong text-ink-muted',
} as const;

export function Badge({
  children,
  tone = 'neutral',
  icon = false,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  icon?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}
    >
      {icon ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
