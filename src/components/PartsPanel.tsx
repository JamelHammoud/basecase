import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { catalogRef } from '../data/catalog';
import { HardwareSpec, familyOf, makeSpec } from '../data/hardware';
import { CatalogItem } from '../types/robotics';
import { SearchField, useScrollFade } from '../design-system';
import { searchCatalog } from './parts/catalogSearch';
import { Home, SearchResults, TileGrid } from './parts/lists';
import { HardwarePage, ItemPage, PageFooter } from './parts/pages';
import { CATEGORIES, type Category, type View, searchScope } from './parts/partsViews';

const lastSpecByFamily = new Map<string, HardwareSpec>();

const PartsView: React.FC<{
  view: View;
  open: (next: View) => void;
  openItem: (item: CatalogItem) => void;
  onAdd: (item: CatalogItem) => void;
  onChangeHardware: (spec: HardwareSpec) => void;
}> = ({ view, open, openItem, onAdd, onChangeHardware }) => {
  const openCategory = (c: Category) =>
    c.family
      ? open({ kind: 'hardware', spec: lastSpecByFamily.get(c.family.id) ?? makeSpec(c.family.types[0].type) })
      : open({ kind: 'category', id: c.id });

  switch (view.kind) {
    case 'home':
      return <Home onOpenCategory={openCategory} />;
    case 'category':
      return <TileGrid items={CATEGORIES.find((c) => c.id === view.id)?.items ?? []} onOpen={openItem} onAdd={onAdd} />;
    case 'item':
      return <ItemPage ref_={view.ref} onAdd={onAdd} onOpen={openItem} />;
    default:
      return <HardwarePage spec={view.spec} onChange={onChangeHardware} />;
  }
};

const stepIndex = (active: number, key: string, count: number) =>
  (active + (key === 'ArrowDown' ? 1 : -1) + count) % count;

export const PartsPanel: React.FC<{
  onAdd: (item: CatalogItem) => void;
  searchInputRef?: React.MutableRefObject<HTMLInputElement | null>;
}> = ({ onAdd, searchInputRef }) => {
  const [stack, setStack] = useState<View[]>([{ kind: 'home' }]);
  const view = stack[stack.length - 1];
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const setSearchRef = useCallback(
    (node: HTMLInputElement | null) => {
      if (searchInputRef) searchInputRef.current = node;
    },
    [searchInputRef],
  );
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const { ref: fadeRef, style: fadeStyle } = useScrollFade();
  const setBody = useCallback(
    (node: HTMLDivElement | null) => {
      bodyRef.current = node;
      fadeRef(node);
    },
    [fadeRef],
  );

  const open = (next: View) => {
    setQuery('');
    setStack((s) => [...s, next]);
  };
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const searchAll = () => setStack([{ kind: 'home' }]);
  const openItem = (item: CatalogItem) =>
    item.hardware ? open({ kind: 'hardware', spec: item.hardware }) : open({ kind: 'item', ref: catalogRef(item) });

  const searching = query.trim().length > 0;

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [stack.length, searching]);

  const scope = useMemo(() => searchScope(view), [view]);
  const results = useMemo(() => {
    const all = searchCatalog(query);

    return scope ? all.filter(scope.has) : all;
  }, [query, scope]);
  const search = (q: string) => {
    setQuery(q);
    setActive(0);
  };

  const onEscape = (e: React.KeyboardEvent) => {
    if (query) search('');
    else if (stack.length > 1) back();
    else (e.target as HTMLInputElement).blur();
  };
  const onArrow = (e: React.KeyboardEvent) => {
    e.preventDefault();

    const next = stepIndex(active, e.key, results.length);

    setActive(next);
    bodyRef.current?.querySelector(`[data-result="${next}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  const onEnter = (e: React.KeyboardEvent) => {
    e.preventDefault();

    if (e.metaKey) onAdd(results[active]);
    else openItem(results[active]);
  };
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onEscape(e);
    else if (results.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) onArrow(e);
    else if (e.key === 'Enter' && results[active]) onEnter(e);
  };
  const changeHardware = (spec: HardwareSpec) => {
    lastSpecByFamily.set(familyOf(spec.type).id, spec);
    setStack((s) => [...s.slice(0, -1), { kind: 'hardware', spec }]);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-[12px] pb-[10px] shrink-0">
        <SearchField
          ref={setSearchRef}
          value={query}
          onChange={search}
          onKeyDown={onSearchKey}
          placeholder={scope ? `Search ${scope.label}` : 'Search parts'}
          aria-label={scope ? `Search ${scope.label}` : 'Search parts'}
          shortcut="⌘F"
          onBack={stack.length > 1 ? back : undefined}
        />
      </div>

      <div ref={setBody} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={fadeStyle}>
        {searching ? (
          <SearchResults
            results={results}
            active={active}
            onHover={setActive}
            onOpen={openItem}
            onAdd={onAdd}
            query={query}
            onSearchAll={scope ? searchAll : undefined}
          />
        ) : (
          <PartsView view={view} open={open} openItem={openItem} onAdd={onAdd} onChangeHardware={changeHardware} />
        )}
      </div>
      {!searching && <PageFooter view={view} onAdd={onAdd} />}
    </div>
  );
};
