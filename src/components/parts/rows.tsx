import React from 'react';
import { catalogRef } from '../../data/catalog';
import { COMPONENT_BY_ID } from '../../data/components';
import { HARDWARE_BY_TYPE } from '../../data/hardware';
import { isSourcedId } from '../../data/sourcedItems';
import { PART_DRAG_TYPE, setSceneDrag } from '../../data/dnd';
import type { CatalogItem } from '../../types/robotics';
import { usePartThumbnail } from '../../three/partThumbnails';
import { plural } from '../../../electron/plural.mjs';
import { BrowseRow, PreviewImage, RowActions, Tooltip, PlusIcon } from '../../design-system';
import type { Category } from './partsViews';

export const Thumb: React.FC<{ url?: string; className?: string; empty?: boolean }> = ({
  url,
  className = '',
  empty,
}) => (
  <div className={`preview preview-sm ${className}`}>
    <PreviewImage src={empty ? '' : url} className="p-0.5" />
  </div>
);

export const makerLine = (item: CatalogItem): string =>
  (item.componentId && COMPONENT_BY_ID[item.componentId]?.manufacturer) || '';

export function metaLine(item: CatalogItem): string {
  if (isSourcedId(item.componentId)) return 'Added by Agent';

  return item.hardware ? HARDWARE_BY_TYPE[item.hardware.type].description : makerLine(item);
}

export const dragProps = (item: CatalogItem) => ({
  draggable: true,
  onDragStart: (e: React.DragEvent) => {
    setSceneDrag(e.dataTransfer, PART_DRAG_TYPE, catalogRef(item));
    e.dataTransfer.effectAllowed = 'copy';

    const img = (e.currentTarget as HTMLElement).querySelector('img');

    if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
  },
});

export const AddButton: React.FC<{ onAdd: () => void; className?: string }> = ({ onAdd, className = '' }) => (
  <Tooltip label="Add" className={className}>
    <button
      type="button"
      aria-label="Add"
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      className="w-[28px] h-[28px] rounded-full bg-[#0d99ff] text-white flex items-center justify-center cursor-default shadow-[0_2px_6px_rgba(0,0,0,0.4)] hover:bg-[#2ba5ff] active:scale-[0.94] transition-[background-color,transform] duration-150"
    >
      <PlusIcon className="w-3.5 h-3.5" strokeWidth={3} />
    </button>
  </Tooltip>
);

const ACTIVE_FILL = '[--result-row-fill:color-mix(in_srgb,white_7%,var(--color-panel-bg))]';
const RESTING_FILL =
  '[--result-row-fill:var(--color-panel-bg)] hover:[--result-row-fill:color-mix(in_srgb,white_5%,var(--color-panel-bg))]';

export const ResultRow: React.FC<{
  item: CatalogItem;
  onOpen: () => void;
  onAdd: () => void;
  active?: boolean;
  onHover?: () => void;
  index?: number;
}> = ({ item, onOpen, onAdd, active, onHover, index }) => {
  const thumb = usePartThumbnail(item);

  return (
    <div
      data-result={index}
      onPointerEnter={onHover}
      className={`group relative rounded-xl bg-[var(--result-row-fill)] transition-colors ${active ? ACTIVE_FILL : RESTING_FILL}`}
      {...dragProps(item)}
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center gap-3 h-[52px] px-1.5 text-left cursor-default"
      >
        <Thumb url={thumb} className="w-12 h-[32px] shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-white/90 truncate">{item.name}</div>
          <div className="text-[12px] text-white/50 truncate">{metaLine(item)}</div>
        </div>
      </button>
      <RowActions fill="var(--result-row-fill)" shown={active} className="inset-y-0 right-0 pr-2 rounded-r-xl">
        <AddButton onAdd={onAdd} />
      </RowActions>
    </div>
  );
};

export const CategoryRow: React.FC<{ category: Category; onOpen: () => void }> = ({ category, onOpen }) => {
  const thumb = usePartThumbnail(category.items[0]);
  const meta = category.family ? category.family.description : plural(category.count ?? category.items.length, 'part');

  return (
    <BrowseRow
      title={category.title}
      meta={meta}
      thumb={<Thumb url={thumb} empty={!category.items.length} className="w-12 h-[32px] shrink-0" />}
      onOpen={onOpen}
    />
  );
};
