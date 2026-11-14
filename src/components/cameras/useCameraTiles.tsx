import React, { useState, useSyncExternalStore } from 'react';
import { enlargeCameraView, useCameraViewsState } from '../../cameras/cameraViewsStore';
import type { OpenCodeFrames } from '../../cameras/codeFrameTypes';
import { createFrameHub, type FrameHub } from '../../cameras/frameHub';
import { OPERATOR_KEY } from '../../cameras/operator/operatorCamera';
import { useCameraFeed } from '../../cameras/useCameraFeed';
import { cameraViews, findView, stripParts, type CameraView } from '../../cameras/views';
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
  active: (views: CameraView[], streaming: boolean) => boolean;
  tiles?: boolean;
  onFrames?: (frames: number) => void;
}

export interface CameraTiles {
  views: CameraView[];
  tile: (view: CameraView) => Omit<CameraTileProps, 'fill'>;
  menu: React.ReactNode;
  frames: OpenCodeFrames;
}

const OPERATOR_REFUSAL = 'names operator, which only a camera panel shows';

const openFrames =
  (hub: FrameHub, views: CameraView[]): OpenCodeFrames =>
  ({ camera, width, height, fps }) => {
    if (camera.trim().toLowerCase() === OPERATOR_KEY) return OPERATOR_REFUSAL;

    const view = findView(views, camera);

    if (!view) return `names ${camera}, which isn’t a camera here`;

    return hub.open({ key: view.key, width, height, fps });
  };

export function useCameraTiles(input: CameraTilesInput): CameraTiles {
  const { parts, sim, cameras, patchPart, active, tiles = true, onFrames } = input;
  const [hub] = useState(createFrameHub);
  const streaming = useSyncExternalStore(hub.subscribe, hub.count) > 0;
  const { enlarged } = useCameraViewsState();
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const solid = stripParts(parts);
  const views = cameraViews(solid, sim.worldParts, cameras.cameras);
  const canvasRef = useCameraFeed({
    active: active(views, streaming),
    tiles,
    hub,
    parts: solid,
    world: sim.worldParts,
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
      canvasRef: canvasRef(view.key),
      onToggleSize: () => enlargeCameraView(view.key),
      onMenu: (x, y) => setMenu({ x, y, items: cameraMenu(view, actions) }),
    }),
    menu: menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />,
    frames: openFrames(hub, views),
  };
}
