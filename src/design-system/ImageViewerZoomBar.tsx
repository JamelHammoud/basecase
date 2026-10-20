import React from 'react';
import { CloseIcon, FitIcon, MinusIcon, PlusIcon } from './glyphs';
import { IconButton } from './IconButton';
import { IslandDivider } from './FloatingIsland';

interface ImageViewerZoomBarProps {
  percent: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
  onClose: () => void;
}

export const ImageViewerZoomBar: React.FC<ImageViewerZoomBarProps> = ({
  percent,
  onZoomOut,
  onZoomIn,
  onFit,
  onClose,
}) => (
  <div className="absolute top-3 left-3 right-3 flex items-start justify-end gap-3 pointer-events-none">
    <div className="glass rounded-[16px] h-10 px-1 flex items-center gap-0.5 pointer-events-auto">
      <IconButton
        icon={<MinusIcon className="w-4 h-4" />}
        title="Zoom out"
        shortcut="−"
        size="sm"
        tooltipSide="bottom"
        onClick={onZoomOut}
      />
      <button
        type="button"
        onClick={onFit}
        className="h-8 min-w-14 px-1.5 rounded-lg text-[13px] text-white/80 tabular hover:bg-white/[0.07] cursor-default"
        aria-label="Zoom to fit"
      >
        {percent}%
      </button>
      <IconButton
        icon={<PlusIcon className="w-4 h-4" />}
        title="Zoom in"
        shortcut="+"
        size="sm"
        tooltipSide="bottom"
        onClick={onZoomIn}
      />
      <IconButton
        icon={<FitIcon className="w-4 h-4" />}
        title="Zoom to fit"
        shortcut="0"
        size="sm"
        tooltipSide="bottom"
        onClick={onFit}
      />
      <IslandDivider />
      <IconButton
        icon={<CloseIcon className="w-4 h-4" />}
        title="Close"
        shortcut="Esc"
        size="sm"
        tooltipSide="bottom"
        onClick={onClose}
      />
    </div>
  </div>
);
