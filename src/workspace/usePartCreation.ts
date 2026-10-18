import { useRef } from 'react';
import { ARTICULATED_PARTS } from '../data/articulatedParts';
import {
  buildBufferGeometryFromSculptData,
  createSculptClayPreset,
  extractSculptDataFromGeometry,
  tessellateGeometryForSculpting,
} from '../three/sculptAndBooleanEngine';
import type { CatalogItem, CustomModelDefinition } from '../types/robotics';
import { readImageFile } from '../utils/imageFile';
import { modelToParts } from '../utils/libraryParts';
import { platformBridge } from '../utils/platformBridge';
import { modelId, newId, stamp } from './helpers';
import {
  CLAY_LABELS,
  PRINTED_TAG,
  catalogItemLabel,
  catalogPart,
  clayPart,
  imagePlanePart,
  sketchDescription,
  sketchDimensions,
  sketchPart,
  type ClayPreset,
  type SketchParams,
} from './partFactories';
import type { Vec3 } from './types';
import type { RobotInsert } from './useRobotInsert';
import type { WorkspaceCore } from './useWorkspaceCore';

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
      showToast('Added reference image');
    } catch (err) {
      showToast(`Couldn’t add image. ${String((err as Error).message ?? err)}`, { tone: 'error' });
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
    showToast(`Added ${CLAY_LABELS[preset]}. Drag on it to sculpt.`);
  };

  const subdivideSelectedClay = () => {
    const part = selection.selectedPart;

    if (!part) return;

    const { width, height, depth } = part.dimensions;
    const geom = buildBufferGeometryFromSculptData(
      part.sculptMesh || createSculptClayPreset('clay_sphere'),
      width,
      height,
      depth,
    );
    const subdivided = extractSculptDataFromGeometry(tessellateGeometryForSculpting(geom), width, height, depth);
    const selectedId = selection.selectedPartId;

    commitParts((prev) =>
      prev.map((p) => (p.id === selectedId ? { ...p, kind: 'sculpt_mesh', sculptMesh: subdivided } : p)),
    );
    showToast(`Subdivided to ${Math.round(subdivided.positions.length / 3).toLocaleString()} vertices`);
  };

  return { addClayPreset, subdivideSelectedClay };
}

export function usePartCreation(core: WorkspaceCore, robots: RobotInsert) {
  const { docs, setSelectedIds, showToast, studio, viewportRef } = core;
  const { commitParts } = docs;
  const { setCustomModels } = studio;
  const { addArticulated } = robots;
  const images = useReferenceImages(core);
  const sculpt = useSculptCreation(core);

  const addCatalogPart = (item: CatalogItem, at?: Vec3) => {
    const id = newId();

    commitParts((prev) => [...prev, catalogPart(item, id, prev, at)]);
    setSelectedIds([id]);
    showToast(`Added ${catalogItemLabel(item)}`);
  };

  const addCatalogItem = (item: CatalogItem, at?: Vec3) => {
    if (item.componentId && ARTICULATED_PARTS[item.componentId]) {
      void addArticulated(item, at, () => addCatalogPart(item, at));

      return;
    }

    addCatalogPart(item, at);
  };

  const placeCustomModel = (model: CustomModelDefinition, at?: Vec3) => {
    const base: Vec3 = at
      ? [at[0], Math.round((at[1] + model.defaultDimensions.height / 2) * 10) / 10, at[2]]
      : [0, Math.round(model.defaultDimensions.height / 2), 0];
    const { parts: inserted, missingShapes } = modelToParts(model, base, newId);

    commitParts((prev) => [...prev, ...inserted]);
    setSelectedIds(inserted.map((p) => p.id));
    showToast(
      missingShapes
        ? `Inserted ${model.name} as blocks. Save it to Library again from a scene to keep its CAD shapes.`
        : `Inserted ${model.name}`,
      missingShapes ? { tone: 'error' } : {},
    );
  };

  const createFromSketch = async (params: SketchParams) => {
    const id = newId();

    commitParts((prev) => [...prev, sketchPart(params, id)]);
    setSelectedIds([id]);

    if (!params.saveToLibrary) {
      showToast(`Added ${params.name}`);

      return;
    }

    await platformBridge.saveModel({
      id: modelId(),
      name: params.name,
      description: sketchDescription(params),
      createdAt: stamp(),
      sourceType: 'scene-selection',
      sourceImageDataUrl: params.svgDataUrl || viewportRef.current?.captureScreenshot(),
      defaultDimensions: sketchDimensions(params),
      defaultColor: params.color,
      mechanicalTag: PRINTED_TAG,
      nodes: params.nodes,
    });
    setCustomModels(await platformBridge.listModels());
    showToast(`Added ${params.name} and saved to Library`);
  };

  return { ...images, ...sculpt, addCatalogItem, placeCustomModel, createFromSketch };
}

export type PartCreation = ReturnType<typeof usePartCreation>;
