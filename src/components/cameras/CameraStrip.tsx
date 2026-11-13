import React, { useRef, useState } from 'react';
import { enlargeCameraView, toggleCameraViews, useCameraViewsState } from '../../cameras/cameraViewsStore';
import { useCameraFeed } from '../../cameras/useCameraFeed';
import { cameraViews, hasCameraViews, stripParts, type CameraView } from '../../cameras/views';
import { ChevronDownIcon, ChevronUpIcon, ContextMenu, IconButton, type ContextMenuEntry } from '../../design-system';
import type { Simulation } from '../../sim/useSimulation';
import type { ScenePart } from '../../types/robotics';
import type { FixedCameras } from '../../workspace/useFixedCameras';
import { CameraTile } from './CameraTile';
import { cameraMenu } from './cameraMenu';

interface CameraStripProps {
  parts: ScenePart[];
  sim: Pick<Simulation, 'status' | 'model' | 'worldParts' | 'connectCameras'>;
  cameras: FixedCameras;
  patchPart: (id: string, patch: Partial<ScenePart>) => void;
}

const ic = 'w-4 h-4';

export const CameraStrip: React.FC<CameraStripProps> = ({ parts, sim, cameras, patchPart }) => {
  const { expanded, enlarged } = useCameraViewsState();
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const solid = stripParts(parts);
  const views = cameraViews(solid, sim.worldParts, cameras.cameras);
  const present = hasCameraViews(parts, cameras.cameras, sim.status !== 'off');
  const canvasRef = useCameraFeed({
    active: present && expanded,
    parts: solid,
    world: sim.worldParts,
    model: sim.model,
    views,
    enlarged,
    connectCameras: sim.connectCameras,
    onFrames: (frames) => {
      if (stripRef.current) stripRef.current.dataset.frames = String(frames);
    },
  });

  if (!present) return null;

  const actions = {
    ...cameras,
    startRename: (view: CameraView) => setRenaming(view.key),
    setPartLens: (partId: string, lens: ScenePart['cameraLens']) => patchPart(partId, { cameraLens: lens }),
  };
  const rename = (view: CameraView, name: string) => {
    setRenaming(null);

    if (!name || name === view.label) return;

    if (view.fixed) cameras.rename(view.fixed, name);
    else if (view.part) patchPart(view.part, { name });
  };

  return (
    <div
      ref={stripRef}
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
      {expanded &&
        views.map((view) => (
          <CameraTile
            key={view.key}
            view={view}
            large={enlarged === view.key}
            renaming={renaming === view.key}
            onRename={(name) => rename(view, name)}
            canvasRef={canvasRef(view.key)}
            onToggleSize={() => enlargeCameraView(view.key)}
            onMenu={(x, y) => setMenu({ x, y, items: cameraMenu(view, actions) })}
          />
        ))}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};
