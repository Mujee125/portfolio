import type { Repository } from '@/lib/github/types';
import { RepoCard } from './RepoCard';

export function RepoGrid({ repos, nowMs, label }: { repos: readonly Repository[]; nowMs: number; label: string }) {
  return (
    <ul aria-label={label} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {repos.map((repo) => (
        <li key={repo.fullName} className="h-full">
          <RepoCard repo={repo} nowMs={nowMs} />
        </li>
      ))}
    </ul>
  );
}
