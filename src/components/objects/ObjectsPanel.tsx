import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Button, ChevronRightIcon, EmptyState, SearchField, SectionHeader, useScrollFade } from '../../design-system';
import type { SimReadyAsset } from '../../simready/search';
import { useSimReadySearch } from '../../simready/useSimReadySearch';
import { OBJECT_CATEGORIES, type ObjectCategory } from './objectCategories';
import { LoadingTiles, SimReadyTile } from './SimReadyTile';

const CategoryRow: React.FC<{ category: ObjectCategory; onOpen: () => void }> = ({ category, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="group w-full flex items-center gap-3 h-[52px] px-2.5 rounded-xl text-left cursor-default hover:bg-white/[0.05] active:scale-[0.99] transition-[background-color,transform] duration-150"
  >
    <div className="min-w-0 flex-1">
      <div className="text-[13.5px] font-medium text-white/90 truncate">{category.title}</div>
      <div className="text-[12px] text-white/40 truncate">{category.examples}</div>
    </div>
    <ChevronRightIcon className="w-4 h-4 text-white/25 group-hover:text-white/50 shrink-0 transition-colors" />
  </button>
);

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

const Results: React.FC<{
  query: string;
  search: ReturnType<typeof useSimReadySearch>;
  busy: string | null;
  onInsert: (a: SimReadyAsset) => void;
}> = ({ query, search, busy, onInsert }) => {
  if (search.error)
    return (
      <EmptyState
        title={search.error}
        action={
          <Button variant="secondary" size="sm" onClick={search.retry}>
            Try Again
          </Button>
        }
      />
    );

  if (!search.loading && !search.results.length) return <EmptyState title={`No matches for “${query}”`} />;

  return (
    <div className="px-[12px] pt-1 pb-4">
      <div className="grid grid-cols-2 gap-x-[8px] gap-y-[12px]">
        {search.results.map((a) => (
          <SimReadyTile key={a.url} asset={a} disabled={busy !== null} onInsert={() => onInsert(a)} />
        ))}
        {search.loading && <LoadingTiles count={search.results.length ? 2 : 6} />}
      </div>
      {search.hasMore && <LoadMore onReach={search.showMore} />}
    </div>
  );
};

export const ObjectsPanel: React.FC<{ onInsert: (asset: SimReadyAsset) => Promise<unknown> | void }> = ({
  onInsert,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ObjectCategory | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { ref: fadeRef, style: fadeStyle } = useScrollFade();
  const browsing = !category && !query.trim();
  const search = useSimReadySearch(category ? `${category.query} ${query}` : query, 'objects', !browsing);

  const insert = async (asset: SimReadyAsset) => {
    if (busy) return;

    setBusy(asset.url);

    try {
      await onInsert(asset);
    } finally {
      setBusy(null);
    }
  };

  const back = () => {
    setCategory(null);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') search.searchNow();

    if (e.key !== 'Escape') return;

    if (query) setQuery('');
    else if (category) back();
    else (e.target as HTMLInputElement).blur();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-[12px] pb-[10px] shrink-0">
        <SearchField
          value={query}
          onChange={setQuery}
          onKeyDown={handleKeyDown}
          onBack={category ? back : undefined}
          placeholder={category ? `Search ${category.title.toLowerCase()}` : 'Search objects'}
          aria-label="Search objects"
        />
      </div>
      <div ref={fadeRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={fadeStyle}>
        {browsing ? (
          <div className="px-[8px] pb-4">
            <SectionHeader title="Browse" />
            {OBJECT_CATEGORIES.map((c) => (
              <CategoryRow key={c.title} category={c} onOpen={() => setCategory(c)} />
            ))}
          </div>
        ) : (
          <Results query={query.trim() || category?.title || ''} search={search} busy={busy} onInsert={insert} />
        )}
      </div>
    </div>
  );
};
