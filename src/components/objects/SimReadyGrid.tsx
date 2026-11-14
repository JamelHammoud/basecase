import React, { useEffect, useEffectEvent, useRef } from 'react';
import { Button, EmptyState } from '../../design-system';
import type { SimReadyAsset } from '../../simready/search';
import type { SimReadySearch } from '../../simready/useSimReadySearch';
import { LoadingTiles, SimReadyTile } from './SimReadyTile';

const LoadMore: React.FC<{ onReach: () => void }> = ({ onReach }) => {
  const ref = useRef<HTMLDivElement>(null);
  const reach = useEffectEvent(onReach);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;

    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && reach(), {
      rootMargin: '400px',
    });

    io.observe(el);

    return () => io.disconnect();
  }, []);

  return <div ref={ref} className="h-px" aria-hidden />;
};

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
