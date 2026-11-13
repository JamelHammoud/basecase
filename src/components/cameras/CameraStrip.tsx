import React, { useRef } from 'react';
import { toggleCameraViews, useCameraViewsState } from '../../cameras/cameraViewsStore';
import { ChevronDownIcon, ChevronUpIcon, IconButton } from '../../design-system';
import { CameraTile } from './CameraTile';
import { useCameraTiles, type CameraTilesInput } from './useCameraTiles';

const ic = 'w-4 h-4';

export const CameraStrip: React.FC<Omit<CameraTilesInput, 'active'>> = (props) => {
  const { expanded } = useCameraViewsState();
  const { sim } = props;
  const hasCamera = (views: { part: string | null }[]) => props.cameras.cameras.length > 0 || views.some((v) => v.part);
  const present = (views: { part: string | null }[]) => sim.status !== 'off' || hasCamera(views);
  const frameCounter = useRef<HTMLDivElement | null>(null);
  const tiles = useCameraTiles({
    ...props,
    active: (views) => present(views) && expanded,
    onFrames: (frames) => {
      if (frameCounter.current) frameCounter.current.dataset.frames = String(frames);
    },
  });

  if (!present(tiles.views)) return null;

  return (
    <div
      ref={frameCounter}
      data-testid="camera-strip"
      className="absolute left-3 top-3 z-20 flex flex-col items-start gap-2"
    >
      <div className="flex items-center gap-1 rounded-[10px] bg-[#262626] py-1 pl-3 pr-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
        <span className="text-[13px] font-medium text-white/85">Cameras</span>
        <IconButton
          icon={expanded ? <ChevronUpIcon className={ic} /> : <ChevronDownIcon className={ic} />}
          title={expanded ? 'Collapse' : 'Expand'}
          shortcut="⇧V"
          tooltipSide="right"
          onClick={toggleCameraViews}
        />
      </div>
      {expanded && tiles.views.map((view) => <CameraTile key={view.key} {...tiles.tile(view)} />)}
      {tiles.menu}
    </div>
  );
};
