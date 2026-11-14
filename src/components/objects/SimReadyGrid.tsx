import React from 'react';
import { Button, EmptyState, LoadMore } from '../../design-system';
import type { SimReadyAsset } from '../../simready/search';
import type { SimReadySearch } from '../../simready/useSimReadySearch';
import { LoadingTiles, SimReadyTile } from './SimReadyTile';

export const SimReadyGrid: React.FC<{
  search: SimReadySearch;
  busy: boolean;
  onInsert: (a: SimReadyAsset) => void;
  loadingTiles?: number;
}> = ({ search, busy, onInsert, loadingTiles = 6 }) => {
  if (search.error)
    return (
      <EmptyState
        title={search.error}
        action={
          <Button variant="secondary" size="sm" onClick={search.retry}>
            Search Again
          </Button>
        }
      />
    );

  return (
    <>
      <div className="grid grid-cols-2 gap-x-[8px] gap-y-[12px]">
        {search.results.map((a) => (
          <SimReadyTile key={a.url} asset={a} disabled={busy} onInsert={() => onInsert(a)} />
        ))}
        {search.loading && <LoadingTiles count={search.results.length ? 2 : loadingTiles} />}
      </div>
      {search.hasMore && <LoadMore onReach={search.showMore} />}
    </>
  );
};
