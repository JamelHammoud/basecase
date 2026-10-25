import React, { useRef, useState } from 'react';
import { PART_CATALOG } from '../data/catalog';
import { useCatalogThumbnails } from '../three/useCatalogThumbnails';
import { PART_DRAG_TYPE } from '../data/dnd';
import { CatalogItem, TransformMode } from '../types/robotics';
import {
  FloatingIsland,
  IconButton,
  IslandDivider,
  MenuDivider,
  MenuItem,
  PopoverMenu,
  Tooltip,
  BrushIcon,
  ChevronUpIcon,
  CommentIcon,
  FileImportIcon,
  MarkerIcon,
  MoveIcon,
  PenIcon,
  RotateIcon,
  RulerIcon,
  ScaleIcon,
  ShapesIcon,
} from '../design-system';

const BASIC_SHAPES = PART_CATALOG.filter((c) => c.category === 'primitives');
const ICON = 'w-[22px] h-[22px]';

interface ViewportToolbarProps {
  transformMode: TransformMode;
  onTransformMode: (mode: TransformMode) => void;
  showSculpt: boolean;
  commentMode: boolean;
  onMeasure: () => void;
  marking: boolean;
  onAnnotate: () => void;
  onToggleComment: () => void;
  shapesOpen: boolean;
  onShapesOpenChange: (open: boolean) => void;
  onAddShape: (item: CatalogItem) => void;
  onSketch: () => void;
  onImportSvg: () => void;
}

export const ViewportToolbar: React.FC<ViewportToolbarProps> = ({
  transformMode,
  onTransformMode,
  showSculpt,
  commentMode,
  onMeasure,
  marking,
  onAnnotate,
  onToggleComment,
  shapesOpen,
  onShapesOpenChange,
  onAddShape,
  onSketch,
  onImportSvg,
}) => {
  const shapesRef = useRef<HTMLDivElement | null>(null);
  const [draggingShape, setDraggingShape] = useState(false);

  const tools: Array<{ mode: TransformMode; icon: React.ReactNode; label: string; key: string }> = [
    { mode: 'translate', icon: <MoveIcon className={ICON} />, label: 'Move', key: 'V' },
    { mode: 'rotate', icon: <RotateIcon className={ICON} />, label: 'Rotate', key: 'E' },
    { mode: 'scale', icon: <ScaleIcon className={ICON} />, label: 'Scale', key: 'R' },
    ...(showSculpt
      ? [{ mode: 'sculpt' as const, icon: <BrushIcon className={ICON} />, label: 'Sculpt', key: 'C' }]
      : []),
  ];

  return (
    <FloatingIsland className="p-1.5 gap-1 rounded-[20px]">
      {tools.map((t) => (
        <IconButton
          key={t.mode}
          icon={t.icon}
          title={t.label}
          shortcut={t.key}
          tooltipSide="top"
          size="lg"
          isActive={!commentMode && !marking && transformMode === t.mode}
          onClick={() => onTransformMode(t.mode)}
        />
      ))}
      <IconButton
        icon={<CommentIcon className={ICON} />}
        title="Comment"
        shortcut="M"
        tooltipSide="top"
        size="lg"
        isActive={commentMode}
        onClick={onToggleComment}
      />

      <IslandDivider />

      <div className="relative" ref={shapesRef}>
        <MenuTrigger
          title="Shapes"
          shortcut="A"
          open={shapesOpen}
          onClick={() => onShapesOpenChange(!shapesOpen)}
          icon={<ShapesIcon className={ICON} />}
          size="lg"
        />
        <PopoverMenu
          isOpen={shapesOpen}
          onClose={() => onShapesOpenChange(false)}
          ignoreRef={shapesRef}
          className={`w-[344px] [--pad-x:8px] transition-opacity duration-150 ${draggingShape ? 'opacity-0 pointer-events-none' : ''}`}
        >
          <ShapeGrid
            onPick={(item) => {
              onAddShape(item);
              onShapesOpenChange(false);
            }}
            onDragStart={() => setDraggingShape(true)}
            onDragEnd={() => {
              setDraggingShape(false);
              onShapesOpenChange(false);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon={<PenIcon className="w-4 h-4" />}
            label="Sketch"
            onSelect={() => {
              onShapesOpenChange(false);
              onSketch();
            }}
          />
          <MenuItem
            icon={<RulerIcon className="w-4 h-4" />}
            label="Measure"
            shortcut="D"
            onSelect={() => {
              onShapesOpenChange(false);
              onMeasure();
            }}
          />
          <MenuItem
            icon={<MarkerIcon className="w-4 h-4" />}
            label="Annotate"
            shortcut="N"
            onSelect={() => {
              onShapesOpenChange(false);
              onAnnotate();
            }}
          />
          <MenuItem
            icon={<FileImportIcon className="w-4 h-4" />}
            label="Import SVG"
            onSelect={() => {
              onShapesOpenChange(false);
              onImportSvg();
            }}
          />
        </PopoverMenu>
      </div>
    </FloatingIsland>
  );
};

const ShapeGrid: React.FC<{
  onPick: (item: CatalogItem) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}> = ({ onPick, onDragStart, onDragEnd }) => {
  const thumbs = useCatalogThumbnails(BASIC_SHAPES);

  return (
    <div className="grid grid-cols-4 gap-1">
      {BASIC_SHAPES.map((item) => (
        <button
          key={item.kind}
          type="button"
          onClick={() => onPick(item)}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(PART_DRAG_TYPE, item.kind);
            e.dataTransfer.effectAllowed = 'copy';

            const img = e.currentTarget.querySelector('img');

            if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);

            requestAnimationFrame(onDragStart);
          }}
          onDragEnd={onDragEnd}
          className="group rounded-xl p-1 pb-1.5 flex flex-col items-center gap-1 cursor-default hover:bg-white/[0.07] active:scale-[0.96] transition-[background-color,transform]"
        >
          <span className="w-full aspect-square rounded-lg bg-white/[0.04] overflow-hidden">
            {thumbs[item.kind] && (
              <img
                src={thumbs[item.kind]}
                alt=""
                draggable={false}
                className="w-full h-full object-contain scale-[1.15] transition-transform duration-300 group-hover:scale-[1.25]"
              />
            )}
          </span>
          <span className="text-[12px] text-white/75 group-hover:text-white truncate max-w-full">{item.name}</span>
        </button>
      ))}
    </div>
  );
};

const MenuTrigger: React.FC<{
  title: string;
  shortcut?: string;
  open: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  size?: 'md' | 'lg';
}> = ({ title, shortcut, open, onClick, icon, size = 'md' }) => (
  <Tooltip label={title} shortcut={shortcut} side={size === 'lg' ? 'top' : 'left'}>
    <button
      type="button"
      aria-label={title}
      aria-expanded={open}
      onClick={onClick}
      className={`${
        size === 'lg' ? 'h-11 pl-3 pr-1.5 rounded-[14px]' : 'w-9 h-9 justify-center rounded-[10px]'
      } flex items-center gap-0.5 cursor-default transition-colors active:scale-[0.96] ${
        open ? 'bg-white/[0.1] text-white' : 'text-white/60 hover:text-white/95 hover:bg-white/[0.07]'
      }`}
    >
      {icon}
      {size === 'lg' && (
        <ChevronUpIcon
          className={`w-3.5 h-3.5 opacity-50 transition-transform duration-200 ${open ? '' : 'rotate-180'}`}
        />
      )}
    </button>
  </Tooltip>
);
