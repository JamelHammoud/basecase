import React from 'react';
import { catalogRef } from '../../data/catalog';
import type { CatalogItem } from '../../types/robotics';
import { usePartThumbnail } from '../../three/partThumbnails';
import { Button, EmptyState, HoverCard, SectionHeader } from '../../design-system';
import { CatalogDetails } from '../PartDetails';
import { CATEGORIES, type Category, type SceneParts } from './partsViews';
import { AddButton, CategoryRow, ResultRow, SceneRow, dragProps, metaLine } from './rows';

const Tile: React.FC<{ item: CatalogItem; onOpen: () => void; onAdd: () => void }> = ({ item, onOpen, onAdd }) => {
  const thumb = usePartThumbnail(item);

  return (
    <HoverCard content={() => <CatalogDetails item={item} />} beside="aside" className="w-full">
      <div className="group relative w-full" {...dragProps(item)}>
        <button
          type="button"
          onClick={onOpen}
          className="w-full text-left cursor-default active:scale-[0.98] transition-transform duration-150"
        >
          <div className="preview aspect-[4/3]">
            {thumb ? (
              <img
                src={thumb}
                alt=""
                draggable={false}
                className="w-full h-full object-contain p-1.5 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.06]"
              />
            ) : (
              <div className="w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent)] bg-[length:200%_100%] animate-shimmer" />
            )}
          </div>
          <div className="px-0.5 pt-2">
            <div className="text-[13px] font-medium text-white/90 truncate">{item.name}</div>
            <div className="text-[12px] text-white/40 truncate">{metaLine(item)}</div>
          </div>
        </button>
        <AddButton
          onAdd={onAdd}
          className="absolute top-[8px] right-[8px] opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        />
      </div>
    </HoverCard>
  );
};

export const TileGrid: React.FC<{
  items: CatalogItem[];
  onOpen: (i: CatalogItem) => void;
  onAdd: (i: CatalogItem) => void;
  flush?: boolean;
}> = ({ items, onOpen, onAdd, flush }) => (
  <div className={`grid grid-cols-2 gap-x-[8px] gap-y-[12px] ${flush ? '' : 'px-[12px] pt-1 pb-4'}`}>
    {items.map((item) => (
      <Tile key={catalogRef(item)} item={item} onOpen={() => onOpen(item)} onAdd={() => onAdd(item)} />
    ))}
  </div>
);

export const Home: React.FC<{
  scene: SceneParts;
  onOpenScene: () => void;
  onOpenCategory: (c: Category) => void;
}> = ({ scene, onOpenScene, onOpenCategory }) => (
  <div className="px-[8px] pb-4">
    {(scene.used.length > 0 || scene.related.length > 0) && (
      <div className="mb-3">
        <SceneRow scene={scene} onOpen={onOpenScene} />
      </div>
    )}
    {(['Components', 'Hardware'] as const).map((section) => (
      <div key={section} className="mb-3">
        <SectionHeader title={section} />
        {CATEGORIES.filter((c) => c.section === section).map((c) => (
          <CategoryRow key={c.id} category={c} onOpen={() => onOpenCategory(c)} />
        ))}
      </div>
    ))}
  </div>
);

export const ScenePage: React.FC<{
  scene: SceneParts;
  onOpen: (item: CatalogItem) => void;
  onAdd: (item: CatalogItem) => void;
}> = ({ scene, onOpen, onAdd }) =>
  scene.used.length === 0 && scene.related.length === 0 ? (
    <EmptyState title="No parts in this scene" />
  ) : (
    <div className="px-[8px] pb-4">
      {scene.used.length > 0 && (
        <div className="mb-3">
          <SectionHeader title="Used" />
          {scene.used.map(({ item, count }) => (
            <ResultRow
              key={catalogRef(item)}
              item={item}
              count={count}
              onOpen={() => onOpen(item)}
              onAdd={() => onAdd(item)}
            />
          ))}
        </div>
      )}
      {scene.related.length > 0 && (
        <div className="mb-3">
          <SectionHeader title={scene.used.length > 0 ? 'Goes with these' : 'Named in the description'} />
          {scene.related.map((item) => (
            <ResultRow key={catalogRef(item)} item={item} onOpen={() => onOpen(item)} onAdd={() => onAdd(item)} />
          ))}
        </div>
      )}
    </div>
  );

export const SearchResults: React.FC<{
  results: CatalogItem[];
  active: number;
  query: string;
  onHover: (i: number) => void;
  onOpen: (item: CatalogItem) => void;
  onAdd: (item: CatalogItem) => void;
  onSearchAll?: () => void;
}> = ({ results, active, query, onHover, onOpen, onAdd, onSearchAll }) =>
  results.length === 0 ? (
    <EmptyState
      title={`No matches for “${query.trim()}”`}
      action={
        onSearchAll && (
          <Button variant="secondary" size="sm" onClick={onSearchAll}>
            Search All Parts
          </Button>
        )
      }
    />
  ) : (
    <div className="px-[8px] pb-4">
      <SectionHeader title={`${results.length} ${results.length === 1 ? 'result' : 'results'}`} />
      {results.map((item, i) => (
        <ResultRow
          key={catalogRef(item)}
          index={i}
          item={item}
          active={i === active}
          onHover={() => onHover(i)}
          onOpen={() => onOpen(item)}
          onAdd={() => onAdd(item)}
        />
      ))}
    </div>
  );
