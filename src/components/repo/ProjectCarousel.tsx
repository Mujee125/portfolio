'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Repository } from '@/lib/github/types';
import { languageColour, relativeTime } from '@/lib/format';
import { StarIcon, ForkIcon, GitHubIcon } from '@/components/ui/icons';

interface ProjectCarouselProps {
  repos: Repository[];
  nowMs: number;
}

export function ProjectCarousel({ repos, nowMs }: ProjectCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  if (repos.length === 0) return null;

  const currentRepo = repos[currentIndex];
  if (!currentRepo) return null;

  const next = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % repos.length);
  };

  const prev = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + repos.length) % repos.length);
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
      scale: 0.8,
      rotateY: direction > 0 ? 45 : -45,
      zIndex: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      rotateY: 0,
      zIndex: 10,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 1000 : -1000,
      opacity: 0,
      scale: 0.8,
      rotateY: direction < 0 ? 45 : -45,
      zIndex: 0,
    }),
  };

  return (
    <div className="relative w-full overflow-hidden py-12">
      <div className="relative mx-auto max-w-4xl">
        {/* Desktop 3D Carousel */}
        <div className="hidden md:block">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: 'spring', stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 },
                rotateY: { duration: 0.4 },
              }}
              className="relative"
              style={{ perspective: '1000px' }}
            >
              <motion.div
                className="rounded-2xl border border-line bg-surface p-8 shadow-2xl"
                whileHover={{ scale: 1.02, rotateY: 5 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold tracking-tight text-ink">
                      {currentRepo.name}
                    </h3>
                    {currentRepo.description && (
                      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                        {currentRepo.description}
                      </p>
                    )}
                  </div>
                  {currentRepo.archived && (
                    <span className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-ink-muted">
                      Archived
                    </span>
                  )}
                </div>

                {currentRepo.topics && currentRepo.topics.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {currentRepo.topics.slice(0, 5).map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-ink-muted"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-ink-muted">
                  {currentRepo.language && (
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-3 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: languageColour(currentRepo.language) }}
                      />
                      {currentRepo.language}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <StarIcon width={14} height={14} />
                    {currentRepo.stars}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ForkIcon width={14} height={14} />
                    {currentRepo.forks}
                  </span>
                  {currentRepo.pushedAt && (
                    <span className="text-xs">
                      Updated {relativeTime(currentRepo.pushedAt, nowMs)}
                    </span>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <span className="font-mono text-xs text-ink-muted">/{currentRepo.name}</span>
                  <a
                    href={currentRepo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent/90"
                  >
                    <GitHubIcon width={16} height={16} />
                    View on GitHub
                  </a>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Desktop Navigation buttons */}
        {repos.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 rounded-full border border-line bg-surface p-3 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              aria-label="Previous project"
            >
              <svg width={24} height={24} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={next}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 rounded-full border border-line bg-surface p-3 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              aria-label="Next project"
            >
              <svg width={24} height={24} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Mobile simplified carousel */}
      <div className="md:hidden space-y-4">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="text-lg font-semibold tracking-tight text-ink">
            {currentRepo.name}
          </h3>
          {currentRepo.description && (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {currentRepo.description}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-ink-muted">
              {currentRepo.language && (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: languageColour(currentRepo.language) }}
                  />
                  {currentRepo.language}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <StarIcon width={12} height={12} />
                {currentRepo.stars}
              </span>
            </div>
            <a
              href={currentRepo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink"
            >
              <GitHubIcon width={12} height={12} />
              View
            </a>
          </div>
        </div>

        {/* Mobile navigation */}
        {repos.length > 1 && (
          <div className="flex items-center justify-between">
            <button
              onClick={prev}
              className="rounded-full border border-line bg-surface p-2 text-ink-muted hover:bg-surface-2"
              aria-label="Previous project"
            >
              <svg width={20} height={20} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex gap-2">
              {repos.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setDirection(index > currentIndex ? 1 : -1);
                    setCurrentIndex(index);
                  }}
                  className="flex size-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-label={`Go to project ${index + 1}`}
                  aria-current={index === currentIndex ? 'true' : undefined}
                >
                  <span
                    aria-hidden="true"
                    className={`h-2 rounded-full transition-all ${
                      index === currentIndex ? 'w-8 bg-accent' : 'w-2 bg-surface-2'
                    }`}
                  />
                </button>
              ))}
            </div>
            <button
              onClick={next}
              className="rounded-full border border-line bg-surface p-2 text-ink-muted hover:bg-surface-2"
              aria-label="Next project"
            >
              <svg width={20} height={20} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Desktop dots indicator */}
      <div className="hidden md:flex mt-8 justify-center gap-2">
        {repos.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setDirection(index > currentIndex ? 1 : -1);
              setCurrentIndex(index);
            }}
            className="flex size-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={`Go to project ${index + 1}`}
            aria-current={index === currentIndex ? 'true' : undefined}
          >
            <span
              aria-hidden="true"
              className={`h-2 rounded-full transition-all ${
                index === currentIndex ? 'w-8 bg-accent' : 'w-2 bg-surface-2'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
