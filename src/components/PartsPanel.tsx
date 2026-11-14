import React, { useCallback, useRef } from 'react';
import { HardwareSpec, makeSpec } from '../data/hardware';
import type { SourcedItem } from '../data/sourcedItems';
import type { SimReadyAsset } from '../simready/search';
import type { RobotPreset } from '../utils/robotImport';
import { CatalogItem } from '../types/robotics';
import { SearchField, useScrollFade } from '../design-system';
import { AddedByAgent } from './parts/AddedByAgent';
import { Home, SearchResults, TileGrid, type HitActions } from './parts/lists';
import { ObjectsView } from './parts/ObjectsView';
import { HardwarePage, ItemPage, PageFooter } from './parts/pages';
import { ADDED_BY_AGENT, type Category, type View } from './parts/partsViews';
import { RobotGrid } from './parts/robotViews';
import { robotsIn, type RobotEntry } from './parts/robotEntries';
import { useInsertBusy } from './parts/useInsertBusy';
import { lastSpecByFamily, usePartsSearch, type PartsReveal } from './parts/usePartsSearch';
import { keyFor } from '../app/shortcuts';

export type { PartsReveal } from './parts/usePartsSearch';

const PartsView: React.FC<{
  view: View;
  categories: Category[];
  sourced: SourcedItem[];
  robots: RobotEntry[];
  actions: HitActions;
  open: (next: View) => void;
  onChangeHardware: (spec: HardwareSpec) => void;
}> = ({ view, categories, sourced, robots, actions, open, onChangeHardware }) => {
  const openCategory = (c: Category) =>
    c.family
      ? open({ kind: 'hardware', spec: lastSpecByFamily.get(c.family.id) ?? makeSpec(c.family.types[0].type) })
      : open({ kind: 'category', id: c.id });
  const items = (id: string) => categories.find((c) => c.id === id)?.items ?? [];

  switch (view.kind) {
    case 'home':
      return (
        <Home
          categories={categories}
          robots={robots}
          onOpenCategory={openCategory}
          onOpenRobots={(group) => open({ kind: 'robots', group })}
          onOpenObjects={actions.onOpenObjects}
        />
      );
    case 'category':
      return view.id === ADDED_BY_AGENT ? (
        <AddedByAgent items={items(view.id)} sourced={sourced} onOpen={actions.onOpenPart} onAdd={actions.onAddPart} />
      ) : (
        <TileGrid items={items(view.id)} onOpen={actions.onOpenPart} onAdd={actions.onAddPart} />
      );
    case 'robots':
      return <RobotGrid robots={robotsIn(robots, view.group)} busy={actions.busy} onInsert={actions.onInsertRobot} />;
    case 'item':
      return <ItemPage ref_={view.ref} onAdd={actions.onAddPart} onOpen={actions.onOpenPart} />;
    case 'hardware':
      return <HardwarePage spec={view.spec} onChange={onChangeHardware} />;
    default:
      return null;
  }
};

export const PartsPanel: React.FC<{
  onAdd: (item: CatalogItem) => void;
  onInsertRobot: (preset: RobotPreset) => Promise<unknown> | void;
  onInsertSimReady: (asset: SimReadyAsset) => Promise<unknown> | void;
  reveal?: PartsReveal | null;
  onRevealed?: () => void;
  searchInputRef?: React.MutableRefObject<HTMLInputElement | null>;
}> = ({ onAdd, onInsertRobot, onInsertSimReady, reveal = null, onRevealed = () => {}, searchInputRef }) => {
  const insert = useInsertBusy();
  const insertSimReady = (a: SimReadyAsset) => void insert.run(a.url, () => onInsertSimReady(a));
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const parts = usePartsSearch({
    onAdd,
    reveal,
    onRevealed,
    bodyRef,
    onInsertRobot: (r) => void insert.run(r.key, () => onInsertRobot(r.preset)),
  });
  const { view, stack, query, scope, searching } = parts;
  const setSearchRef = useCallback(
    (node: HTMLInputElement | null) => {
      if (searchInputRef) searchInputRef.current = node;
    },
    [searchInputRef],
  );
  const { ref: fadeRef, style: fadeStyle } = useScrollFade();
  const setBody = useCallback(
    (node: HTMLDivElement | null) => {
      bodyRef.current = node;
      fadeRef(node);
    },
    [fadeRef],
  );
  const actions: HitActions = { ...parts.actions, busy: insert.busy };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-[12px] pb-[10px] shrink-0">
        <SearchField
          ref={setSearchRef}
          value={query}
          onChange={parts.search}
          onKeyDown={parts.onSearchKey}
          placeholder={scope ? `Search ${scope.label}` : 'Search parts'}
          aria-label={scope ? `Search ${scope.label}` : 'Search parts'}
          shortcut={keyFor('find-parts')}
          onBack={stack.length > 1 ? parts.back : undefined}
        />
      </div>

      <div ref={setBody} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={fadeStyle}>
        {view.kind === 'objects' && (
          <ObjectsView
            category={view.category}
            query={query}
            search={parts.objects}
            busy={insert.busy}
            onInsert={insertSimReady}
          />
        )}
        {view.kind !== 'objects' && searching && (
          <SearchResults
            hits={parts.hits}
            active={parts.active}
            onHover={parts.setActive}
            actions={actions}
            query={query}
            simready={parts.simready}
            onInsertSimReady={insertSimReady}
            onSearchAll={scope ? parts.searchAll : undefined}
          />
        )}
        {view.kind !== 'objects' && !searching && (
          <PartsView
            view={view}
            categories={parts.categories}
            sourced={parts.sourced}
            robots={parts.robots}
            actions={actions}
            open={parts.open}
            onChangeHardware={parts.changeHardware}
          />
        )}
      </div>
      {!searching && <PageFooter view={view} onAdd={onAdd} />}
    </div>
  );
};
