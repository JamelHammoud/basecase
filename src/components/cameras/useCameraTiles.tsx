import React, { useState } from 'react';
import { enlargeCameraView, useCameraViewsState } from '../../cameras/cameraViewsStore';
import { operatorCameraSnapshot } from '../../cameras/operator/operatorCamera';
import { streamOperator } from '../../cameras/operator/operatorStream';
import { useCameraFeed } from '../../cameras/useCameraFeed';
import { cameraViews, stripParts, type CameraView } from '../../cameras/views';
import { cameraStream, type CameraStream } from '../../cameras/cameraStream';
import { ContextMenu, type ContextMenuEntry } from '../../design-system';
import type { Simulation } from '../../sim/useSimulation';
import type { ScenePart } from '../../types/robotics';
import type { FixedCameras } from '../../workspace/useFixedCameras';
import { cameraMenu } from './cameraMenu';
import type { CameraTileProps } from './CameraTile';

export interface CameraTilesInput {
  parts: ScenePart[];
  sim: Pick<Simulation, 'status' | 'model' | 'worldParts' | 'connectCameras'>;
  cameras: FixedCameras;
  patchPart: (id: string, patch: Partial<ScenePart>) => void;
  active: (views: CameraView[]) => boolean;
  tiles?: boolean;
  onFrames?: (frames: number) => void;
}

export interface CameraTiles {
  views: CameraView[];
  tile: (view: CameraView) => Omit<CameraTileProps, 'fill'>;
  menu: React.ReactNode;
  stream: CameraStream;
}

const shownWorld = (world: ScenePart[]) =>
  world.some((p) => p.visible === false) ? world.filter((p) => p.visible !== false) : world;

export function useCameraTiles(input: CameraTilesInput): CameraTiles {
  const { parts, sim, cameras, patchPart, active, tiles, onFrames } = input;
  const { enlarged } = useCameraViewsState();
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const solid = stripParts(parts);
  const views = cameraViews(solid, sim.worldParts, cameras.cameras);
  const feed = useCameraFeed({
    active: active(views),
    tiles,
    parts: solid,
    world: shownWorld(sim.worldParts),
    model: sim.model,
    views,
    enlarged,
    connectCameras: sim.connectCameras,
    onFrames: (frames) => onFrames?.(frames),
  });
  const actions = {
    ...cameras,
    startRename: (view: CameraView) => setRenaming(view.key),
    setPartLens: (partId: string, lens: ScenePart['cameraLens']) => patchPart(partId, { cameraLens: lens }),
  };
  const rename = (view: CameraView, name: string | null) => {
    setRenaming(null);

    if (!name) return;

    if (view.fixed) cameras.rename(view.fixed, name);
    else if (view.part) patchPart(view.part, { name });
  };

  return {
    views,
    tile: (view) => ({
      view,
      large: enlarged === view.key,
      renaming: renaming === view.key,
      onRename: (name) => rename(view, name),
      canvasRef: feed.canvasRef(view.key),
      onToggleSize: () => enlargeCameraView(view.key),
      onMenu: (x, y) => setMenu({ x, y, items: cameraMenu(view, actions) }),
    }),
    menu: menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />,
    stream: cameraStream({
      views,
      feed: feed.stream,
      operator: streamOperator,
      operatorOpen: () => operatorCameraSnapshot().open,
    }),
  };
}
