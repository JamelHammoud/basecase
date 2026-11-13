import React, { useRef } from 'react';
import { toggleCameraViews, useCameraViewsState } from '../../cameras/cameraViewsStore';
import { OPERATOR_KEY, useOperatorCamera } from '../../cameras/operator/operatorCamera';
import { hasCameraViews } from '../../cameras/views';
import { ChevronDownIcon, ChevronUpIcon, IconButton } from '../../design-system';
import { CameraTile } from './CameraTile';
import { OperatorTile } from './OperatorTile';
import { useCameraTiles, type CameraTilesInput } from './useCameraTiles';

const ic = 'w-4 h-4';

export const CameraStrip: React.FC<Omit<CameraTilesInput, 'active'>> = (props) => {
  const { expanded, enlarged } = useCameraViewsState();
  const operator = useOperatorCamera();
  const present = operator.open || hasCameraViews(props.parts, props.cameras.cameras, props.sim.status !== 'off');
  const frameCounter = useRef<HTMLDivElement | null>(null);
  const tiles = useCameraTiles({
    ...props,
    active: () => present && expanded,
    onFrames: (frames) => {
      if (frameCounter.current) frameCounter.current.dataset.frames = String(frames);
    },
  });

  if (!present) return null;

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
      {expanded && operator.stream && (
        <OperatorTile stream={operator.stream} label={operator.label ?? ''} large={enlarged === OPERATOR_KEY} />
      )}
      {expanded && tiles.views.map((view) => <CameraTile key={view.key} {...tiles.tile(view)} />)}
      {tiles.menu}
    </div>
  );
};
