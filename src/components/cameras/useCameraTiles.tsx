import type { ImportedWorldView } from '../../three/viewport/importedWorld';
import React, { useState } from 'react';
import { enlargeCameraView, useCameraViewsState } from '../../cameras/cameraViewsStore';
import { useCameraFeed } from '../../cameras/useCameraFeed';
import { cameraViews, stripParts, type CameraView } from '../../cameras/views';
import { cameraStream, type CameraStream } from '../../cameras/cameraStream';
import { useVisionScope } from '../../cameras/visionScope';
import { ContextMenu, type ContextMenuEntry } from '../../design-system';
import type { Simulation } from '../../sim/useSimulation';
import type { ScenePart } from '../../types/robotics';
import type { FixedCameras } from '../../workspace/useFixedCameras';
import { cameraMenu } from './cameraMenu';
import type { ConsoleRegions } from '../../cases/console/regions';
import { useCaseRegions } from '../../workspace/useCaseRegions';
import type { RegionKind } from './RegionDraw';
import { regionEntries, type RegionEditing } from './regionMenu';
import type { CameraTileProps } from './CameraTile';

export interface CameraTilesInput {
  parts: ScenePart[];
  imported?: ImportedWorldView | null;
  sim: Pick<Simulation, 'status' | 'model' | 'worldParts' | 'connectCameras'>;
  cameras: FixedCameras;
  patchPart: (id: string, patch: Partial<ScenePart>) => void;
  active: (views: CameraView[]) => boolean;
  onFrames?: (frames: number) => void;
  regions?: RegionEditing;
  declared?: ConsoleRegions;
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
  const scope = useVisionScope();
  const { recordedCanvasRef, streamRecordedCamera, useRecordedCameraViews } = scope.playback;
  const { parts, sim, cameras, patchPart, active, onFrames, regions, declared } = input;
  const { enlarged } = useCameraViewsState();
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<{ camera: string; kind: RegionKind } | null>(null);
  const solid = stripParts(parts);
  const recorded = useRecordedCameraViews();
  const recordedKeys = new Set(recorded.map((view) => view.key));
  const simulated = cameraViews(solid, sim.worldParts, cameras.cameras).filter((view) => !recordedKeys.has(view.key));
  const views = [...recorded, ...simulated];

  useCaseRegions(scope, declared, [...recordedKeys]);

  const feed = useCameraFeed({
    active: active(views),
    parts: solid,
    imported: input.imported,
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
      vision: recordedKeys.has(view.key) ? scope.recorded : scope.simulated,
      large: enlarged === view.key,
      renaming: renaming === view.key,
      onRename: (name) => rename(view, name),
      canvasRef: recordedKeys.has(view.key)
        ? (canvas) => recordedCanvasRef(view.key, canvas)
        : feed.canvasRef(view.key),
      onToggleSize: () => enlargeCameraView(view.key),
      drawing:
        regions && drawing?.camera === view.key
          ? {
              kind: drawing.kind,
              onLine: (from, to) => {
                setDrawing(null);
                regions.drawLine(view.key, from, to);
              },
              onZone: (points) => {
                setDrawing(null);
                regions.drawZone(view.key, points);
              },
              onCancel: () => setDrawing(null),
            }
          : undefined,
      onMenu: (x, y) => {
        const items = [
          ...(view.recorded ? [] : cameraMenu(view, actions)),
          ...(regions ? regionEntries(view.key, regions, (kind) => setDrawing({ camera: view.key, kind })) : []),
        ];

        if (items.length) setMenu({ x, y, items });
      },
    }),
    menu: menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />,
    stream: cameraStream({
      views,
      feed: (stream) =>
        recordedKeys.has(stream.key)
          ? streamRecordedCamera(
              stream.key,
              { width: stream.size[0], height: stream.size[1], fps: stream.fps },
              stream.onFrame,
            )
          : feed.stream(stream),
    }),
  };
}
