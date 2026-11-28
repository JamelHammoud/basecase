import { useRef } from 'react';
import { ARTICULATED_PARTS } from '../data/articulatedParts';
import {
  buildBufferGeometryFromSculptData,
  createSculptClayPreset,
  extractSculptDataFromGeometry,
  tessellateGeometryForSculpting,
} from '../three/sculptEngine';
import type { CatalogItem, CustomModelDefinition } from '../types/robotics';
import { readImageFile } from '../utils/imageFile';
import { bigCount } from '../../electron/bigCount.mjs';
import { modelToParts } from '../utils/libraryParts';
import type { SnapPlacement } from '../agent/snap';
import { modelBase, withPlacement } from './dropPreview';
import { newId } from './helpers';
import { catalogPart, clayPart, imagePlanePart, sketchPart, type ClayPreset, type SketchParams } from './partFactories';
import type { Vec3 } from './types';
import type { RobotInsert } from './useRobotInsert';
import type { WorkspaceCore } from './useWorkspaceCore';
import { errorMessage } from '../utils/errorMessage';
import { useMeshImport } from './useMeshImport';

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
    showToast(`Subdivided to ${bigCount(subdivided.positions.length / 3, 'vertex', 'vertices')}`);
  };

  return { addClayPreset, subdivideSelectedClay };
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
    let made: ReturnType<typeof modelToParts>;

    try {
      made = modelToParts(model, modelBase(model, at), newId);
    } catch (error) {
      showToast(errorMessage(error), { tone: 'error' });

      return;
    }

    const { missingShapes } = made;
    const inserted = made.parts.length === 1 ? [withPlacement(made.parts[0], place)] : made.parts;

    commitParts((prev) => [...prev, ...inserted]);
    docs.updateProjectNow((project) => ({ ...project, joints: [...(project.joints ?? []), ...made.joints] }));
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
