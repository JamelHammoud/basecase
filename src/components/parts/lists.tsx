import React from 'react';
import { catalogRef } from '../../data/catalog';
import type { CatalogItem } from '../../types/robotics';
import { usePartThumbnail } from '../../three/partThumbnails';
import {
  BrowseRow,
  Button,
  HoverCard,
  NoMatches,
  PreviewImage,
  REVEAL_ON_HOVER,
  SectionHeader,
} from '../../design-system';
import type { SimReadyAsset } from '../../simready/search';
import type { SimReadySearch } from '../../simready/useSimReadySearch';
import { CatalogDetails } from '../PartDetails';
import { OBJECT_CATEGORIES, type ObjectCategory } from '../objects/objectCategories';
import { SimReadyGrid } from '../objects/SimReadyGrid';
import type { Hit } from './insertSearch';
import type { Category } from './partsViews';
import type { RobotEntry, RobotGroup } from './robotEntries';
import { RobotGroupRows, RobotRow } from './robotViews';
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
            <PreviewImage src={thumb} zoom className="p-1.5" />
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

type HomeSection = 'Components' | 'Hardware' | 'Robots' | 'Objects';

const HomeSection: React.FC<{ title: HomeSection; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-3" data-parts-section={title}>
    <SectionHeader title={title} />
    {children}
  </div>
);

export const Home: React.FC<{
  categories: Category[];
  robots: RobotEntry[];
  onOpenCategory: (c: Category) => void;
  onOpenRobots: (group: RobotGroup) => void;
  onOpenObjects: (category: ObjectCategory) => void;
}> = ({ categories, robots, onOpenCategory, onOpenRobots, onOpenObjects }) => (
  <div className="px-[8px] pb-4">
    {(['Components', 'Hardware'] as const).map((section) => (
      <HomeSection key={section} title={section}>
        {categories
          .filter((c) => c.section === section)
          .map((c) => (
            <CategoryRow key={c.id} category={c} onOpen={() => onOpenCategory(c)} />
          ))}
      </HomeSection>
    ))}
    <HomeSection title="Robots">
      <RobotGroupRows robots={robots} onOpen={onOpenRobots} />
    </HomeSection>
    <HomeSection title="Objects">
      {OBJECT_CATEGORIES.map((c) => (
        <BrowseRow key={c.title} title={c.title} meta={c.examples} onOpen={() => onOpenObjects(c)} />
      ))}
    </HomeSection>
  </div>
);

export interface HitActions {
  busy: boolean;
  onOpenPart: (item: CatalogItem) => void;
  onAddPart: (item: CatalogItem) => void;
  onInsertRobot: (robot: RobotEntry) => void;
  onOpenObjects: (category: ObjectCategory) => void;
}

const HitRow: React.FC<{ hit: Hit; index: number; active: boolean; onHover: () => void; actions: HitActions }> = ({
  hit,
  index,
  active,
  onHover,
  actions,
}) => {
  if (hit.kind === 'robot')
    return (
      <RobotRow
        robot={hit.robot}
        index={index}
        active={active}
        disabled={actions.busy}
        onHover={onHover}
        onInsert={() => actions.onInsertRobot(hit.robot)}
      />
    );

  if (hit.kind === 'objects')
    return (
      <div data-result={index} onPointerEnter={onHover}>
        <BrowseRow
          title={hit.category.title}
          meta={hit.category.examples}
          onOpen={() => actions.onOpenObjects(hit.category)}
        />
      </div>
    );

  return (
    <ResultRow
      index={index}
      item={hit.item}
      active={active}
      onHover={onHover}
      onOpen={() => actions.onOpenPart(hit.item)}
      onAdd={() => actions.onAddPart(hit.item)}
    />
  );
};

const hitKey = (hit: Hit) => {
  if (hit.kind === 'robot') return `robot:${hit.robot.key}`;

  return hit.kind === 'objects' ? `objects:${hit.category.title}` : catalogRef(hit.item);
};

const simReadyEmpty = (s: SimReadySearch | null) => !s || (!s.loading && !s.error && !s.results.length);

export const SearchResults: React.FC<{
  hits: Hit[];
  active: number;
  query: string;
  onHover: (i: number) => void;
  actions: HitActions;
  simready: SimReadySearch | null;
  onInsertSimReady: (asset: SimReadyAsset) => void;
  onSearchAll?: () => void;
}> = ({ hits, active, query, onHover, actions, simready, onInsertSimReady, onSearchAll }) => {
  if (hits.length === 0 && simReadyEmpty(simready))
    return (
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
    );

  return (
    <div className="px-[8px] pt-1 pb-4">
      {hits.map((hit, i) => (
        <HitRow
          key={hitKey(hit)}
          hit={hit}
          index={i}
          active={i === active}
          onHover={() => onHover(i)}
          actions={actions}
        />
      ))}
      {simready && !simReadyEmpty(simready) && (
        <section className="mt-3 px-[4px]">
          <SectionHeader title="SimReady" className="-mx-[4px]" />
          <SimReadyGrid search={simready} busy={actions.busy} onInsert={onInsertSimReady} loadingTiles={4} />
        </section>
      )}
    </div>
  );
};
