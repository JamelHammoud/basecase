import React from 'react';
import type { SourcedItem } from '../../data/sourcedItems';
import { ArrowUpRightIcon, SectionHeader } from '../../design-system';
import type { CatalogItem } from '../../types/robotics';
import { TileGrid } from './lists';
import { sourcedPartsWithoutMesh } from './partsViews';
import { Thumb, makerLine } from './rows';

const PartWithoutMesh: React.FC<{ item: SourcedItem }> = ({ item }) => (
  <a
    href={item.url}
    target="_blank"
    rel="noreferrer"
    className="group w-full flex items-center gap-3 h-[52px] px-1.5 rounded-xl text-left cursor-default hover:bg-white/[0.05] transition-colors"
  >
    <Thumb empty className="w-12 h-[32px] shrink-0" />
    <div className="min-w-0 flex-1">
      <div className="text-[13.5px] font-medium text-white/90 truncate">{item.name}</div>
      <div className="text-[12px] text-white/50 truncate">{item.maker}</div>
    </div>
    <ArrowUpRightIcon className="w-4 h-4 text-white/25 group-hover:text-white/50 shrink-0 transition-colors" />
  </a>
);

export const AddedByAgent: React.FC<{
  items: CatalogItem[];
  sourced: SourcedItem[];
  onOpen: (item: CatalogItem) => void;
  onAdd: (item: CatalogItem) => void;
}> = ({ items, sourced, onOpen, onAdd }) => {
  const waiting = sourcedPartsWithoutMesh(sourced);

  return (
    <>
      {items.length > 0 && <TileGrid items={items} onOpen={onOpen} onAdd={onAdd} meta={makerLine} />}
      {waiting.length > 0 && (
        <div className="px-[8px] pb-4">
          <SectionHeader title="Needs a 3D model" />
          {waiting.map((item) => (
            <PartWithoutMesh key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
};
