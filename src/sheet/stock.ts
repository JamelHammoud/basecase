import { hashText } from '../guide/guideItems';
import type { MeshMeasure } from '../three/meshMeasure';
import type { SheetProfile } from './detect';
import { signedArea, type Point2 } from './loops';
import { SHEET_MATERIALS, snapThickness, type SheetMaterial } from './materials';

type SheetMeasure = Pick<MeshMeasure, 'min' | 'max' | 'volumeMm3' | 'sheet'>;

export function sheetThickness(material: SheetMaterial, m: Pick<SheetMeasure, 'min' | 'max' | 'sheet'>): number {
  const drawn = m.sheet?.thicknessMm ?? Math.min(...m.max.map((v, i) => v - m.min[i]));

  return snapThickness(material, drawn);
}

export function sheetGrams(material: SheetMaterial, m: SheetMeasure): number {
  const mm3 = m.sheet ? m.sheet.areaMm2 * sheetThickness(material, m) : m.volumeMm3;

  return (mm3 / 1000) * SHEET_MATERIALS[material].density;
}

const tenth = (v: number) => (Math.round(v * 10) / 10 + 0).toFixed(1);

const perimeter = (loop: Point2[]) =>
  loop.reduce((sum, [x, y], i) => {
    const [nx, ny] = loop[(i + 1) % loop.length];

    return sum + Math.hypot(nx - x, ny - y);
  }, 0);

const loopShape = (loop: Point2[]) => `${tenth(Math.abs(signedArea(loop)))}/${tenth(perimeter(loop))}`;

export function profileHash({ outline, holes }: Pick<SheetProfile, 'outline' | 'holes'>): string {
  return hashText([loopShape(outline), ...holes.map(loopShape).sort()].join(';'));
}

export const sheetKey = (
  material: SheetMaterial,
  thicknessMm: number,
  profile: Pick<SheetProfile, 'outline' | 'holes'>,
) => `sheet:${material}|${thicknessMm}|${profileHash(profile)}`;
