import React from 'react';
import { catalogRef } from '../../data/catalog';
import type { CatalogItem } from '../../types/robotics';
import { usePartThumbnail } from '../../three/partThumbnails';
import { Button, HoverCard, NoMatches, PreviewImage, REVEAL_ON_HOVER, SectionHeader } from '../../design-system';
import { CatalogDetails } from '../PartDetails';
import type { Category } from './partsViews';
import { AddButton, CategoryRow, ResultRow, dragProps, metaLine } from './rows';

const Tile: React.FC<{ item: CatalogItem; meta: string; onOpen: () => void; onAdd: () => void }> = ({
  item,
  meta,
  onOpen,
  onAdd,
}) => {
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
            <PreviewImage
              src={thumb}
              className="p-1.5 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.06]"
            />
          </div>
          <div className="px-0.5 pt-2">
            <div className="text-[13px] font-medium text-white/90 truncate">{item.name}</div>
            <div className="text-[12px] text-white/50 truncate">{meta}</div>
          </div>
        </button>
        <AddButton onAdd={onAdd} className={`absolute top-[8px] right-[8px] transition-opacity ${REVEAL_ON_HOVER}`} />
      </div>
    </HoverCard>
  );
};

export const TileGrid: React.FC<{
  items: CatalogItem[];
  onOpen: (i: CatalogItem) => void;
  onAdd: (i: CatalogItem) => void;
  flush?: boolean;
  meta?: (i: CatalogItem) => string;
}> = ({ items, onOpen, onAdd, flush, meta = metaLine }) => (
  <div className={`grid grid-cols-2 gap-x-[8px] gap-y-[12px] ${flush ? '' : 'px-[12px] pt-1 pb-4'}`}>
    {items.map((item) => (
      <Tile
        key={catalogRef(item)}
        item={item}
        meta={meta(item)}
        onOpen={() => onOpen(item)}
        onAdd={() => onAdd(item)}
      />
    ))}
  </div>
);

export const Home: React.FC<{ categories: Category[]; onOpenCategory: (c: Category) => void }> = ({
  categories,
  onOpenCategory,
}) => (
  <div className="px-[8px] pb-4">
    {(['Components', 'Hardware'] as const).map((section) => (
      <div key={section} className="mb-3">
        <SectionHeader title={section} />
        {categories
          .filter((c) => c.section === section)
          .map((c) => (
            <CategoryRow key={c.id} category={c} onOpen={() => onOpenCategory(c)} />
          ))}
      </div>
    ))}
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
    <NoMatches
      query={query}
      action={
        onSearchAll && (
          <Button variant="secondary" size="sm" onClick={onSearchAll}>
            Search All Parts
          </Button>
        )
      }
    />
  ) : (
    <div className="px-[8px] pt-1 pb-4">
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
