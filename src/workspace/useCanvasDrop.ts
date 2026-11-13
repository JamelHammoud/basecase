import { useState } from 'react';
import { catalogItemFromKey } from '../data/catalog';
import { MODEL_DRAG_TYPE, PART_DRAG_TYPE, ROBOT_DRAG_TYPE, SIMREADY_DRAG_TYPE, isSceneDrag } from '../data/dnd';
import { droppedFolders } from './droppedFolders';
import { isImageType } from './importRoute';
import type { Vec3 } from './types';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

type Hit = { partId: string | null; point: Vec3 } | null | undefined;

export function dropPoint(hit: Hit, snapStepMm: number): Vec3 | undefined {
  if (!hit) return undefined;

  const snap = (v: number) => (snapStepMm > 0 ? Math.round(v / snapStepMm) * snapStepMm : Math.round(v));

  return [snap(hit.point[0]), hit.partId ? Math.max(0, hit.point[1]) : 0, snap(hit.point[2])];
}

const onlyImages = (items: DataTransferItemList) =>
  Array.from(items).every((item) => item.kind === 'file' && isImageType(item.type));

function parseDrag<T>(data: string) {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export function useCanvasDrop({ viewportRef, studio }: WorkspaceCore, { creation, robots, files }: WorkspaceActions) {
  const [dragging, setDragging] = useState<'images' | 'files' | null>(null);
  const { importRobotFrom } = robots;
  const { addCatalogItem, placeCustomModel } = creation;

  const dropRobot = (data: string, at: Vec3 | undefined) => {
    const drag = parseDrag<{ url: string; name?: string }>(data);

    if (drag) void importRobotFrom({ kind: 'url', url: drag.url, name: drag.name }, at ?? [0, 0, 0]);
  };

  const dropSimReady = (data: string, at: Vec3 | undefined) => {
    const asset = parseDrag<{ url: string; name: string; maker: string; license: string }>(data);

    if (asset) void importRobotFrom({ kind: 'simready', asset }, at ?? [0, 0, 0]);
  };

  const dropSceneItem = (e: React.DragEvent) => {
    const partKind = e.dataTransfer.getData(PART_DRAG_TYPE);
    const modelId = e.dataTransfer.getData(MODEL_DRAG_TYPE);
    const robot = e.dataTransfer.getData(ROBOT_DRAG_TYPE);
    const simready = e.dataTransfer.getData(SIMREADY_DRAG_TYPE);

    if (!partKind && !modelId && !robot && !simready) return false;

    const at = dropPoint(viewportRef.current?.pickAt(e.clientX, e.clientY), studio.snapStepMm);
    const item = partKind ? catalogItemFromKey(partKind) : undefined;
    const model = studio.customModels.find((m) => m.id === modelId);

    if (item) addCatalogItem(item, at);
    else if (model) placeCustomModel(model, at);
    else if (robot) dropRobot(robot, at);
    else if (simready) dropSimReady(simready, at);

    return true;
  };

  const dropFiles = async (e: React.DragEvent) => {
    const at = dropPoint(viewportRef.current?.pickAt(e.clientX, e.clientY), studio.snapStepMm);
    const { folders, plain } = droppedFolders(e.dataTransfer.items);

    files.importFiles({ files: plain, at, folders: await folders });
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
      setDragging(onlyImages(e.dataTransfer.items) ? 'images' : 'files');
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(null);

      if (!dropSceneItem(e)) void dropFiles(e);
    },
  };

  return { isDraggingFile: dragging !== null, imagesOnly: dragging === 'images', dropHandlers };
}
