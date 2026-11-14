import { useRef, useState } from 'react';
import type { Snap } from '../agent/snap';
import { catalogItemFromKey } from '../data/catalog';
import { MODEL_DRAG_TYPE, PART_DRAG_TYPE, ROBOT_DRAG_TYPE, SIMREADY_DRAG_TYPE, isSceneDrag } from '../data/dnd';
import { isMidiFileName, loadMidiSong } from '../midi/midiSource';
import { hasPrimaryModifier } from '../utils/os';
import { showRoomCase, showWorldCase } from './caseCommands';
import { droppedPart } from './dropPreview';
import { droppedFolders, type DroppedFolder } from './droppedFolders';
import { isImageType } from './importRoute';
import { hasWorldFile, readDroppedWorld } from './worldImport';
import { registerWorldAsset } from '../cases/worldAssets';
import { errorMessage } from '../utils/errorMessage';
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

export function useCanvasDrop(core: WorkspaceCore, { creation, robots, files }: WorkspaceActions) {
  const { viewportRef, studio, showToast, parts } = core;
  const [dragging, setDragging] = useState<'images' | 'files' | null>(null);
  const snapRef = useRef<Snap | null>(null);
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
    const place = snapRef.current?.placement;

    if (item) addCatalogItem(item, at, place);
    else if (model) placeCustomModel(model, at, place);
    else if (robot) dropRobot(robot, at);
    else if (simready) dropSimReady(simready, at);

    return true;
  };

  const openWorld = async (all: File[]) => {
    try {
      const prepared = await readDroppedWorld(all);

      if (prepared.kind === 'room') return showRoomCase(core, prepared.room);

      const asset = { world: prepared.world, pieces: prepared.pieces };

      registerWorldAsset(prepared.hash, asset, prepared.serializedJson);
      showWorldCase(core, prepared.hash, asset);
    } catch (error) {
      showToast(errorMessage(error), { tone: 'error' });
    }
  };

  const routeFiles = async (all: File[], at?: Vec3, folders?: DroppedFolder[]) => {
    const midi = all.filter((file) => isMidiFileName(file.name));
    const remaining = all.filter((file) => !midi.includes(file));

    await Promise.all(
      midi.map(async (file) => {
        try {
          loadMidiSong(new Uint8Array(await file.arrayBuffer()));
        } catch {
          showToast(`Couldn’t import ${file.name}.`, { tone: 'error' });
        }
      }),
    );

    if (hasWorldFile(remaining)) await openWorld(remaining);
    else files.importFiles({ files: remaining, at, folders });
  };

  const dropFiles = async (e: React.DragEvent) => {
    const at = dropPoint(viewportRef.current?.pickAt(e.clientX, e.clientY), studio.snapStepMm);
    const { folders, plain } = droppedFolders(e.dataTransfer.items);

    await routeFiles(plain, at, await folders);
  };

  const previewSnap = (e: React.DragEvent | null) => {
    const viewport = viewportRef.current;
    const at = e ? dropPoint(viewport?.pickAt(e.clientX, e.clientY), studio.snapStepMm) : undefined;
    const mover = e && droppedPart({ types: e.dataTransfer.types, parts, models: studio.customModels, at });

    snapRef.current = viewport?.previewSnap(mover, !!e && hasPrimaryModifier(e)) ?? null;
  };

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (isSceneDrag(e.dataTransfer.types)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        previewSnap(e);

        return;
      }

      if (!e.dataTransfer.types.includes('Files')) return;

      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDragging(onlyImages(e.dataTransfer.items) ? 'images' : 'files');
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget !== e.target && e.currentTarget.contains(e.relatedTarget as Node)) return;

      setDragging(null);
      previewSnap(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(null);

      if (!dropSceneItem(e)) void dropFiles(e);

      previewSnap(null);
    },
  };

  return { isDraggingFile: dragging !== null, imagesOnly: dragging === 'images', dropHandlers, routeFiles };
}
