import { useRef } from 'react';
import { ARTICULATED_PARTS } from '../data/articulatedParts';
import {
  buildBufferGeometryFromSculptData,
  createSculptClayPreset,
  extractSculptDataFromGeometry,
  tessellateGeometryForSculpting,
} from '../three/sculptEngine';
import type { CatalogItem, CustomModelDefinition, ScenePart } from '../types/robotics';
import { readImageFile } from '../utils/imageFile';
import { cadPartsFromFile } from './cadImport';
import { couldntImport, isCadFileName } from './importRoute';
import { meshPartFromFile } from './meshImport';
import { modelToParts } from '../utils/libraryParts';
import type { SnapPlacement } from '../agent/snap';
import { modelBase, withPlacement } from './dropPreview';
import { newId } from './helpers';
import { catalogPart, clayPart, imagePlanePart, sketchPart, type ClayPreset, type SketchParams } from './partFactories';
import type { Vec3 } from './types';
import type { RobotInsert } from './useRobotInsert';
import type { WorkspaceCore } from './useWorkspaceCore';
import { errorMessage } from '../utils/errorMessage';
import { plural } from '../../electron/plural.mjs';

const IMAGE_STEP = 16;

function useReferenceImages(core: WorkspaceCore) {
  const { docs, setSelectedIds, tool, showToast } = core;
  const { commitParts } = docs;
  const { setTransformMode } = tool;
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imagePlaceRef = useRef<Vec3 | null>(null);

  const addImagePlane = async (file: Blob, name = 'Reference', at?: Vec3 | null) => {
    try {
      const { dataUrl, width, height } = await readImageFile(file);
      const id = newId('image');

      commitParts((prev) => {
        const existing = prev.filter((p) => p.kind === 'image_plane').length;

        return [...prev, imagePlanePart({ id, name, dataUrl, width, height, at, existing })];
      });
      setSelectedIds([id]);
      setTransformMode('translate');
    } catch (err) {
      showToast(`Couldn’t add image. ${errorMessage(err)}`, { tone: 'error' });
    }
  };

  const pickReferenceImage = (at?: Vec3 | null) => {
    imagePlaceRef.current = at ?? null;
    imageInputRef.current?.click();
  };

  const addPickedImages = (files: File[]) => {
    files.forEach((f, i) => {
      const at = imagePlaceRef.current;

      void addImagePlane(f, f.name, at ? [at[0] + i * IMAGE_STEP, 0, at[2]] : null);
    });
  };

  return { imageInputRef, addImagePlane, pickReferenceImage, addPickedImages };
}

function useSculptCreation(core: WorkspaceCore) {
  'use memo';

  const { docs, setSelectedIds, tool, showToast, selection } = core;
  const { commitParts } = docs;
  const { setTransformMode } = tool;

  const addClayPreset = (preset: ClayPreset) => {
    const id = newId('clay');

    commitParts((prev) => [...prev, clayPart(preset, id, createSculptClayPreset(preset))]);
    setSelectedIds([id]);
    setTransformMode('sculpt');
  };

  const subdivideSelectedClay = () => {
    const part = selection.selectedPart;

    if (!part?.sculptMesh) return;

    const { width, height, depth } = part.dimensions;
    const geom = buildBufferGeometryFromSculptData(part.sculptMesh, width, height, depth);
    const subdivided = extractSculptDataFromGeometry(tessellateGeometryForSculpting(geom), width, height, depth);
    const selectedId = selection.selectedPartId;

    commitParts((prev) =>
      prev.map((p) => (p.id === selectedId ? { ...p, kind: 'sculpt_mesh', sculptMesh: subdivided } : p)),
    );
    showToast(`Subdivided to ${Math.round(subdivided.positions.length / 3).toLocaleString()} vertices`);
  };

  return { addClayPreset, subdivideSelectedClay };
}

const MESH_STEP = 40;

const partsFromFile = async (file: File, at: Vec3 | null): Promise<ScenePart[]> =>
  isCadFileName(file.name)
    ? cadPartsFromFile({ file, at, newId })
    : [await meshPartFromFile({ file, id: newId('mesh'), at })];

function useMeshImport(core: WorkspaceCore) {
  'use memo';

  const { docs, setSelectedIds, tool, showToast, toasts } = core;

  const importMeshes = async (files: File[], at?: Vec3 | null) => {
    if (files.length === 0) return;

    const label = files.length === 1 ? files[0].name : plural(files.length, 'mesh', 'meshes');

    showToast(`Importing ${label}…`, { tone: 'progress' });

    const results = await Promise.allSettled(
      files.map((file, i) => partsFromFile(file, at ? [at[0] + i * MESH_STEP, at[1], at[2]] : null)),
    );
    const imported = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    const parts = imported.flat();
    const failed = files.filter((_, i) => results[i].status === 'rejected');

    if (parts.length > 0) {
      docs.commitParts((prev) => [...prev, ...parts]);
      setSelectedIds(parts.map((p) => p.id));
      tool.setTransformMode('translate');
    }

    if (failed.length > 0) {
      showToast(couldntImport(failed), { tone: 'error' });

      return;
    }

    toasts.dismissToast();
  };

  return { importMeshes };
}

export function usePartCreation(core: WorkspaceCore, robots: RobotInsert) {
  const { docs, setSelectedIds, showToast } = core;
  const { commitParts } = docs;
  const { addArticulated } = robots;
  const images = useReferenceImages(core);
  const sculpt = useSculptCreation(core);
  const meshes = useMeshImport(core);

  const addCatalogPart = (item: CatalogItem, at?: Vec3, place?: SnapPlacement) => {
    const id = newId();

    commitParts((prev) => [...prev, withPlacement(catalogPart(item, id, prev, at), place)]);
    setSelectedIds([id]);
  };

  const addCatalogItem = (item: CatalogItem, at?: Vec3, place?: SnapPlacement) => {
    if (item.componentId && ARTICULATED_PARTS[item.componentId]) {
      void addArticulated(item, at, () => addCatalogPart(item, at));

      return;
    }

    addCatalogPart(item, at, place);
  };

  const placeCustomModel = (model: CustomModelDefinition, at?: Vec3, place?: SnapPlacement) => {
    const made = modelToParts(model, modelBase(model, at), newId);
    const { missingShapes } = made;
    const inserted = made.parts.length === 1 ? [withPlacement(made.parts[0], place)] : made.parts;

    commitParts((prev) => [...prev, ...inserted]);
    setSelectedIds(inserted.map((p) => p.id));

    if (missingShapes) {
      showToast(`Inserted ${model.name} as blocks. Save it to Library again from a scene to keep its CAD shapes.`, {
        tone: 'error',
      });
    }
  };

  const createFromSketch = (params: SketchParams) => {
    const id = newId();

    commitParts((prev) => [...prev, sketchPart(params, id)]);
    setSelectedIds([id]);
  };

  return { ...images, ...sculpt, ...meshes, addCatalogItem, placeCustomModel, createFromSketch };
}

export type PartCreation = ReturnType<typeof usePartCreation>;
