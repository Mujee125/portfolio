'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { languageColour } from '@/lib/format';
import type { Repository } from '@/lib/github/types';

interface TechStackVisualizerProps {
  repo: Repository;
}

export function TechStackVisualizer({ repo }: TechStackVisualizerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const techItems = [
    ...(repo.language ? [{ name: repo.language, color: languageColour(repo.language), type: 'language' }] : []),
    ...repo.topics.slice(0, 5).map((topic) => ({
      name: topic,
      color: '#6366f1', // Default indigo for topics
      type: 'topic',
    })),
  ];

  if (techItems.length === 0) {
    return (
      <div className="text-xs text-ink-muted">
        No tech stack info
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="hidden md:flex flex-wrap items-center gap-2">
        <AnimatePresence mode="wait">
          {isExpanded ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-2"
            >
              {techItems.map((item, index) => (
                <motion.div
                  key={item.name}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: index * 0.05, type: 'spring', stiffness: 200 }}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="relative"
                >
                  <motion.div
                    className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors group-hover:border-accent group-hover:text-accent"
                    style={{ backgroundColor: `${item.color}15` }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      {item.name}
                      {' '}
                      <span className="sr-only">
                        {item.type === 'language' ? 'Language' : 'Topic'}
                      </span>
                    </div>
                  </motion.div>
                </motion.div>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.button
          onClick={() => setIsExpanded((expanded) => !expanded)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-expanded={isExpanded}
          className={isExpanded
            ? 'text-xs text-ink-muted hover:text-accent'
            : 'flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent hover:text-accent'}
        >
          {isExpanded ? (
            <>
              <span className="sr-only">Show fewer technologies: </span>
              Show less
            </>
          ) : (
            <>
              <span className="sr-only">Show all {techItems.length} technologies: </span>
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: techItems[0]?.color }}
              />
              {techItems[0]?.name}
              {techItems.length > 1 && (
                <span className="text-ink-muted">+{techItems.length - 1}</span>
              )}
            </>
          )}
        </motion.button>
      </div>

      {/* Mobile simplified version */}
      <div className="md:hidden flex flex-wrap gap-1.5">
        {techItems.slice(0, 3).map((item) => (
          <span
            key={item.name}
            className="rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10.5px] text-ink-muted"
          >
            {item.name}
            {' '}
            <span className="sr-only">
              {item.type === 'language' ? 'Language' : 'Topic'}
            </span>
          </span>
        ))}
        {techItems.length > 3 && (
          <span className="self-center font-mono text-[10.5px] text-ink-muted">
            +{techItems.length - 3}
          </span>
        )}
      </div>
    </div>
  );
}
