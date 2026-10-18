import { useState } from 'react';
import { catalogItemFromKey } from '../data/catalog';
import { MODEL_DRAG_TYPE, PART_DRAG_TYPE, ROBOT_DRAG_TYPE, isSceneDrag } from '../data/dnd';
import type { Vec3 } from './types';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

const IMAGE_STEP = 16;

type Hit = { partId: string | null; point: Vec3 } | null | undefined;

export function dropPoint(hit: Hit, snapStepMm: number): Vec3 | undefined {
  if (!hit) return undefined;

  const snap = (v: number) => (snapStepMm > 0 ? Math.round(v / snapStepMm) * snapStepMm : Math.round(v));

  return [snap(hit.point[0]), hit.partId ? Math.max(0, hit.point[1]) : 0, snap(hit.point[2])];
}

function parseRobotDrag(data: string) {
  try {
    return JSON.parse(data) as { url: string; name?: string };
  } catch {
    return null;
  }
}

export function useCanvasDrop({ viewportRef, studio }: WorkspaceCore, { creation, robots }: WorkspaceActions) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const { importRobotFrom } = robots;
  const { addCatalogItem, placeCustomModel, addImagePlane } = creation;

  const dropRobot = (data: string, at: Vec3 | undefined) => {
    const drag = parseRobotDrag(data);

    if (drag) void importRobotFrom({ kind: 'url', url: drag.url, name: drag.name }, at ?? [0, 0, 0]);
  };

  const dropSceneItem = (e: React.DragEvent) => {
    const partKind = e.dataTransfer.getData(PART_DRAG_TYPE);
    const modelId = e.dataTransfer.getData(MODEL_DRAG_TYPE);
    const robot = e.dataTransfer.getData(ROBOT_DRAG_TYPE);

    if (!partKind && !modelId && !robot) return false;

    const at = dropPoint(viewportRef.current?.pickAt(e.clientX, e.clientY), studio.snapStepMm);
    const item = partKind ? catalogItemFromKey(partKind) : undefined;
    const model = studio.customModels.find((m) => m.id === modelId);

    if (item) addCatalogItem(item, at);
    else if (model) placeCustomModel(model, at);
    else if (robot) dropRobot(robot, at);

    return true;
  };

  const dropImages = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    const hit = viewportRef.current?.pickAt(e.clientX, e.clientY);

    files.forEach((f, i) => {
      const at: Vec3 | null = hit ? [hit.point[0] + i * IMAGE_STEP, 0, hit.point[2]] : null;

      void addImagePlane(f, f.name, at);
    });
  };

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (isSceneDrag(e.dataTransfer.types)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';

        return;
      }

      if (!e.dataTransfer.types.includes('Files')) return;

      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDraggingFile(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingFile(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingFile(false);

      if (!dropSceneItem(e)) dropImages(e);
    },
  };

  return { isDraggingFile, dropHandlers };
}
