import React from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { catalogRef } from '../../data/catalog';
import { COMPONENT_BY_ID } from '../../data/components';
import { HARDWARE_BY_TYPE } from '../../data/hardware';
import { PART_DRAG_TYPE } from '../../data/dnd';
import type { CatalogItem } from '../../types/robotics';
import { usePartThumbnail } from '../../three/partThumbnails';
import { Tooltip } from '../../design-system';
import type { Category, SceneParts } from './partsViews';

export const Thumb: React.FC<{ url?: string; className?: string }> = ({ url, className = '' }) => (
  <div className={`preview preview-sm ${className}`}>
    {url ? (
      <img src={url} alt="" draggable={false} className="w-full h-full object-contain p-0.5" />
    ) : (
      <div className="w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent)] bg-[length:200%_100%] animate-shimmer" />
    )}
  </div>
);

export function metaLine(item: CatalogItem): string {
  const c = item.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;

  if (c) return c.manufacturer;

  const h = item.hardware;

  if (h) return HARDWARE_BY_TYPE[h.type].description;

  const d = item.defaultDimensions;

  return `${d.width} × ${d.height} × ${d.depth} mm`;
}

export const dragProps = (item: CatalogItem) => ({
  draggable: true,
  onDragStart: (e: React.DragEvent) => {
    e.dataTransfer.setData(PART_DRAG_TYPE, catalogRef(item));
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
      className="w-7 h-7 rounded-full bg-[#0d99ff] text-white flex items-center justify-center cursor-default shadow-[0_2px_6px_rgba(0,0,0,0.4)] hover:bg-[#2ba5ff] active:scale-[0.94] transition-[background-color,transform] duration-150"
    >
      <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
    </button>
  </Tooltip>
);

export const ResultRow: React.FC<{
  item: CatalogItem;
  onOpen: () => void;
  onAdd: () => void;
  active?: boolean;
  onHover?: () => void;
  index?: number;
  count?: number;
}> = ({ item, onOpen, onAdd, active, onHover, index, count }) => {
  const thumb = usePartThumbnail(item);

  return (
    <div
      data-result={index}
      onPointerEnter={onHover}
      className={`group relative rounded-xl transition-colors ${active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.05]'}`}
      {...dragProps(item)}
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center gap-3 h-[52px] px-1.5 pr-11 text-left cursor-default"
      >
        <Thumb url={thumb} className="w-12 h-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-white/90 truncate">{item.name}</div>
          <div className="text-[12px] text-white/40 truncate">{metaLine(item)}</div>
        </div>
        {count !== undefined && count > 1 && (
          <span className="shrink-0 text-[12.5px] text-white/45 tabular">×{count}</span>
        )}
      </button>
      <AddButton
        onAdd={onAdd}
        className={`absolute right-2 top-1/2 -translate-y-1/2 transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      />
    </div>
  );
};

export const SceneRow: React.FC<{ scene: SceneParts; onOpen: () => void }> = ({ scene, onOpen }) => {
  const thumb = usePartThumbnail(scene.used[0]?.item ?? scene.related[0]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full flex items-center gap-3 h-[52px] px-1.5 rounded-xl text-left cursor-default hover:bg-white/[0.05] active:scale-[0.99] transition-[background-color,transform] duration-150"
    >
      <Thumb url={thumb} className="w-12 h-9 shrink-0" />
      <div className="min-w-0 flex-1 text-[13.5px] font-medium text-white/90 truncate">In this scene</div>
      <ChevronRight className="w-4 h-4 text-white/25 group-hover:text-white/50 shrink-0 transition-colors" />
    </button>
  );
};

export const CategoryRow: React.FC<{ category: Category; onOpen: () => void }> = ({ category, onOpen }) => {
  const thumb = usePartThumbnail(category.items[0]);
  const meta = category.family
    ? category.family.description
    : `${category.items.length} ${category.items.length === 1 ? 'part' : 'parts'}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full flex items-center gap-3 h-[52px] px-1.5 rounded-xl text-left cursor-default hover:bg-white/[0.05] active:scale-[0.99] transition-[background-color,transform] duration-150"
    >
      <Thumb url={thumb} className="w-12 h-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-white/90 truncate">{category.title}</div>
        <div className="text-[12px] text-white/40 truncate">{meta}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-white/25 group-hover:text-white/50 shrink-0 transition-colors" />
    </button>
  );
};
