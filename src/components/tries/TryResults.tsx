import React from 'react';
import type { TrySummary } from '../../cases/tryFile';
import type { TryHit } from '../../cases/trySearch/types';
import { NoMatches } from '../../design-system';
import type { PickKeys } from '../../workspace/useTriesView';
import { TryTile, type TileScene } from './TryTile';

export const TRIES_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2';

interface TryResultsProps {
  query: string;
  hits: TryHit[] | null;
  summaries: Map<string, TrySummary>;
  selected: string[];
  sceneId: string;
  scene: TileScene;
  onPick: (id: string, keys: PickKeys) => void;
  onMenu: (id: string) => (e: React.MouseEvent) => void;
}

export const TryResults: React.FC<TryResultsProps> = ({ query, hits, summaries, selected, sceneId, scene, ...on }) => {
  const shown = (hits ?? []).flatMap((hit) => summaries.get(hit.tryId) ?? []);

  if (hits && !shown.length) return <NoMatches query={query} />;

  return (
    <div className={TRIES_GRID} data-testid="try-results">
      {shown.map((summary) => (
        <TryTile
          key={summary.id}
          summary={summary}
          scene={summary.sceneId === sceneId ? scene : null}
          selected={selected.includes(summary.id)}
          onPick={(keys) => on.onPick(summary.id, keys)}
          onMenu={on.onMenu(summary.id)}
        />
      ))}
    </div>
  );
};
