import React from 'react';
import type { TrySummary } from '../../cases/tryFile';
import type { TryHit } from '../../cases/trySearch/types';
import { NoMatches } from '../../design-system';
import { runClock } from '../../utils/duration';
import type { PickKeys } from '../../workspace/useTriesView';
import { hitKey } from '../../workspace/useTrySearch';
import { TryTile, type TileScene } from './TryTile';

export const TRIES_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2';

export function hitSpan(hit: TryHit): string | undefined {
  if (hit.end !== null) return `${runClock(hit.at)}–${runClock(hit.end)}`;

  return hit.at > 0 ? runClock(hit.at) : undefined;
}

interface TryResultsProps {
  query: string;
  hits: TryHit[] | null;
  summaries: Map<string, TrySummary>;
  selected: string[];
  sceneId: string;
  scene: TileScene;
  onPick: (hit: TryHit, keys: PickKeys) => void;
  onMenu: (hit: TryHit) => (e: React.MouseEvent) => void;
}

export const TryResults: React.FC<TryResultsProps> = ({ query, hits, summaries, selected, sceneId, scene, ...on }) => {
  const shown = (hits ?? []).flatMap((hit) => {
    const summary = summaries.get(hit.tryId);

    return summary ? [{ hit, summary }] : [];
  });

  if (hits && !shown.length) return <NoMatches query={query} />;

  return (
    <div className={TRIES_GRID} data-testid="try-results">
      {shown.map(({ hit, summary }) => (
        <TryTile
          key={hitKey(hit)}
          summary={summary}
          label={{ title: hit.label, span: hitSpan(hit) ?? runClock(summary.seconds), verdict: hit.verdict }}
          scene={summary.sceneId === sceneId ? scene : null}
          selected={selected.includes(hit.tryId)}
          onPick={(keys) => on.onPick(hit, keys)}
          onMenu={on.onMenu(hit)}
        />
      ))}
    </div>
  );
};
