import { Matrix4, Vector3 } from 'three';
import type { ScenePart } from '../types/robotics';
import type { PartSheet, SheetMaterial, SheetProfile } from '../types/sheet';

type SheetPart = Pick<ScenePart, 'dimensions' | 'sheet' | 'mechanicalTag'>;

export const SHEET_MATERIALS: Record<SheetMaterial, { label: string; density: number; thicknessesMm: number[] }> = {
  'aluminum-6061': {
    label: '6061 aluminum',
    density: 2.7,
    thicknessesMm: [1.02, 1.6, 2.03, 2.54, 3.18, 4.75, 6.35, 8, 9.5, 12.7, 15.88, 19.05],
  },
  'carbon-fiber': {
    label: 'Carbon fiber plate',
    density: 1.6,
    thicknessesMm: [1.02, 1.6, 2.01, 3, 3.99, 5, 8],
  },
  acrylic: { label: 'Acrylic', density: 1.19, thicknessesMm: [1.6, 3, 4.5, 5.4, 9.5, 12.7] },
};

const LEGACY_MATERIALS: Record<string, SheetMaterial> = {
  'CNC Aluminum': 'aluminum-6061',
  'Laser-Cut Acrylic/Carbon': 'carbon-fiber',
};

export function sheetOf(part: SheetPart, profile?: SheetProfile): PartSheet | undefined {
  if (part.sheet) return part.sheet;

  const material = LEGACY_MATERIALS[part.mechanicalTag ?? ''];

  if (!material) return undefined;

  return {
    material,
    thicknessMm: profile?.thicknessMm ?? Math.min(part.dimensions.width, part.dimensions.height, part.dimensions.depth),
  };
}

export function snapThickness(material: SheetMaterial, requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) throw new Error('Choose a positive sheet thickness.');

  const stock = SHEET_MATERIALS[material].thicknessesMm;
  const bounded = Math.max(stock[0], Math.min(stock[stock.length - 1], requested));

  return stock.reduce((best, size) => (Math.abs(size - bounded) < Math.abs(best - bounded) ? size : best));
}

function profileFor(part: ScenePart, profile?: SheetProfile): SheetProfile {
  if (profile) return profile;

  if (
    (part.kind !== 'box' && part.kind !== 'cube') ||
    part.deformers ||
    part.edges ||
    part.sculptMesh ||
    part.sheetTransform
  )
    throw new Error('Measure the sheet profile first.');

  const sizes = [part.dimensions.width, part.dimensions.height, part.dimensions.depth];
  const thicknessMm = Math.min(...sizes);

  if (!sizes.every((size) => Number.isFinite(size) && size > 0)) throw new Error('Choose positive part dimensions.');

  const axis = sizes.indexOf(thicknessMm);
  const normal: [number, number, number] = [0, 0, 0];

  normal[axis] = 1;

  return { thicknessMm, normal, outline: [], holes: [] };
}

function normalStretch(part: ScenePart, profile: SheetProfile, ratio: number): number[] {
  const n = new Vector3(...profile.normal).normalize();
  const k = ratio - 1;
  const transform = new Matrix4().set(
    1 + k * n.x * n.x,
    k * n.x * n.y,
    k * n.x * n.z,
    0,
    k * n.y * n.x,
    1 + k * n.y * n.y,
    k * n.y * n.z,
    0,
    k * n.z * n.x,
    k * n.z * n.y,
    1 + k * n.z * n.z,
    0,
    0,
    0,
    0,
    1,
  );
  const center = new Vector3(...(profile.center ?? [0, 0, 0]));
  const translation = center.clone().sub(center.clone().applyMatrix4(transform));

  transform.setPosition(translation);

  return transform.multiply(new Matrix4().fromArray(part.sheetTransform ?? new Matrix4().toArray())).toArray();
}

export function applySheet(part: ScenePart, setting: PartSheet, measured?: SheetProfile): ScenePart {
  const profile = profileFor(part, measured);
  const thicknessMm = snapThickness(setting.material, setting.thicknessMm);
  const sheet = { ...setting, thicknessMm };

  if (Math.abs(profile.thicknessMm - thicknessMm) < 0.00001) return { ...part, sheet };

  const axis = profile.normal.findIndex((value) => Math.abs(value) > 0.99999);
  const ratio = thicknessMm / profile.thicknessMm;

  if (axis < 0 || part.sheetTransform) return { ...part, sheet, sheetTransform: normalStretch(part, profile, ratio) };

  const key = (['width', 'height', 'depth'] as const)[axis];
  const dimensions = { ...part.dimensions, [key]: part.dimensions[key] * ratio };

  return { ...part, dimensions, sheet };
}
