import React, { useState } from 'react';
import { enlargeCameraView, useCameraViewsState } from '../../cameras/cameraViewsStore';
import { useCameraFeed } from '../../cameras/useCameraFeed';
import { cameraViews, findView, stripParts, type CameraView } from '../../cameras/views';
import { cameraStream, type CameraStream } from '../../cameras/cameraStream';
import { recordedCanvasRef, streamRecordedCamera, useRecordedCameraViews } from '../../cameras/recordedCameras';
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
  const { parts, sim, cameras, patchPart, active, onFrames } = input;
  const { enlarged } = useCameraViewsState();
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const solid = stripParts(parts);
  const recorded = useRecordedCameraViews();
  const recordedKeys = new Set(recorded.map((view) => view.key));
  const simulated = cameraViews(solid, sim.worldParts, cameras.cameras).filter((view) => !recordedKeys.has(view.key));
  const views = [...recorded, ...simulated];
  const feed = useCameraFeed({
    active: active(views),
    parts: solid,
    world: shownWorld(sim.worldParts),
    model: sim.model,
    views: simulated,
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
      canvasRef: recordedKeys.has(view.key)
        ? (canvas) => recordedCanvasRef(view.key, canvas)
        : feed.canvasRef(view.key),
      onToggleSize: () => enlargeCameraView(view.key),
      onMenu: (x, y) => {
        if (!view.recorded) setMenu({ x, y, items: cameraMenu(view, actions) });
      },
    }),
    menu: menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />,
    stream: (camera, ask, onFrame) => {
      const view = findView(recorded, camera);

      if (view) return streamRecordedCamera(view.key, ask, onFrame);

      return cameraStream({ views: simulated, feed: feed.stream })(camera, ask, onFrame);
    },
  };
}
