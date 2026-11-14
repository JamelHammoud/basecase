import type { ScenePart } from '../types/robotics';
import type { PartSheet, SheetMaterial } from '../types/print';
import { SHEET_STOCK } from '../data/sheetStock';
import { hasDeformers } from '../utils/partDeformers';
import { partEdges } from '../utils/partEdges';

export type { PartSheet, SheetMaterial } from '../types/print';
export { SHEET_STOCK } from '../data/sheetStock';

export const SHEET_MATERIALS = Object.keys(SHEET_STOCK) as SheetMaterial[];

export const MAX_SHEET_MM = 13;

const LEGACY_TAGS: Record<string, SheetMaterial> = {
  'CNC Aluminum': 'aluminum',
  'Laser-Cut Acrylic/Carbon': 'acrylic',
};

export function snapThickness(material: SheetMaterial, mm: number): number {
  const sizes = SHEET_STOCK[material].thicknesses;

  return sizes.reduce((best, t) => (Math.abs(t - mm) < Math.abs(best - mm) ? t : best), sizes[0]);
}

export const plateThickness = (p: Pick<ScenePart, 'dimensions'>): number =>
  Math.min(p.dimensions.width, p.dimensions.height, p.dimensions.depth);

const SLAB_KINDS = new Set<ScenePart['kind']>(['box', 'cube']);
const DISC_KINDS = new Set<ScenePart['kind']>(['cylinder', 'tube', 'hex_prism']);

function plainPlateThickness(p: ScenePart): number | null {
  if (p.sculptMesh || p.boolean || p.csg || hasDeformers(p) || partEdges(p)) return null;

  if (SLAB_KINDS.has(p.kind)) return plateThickness(p);

  const { width, height, depth } = p.dimensions;

  return DISC_KINDS.has(p.kind) && height <= Math.min(width, depth) ? height : null;
}

export const isSheetMaterial = (value: string): value is SheetMaterial => value in SHEET_STOCK;

export function sheetOf(p: ScenePart): PartSheet | undefined {
  if (p.role !== 'solid' || p.kind === 'component' || p.kind === 'hardware' || p.supplyId) return undefined;

  if (p.sheet) return p.sheet;

  const legacy = p.mechanicalTag ? LEGACY_TAGS[p.mechanicalTag] : undefined;
  const thickness = legacy ? plainPlateThickness(p) : null;

  return legacy && thickness !== null && thickness <= MAX_SHEET_MM
    ? { material: legacy, thickness: snapThickness(legacy, thickness) }
    : undefined;
}

export const sheetKey = (s: PartSheet) => `sheet:${s.material}|${s.thickness}`;

export function sheetFromKey(key: string): PartSheet | null {
  const [material, thickness] = key.slice('sheet:'.length).split('|');

  return key.startsWith('sheet:') && isSheetMaterial(material) && Number(thickness) > 0
    ? { material, thickness: Number(thickness) }
    : null;
}
