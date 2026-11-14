import React from 'react';
import { BrowseRow, SectionHeader } from '../../design-system';
import type { TryHit } from '../../cases/trySearch/types';
import type { TryGroup } from '../../workspace/useTriesView';
import { hitKey } from '../../workspace/useTrySearch';
import { plural } from '../../../electron/plural.mjs';
import { hitSpan } from '../tries/TryResults';

const SHOWN_HITS = 20;

const TriesShell: React.FC<{ testId: string; children: React.ReactNode }> = ({ testId, children }) => (
  <section className="mt-4" data-testid={testId}>
    <SectionHeader title="Tries" className="px-[8px]" />
    {children}
  </section>
);

export const TriesSection: React.FC<{ groups: TryGroup[]; onOpen: (robot: string) => void }> = ({ groups, onOpen }) =>
  groups.length > 0 && (
    <TriesShell testId="library-tries">
      {groups.map((g) => (
        <BrowseRow
          key={g.robot}
          title={g.robot}
          meta={plural(g.tries.length, 'try', 'tries')}
          onOpen={() => onOpen(g.robot)}
        />
      ))}
    </TriesShell>
  );

const hitMeta = (hit: TryHit) => {
  const span = hitSpan(hit);

  return span ? `${hit.robot}, ${span}` : hit.robot;
};

export const TryHitsSection: React.FC<{ hits: TryHit[]; onOpen: (hit: TryHit) => void }> = ({ hits, onOpen }) =>
  hits.length > 0 && (
    <TriesShell testId="library-try-hits">
      {hits.slice(0, SHOWN_HITS).map((hit) => (
        <BrowseRow key={hitKey(hit)} title={hit.label} meta={hitMeta(hit)} onOpen={() => onOpen(hit)} />
      ))}
    </TriesShell>
  );
