import { catalogNote } from '../data/catalog';
import { hardwareName, hardwareNote } from '../data/hardware';
import type { CatalogItem, CustomModelSubNode, ScenePart, SculptMeshData } from '../types/robotics';
import type { Vec3 } from './types';

export type ClayPreset = 'clay_sphere' | 'clay_box' | 'clay_cylinder' | 'clay_capsule';

export interface SketchParams {
  name: string;
  mode: 'extrude' | 'revolve' | 'svg';
  widthMm: number;
  heightMm: number;
  depthMm: number;
  color: string;
  bevel: boolean;
  nodes: CustomModelSubNode[];
  svgDataUrl?: string;
  saveToLibrary: boolean;
}

const PRINTED_TAG = '3D Printed PLA/PETG';
const ORIGIN_RADIUS = 8;
const ORIGIN_STEP = 12;
const IMAGE_SIDE = 120;

const round2 = (v: number) => Math.round(v * 100) / 100;

export const catalogItemLabel = (item: CatalogItem) => (item.hardware ? hardwareName(item.hardware) : item.name);

function catalogPartName(item: CatalogItem, prev: ScenePart[]) {
  if (item.hardware) return hardwareName(item.hardware);

  const sameKind = prev.filter((p) => p.kind === item.kind && p.componentId === item.componentId).length;

  return sameKind === 0 ? item.name : `${item.name} ${sameKind + 1}`;
}

function catalogPosition(item: CatalogItem, prev: ScenePart[], at?: Vec3): Vec3 {
  const lift = item.defaultDimensions.height / 2;

  if (at) return [at[0], round2(at[1] + lift), at[2]];

  const atOrigin = prev.filter(
    (p) => Math.abs(p.position[0]) < ORIGIN_RADIUS && Math.abs(p.position[2]) < ORIGIN_RADIUS,
  ).length;
  const offset = atOrigin * ORIGIN_STEP;

  return [offset, round2(lift), offset];
}

export function catalogPart(item: CatalogItem, id: string, prev: ScenePart[], at?: Vec3): ScenePart {
  return {
    id,
    name: catalogPartName(item, prev),
    kind: item.kind,
    category: item.category,
    role: item.defaultRole,
    position: catalogPosition(item, prev, at),
    rotation: [0, 0, 0],
    dimensions: { ...item.defaultDimensions },
    color: item.defaultColor,
    note: item.hardware ? hardwareNote(item.hardware) : catalogNote(item),
    mechanicalTag: item.defaultTag,
    visible: true,
    locked: false,
    hardware: item.hardware,
    componentId: item.componentId,
  };
}

export interface ImagePlaneInput {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  at?: Vec3 | null;
  existing: number;
}

export function imagePlanePart({ id, name, dataUrl, width, height, at, existing }: ImagePlaneInput): ScenePart {
  const w = width >= height ? IMAGE_SIDE : Math.round((IMAGE_SIDE * width) / height);
  const h = width >= height ? Math.round((IMAGE_SIDE * height) / width) : IMAGE_SIDE;
  const x = at ? Math.round(at[0]) : existing * 16;
  const z = at ? Math.round(at[2]) : -40 - existing * 8;

  return {
    id,
    name: name.replace(/\.[a-z0-9]+$/i, '') || 'Reference',
    kind: 'image_plane',
    category: 'ai_markers',
    role: 'reference',
    position: [x, h / 2, z],
    rotation: [0, 0, 0],
    dimensions: { width: w, height: h, depth: 1 },
    color: '#ffffff',
    opacity: 1,
    note: '',
    mechanicalTag: 'Reference Axis',
    visible: true,
    locked: false,
    imageDataUrl: dataUrl,
  };
}

const CLAY_DIMENSIONS: Record<ClayPreset, ScenePart['dimensions']> = {
  clay_capsule: { width: 32, height: 56, depth: 32, thickness: 4 },
  clay_cylinder: { width: 36, height: 44, depth: 36, thickness: 4 },
  clay_sphere: { width: 42, height: 42, depth: 42, thickness: 4 },
  clay_box: { width: 42, height: 42, depth: 42, thickness: 4 },
};

export const CLAY_LABELS: Record<ClayPreset, string> = {
  clay_sphere: 'Clay Sphere',
  clay_box: 'Clay Block',
  clay_cylinder: 'Clay Cylinder',
  clay_capsule: 'Clay Capsule',
};

export function clayPart(preset: ClayPreset, id: string, sculptMesh: SculptMeshData): ScenePart {
  const dims = CLAY_DIMENSIONS[preset];

  return {
    id,
    name: CLAY_LABELS[preset],
    kind: 'sculpt_mesh',
    category: 'primitives',
    role: 'solid',
    position: [0, dims.height / 2, 0],
    rotation: [0, 0, 0],
    dimensions: { ...dims },
    color: '#f4f4f5',
    note: 'Hand-sculpted clay geometry',
    mechanicalTag: PRINTED_TAG,
    visible: true,
    locked: false,
    sculptMesh,
  };
}

export function sketchDescription(params: Pick<SketchParams, 'mode' | 'nodes'>) {
  if (params.mode === 'svg') {
    return `Imported SVG (${params.nodes.length} path${params.nodes.length === 1 ? '' : 's'})`;
  }

  return params.mode === 'extrude' ? 'Sketch extrusion' : 'Sketch revolve';
}

export const sketchDimensions = (params: SketchParams) => ({
  width: params.widthMm,
  height: params.heightMm,
  depth: params.depthMm,
  thickness: 4,
});

export function sketchPart(params: SketchParams, id: string): ScenePart {
  return {
    id,
    name: params.name,
    kind: 'custom_model',
    category: 'custom_models',
    role: 'solid',
    position: [0, Math.round((params.heightMm / 2) * 10) / 10, 0],
    rotation: [0, 0, 0],
    dimensions: sketchDimensions(params),
    color: params.color,
    note: sketchDescription(params),
    mechanicalTag: PRINTED_TAG,
    visible: true,
    locked: false,
    customNodes: params.nodes,
    sourceImageDataUrl: params.svgDataUrl,
  };
}

export { PRINTED_TAG };
