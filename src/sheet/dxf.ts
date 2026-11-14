import type { SheetProfile } from './detect';
import type { Point2 } from './loops';
import { SHEET_MATERIALS, type SheetMaterial } from './materials';

const LAYER = 'CUT';
const NAME_CHARS = 60;

const number = (v: number) => (Math.round(v * 1000) / 1000 + 0).toFixed(3);

const pairs = (...items: Array<[number, string]>) => items.map(([code, value]) => `${code}\n${value}`).join('\n');

function polyline(loop: Point2[]): string {
  const vertices = loop.map(([x, y]) =>
    pairs([0, 'VERTEX'], [8, LAYER], [10, number(x)], [20, number(y)], [30, number(0)]),
  );

  return [
    pairs([0, 'POLYLINE'], [8, LAYER], [66, '1'], [70, '1'], [10, number(0)], [20, number(0)], [30, number(0)]),
    ...vertices,
    pairs([0, 'SEQEND'], [8, LAYER]),
  ].join('\n');
}

export function sheetDxf(profile: Pick<SheetProfile, 'outline' | 'holes'>): string {
  return `${[
    pairs([0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1009'], [9, '$INSUNITS'], [70, '4']),
    pairs([9, '$MEASUREMENT'], [70, '1'], [0, 'ENDSEC']),
    pairs([0, 'SECTION'], [2, 'ENTITIES']),
    polyline(profile.outline),
    ...profile.holes.map(polyline),
    pairs([0, 'ENDSEC'], [0, 'EOF']),
  ].join('\n')}\n`;
}

export function safeName(name: string): string {
  return (
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, NAME_CHARS)
      .replace(/^-+|-+$/g, '') || 'part'
  );
}

export const cutFileName = (name: string, material: SheetMaterial, thicknessMm: number) =>
  `${safeName(name)}-${SHEET_MATERIALS[material].slug}-${String(thicknessMm).replace('.', '_')}mm.dxf`;
