import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { fitOnBed, type Bed } from './bed';
import { plateFootprint, plateOnBed, spotOn } from './fleet';
import type { Plate, PlanItem } from './plan';

const plateOf = (items: PlanItem[]): Plate => ({
  number: 7,
  local: 3,
  material: 'PLA',
  items,
  grams: 10,
  hours: 1,
  hash: 'plate',
});

function reference(plate: Plate) {
  const rectangles = plate.items.map((item) => {
    const angle = (item.yaw * Math.PI) / 180;
    const diagonal = item.yaw % 90 !== 0;
    const w = diagonal ? Math.abs(Math.cos(angle)) * item.w + Math.abs(Math.sin(angle)) * item.d : item.w;
    const d = diagonal ? Math.abs(Math.sin(angle)) * item.w + Math.abs(Math.cos(angle)) * item.d : item.d;

    return { x: item.x + (item.w - w) / 2, y: item.y + (item.d - d) / 2, w, d };
  });
  const x = Math.min(...rectangles.map((item) => item.x));
  const y = Math.min(...rectangles.map((item) => item.y));

  return {
    x,
    y,
    w: Math.max(...rectangles.map((item) => item.x + item.w)) - x,
    d: Math.max(...rectangles.map((item) => item.y + item.d)) - y,
    h: Math.max(...plate.items.map((item) => item.h)),
  };
}

const itemOf = (i: number): PlanItem => ({
  id: `item-${i}`,
  name: 'Bracket',
  copy: i % 3,
  x: ((i * 13) % 120) - 30,
  y: ((i * 17) % 120) - 40,
  w: ((i * 7) % 60) + 1,
  d: ((i * 11) % 60) + 1,
  h: (i % 25) + 1,
  yaw: [-180, -90, -35, 0, 15, 45, 90, 180, 270, 360][i % 10],
  matrix: new Matrix4().makeTranslation(i / 3, -i / 7, i).toArray(),
});

const bedOf = (size: number): Bed => ({
  name: 'Destination',
  width: size,
  depth: size - 10,
  height: 100,
  origin: [-50, 75],
  keepOut: [{ x: 0, y: 0, w: 20, d: 30 }],
  margin: 2,
});

describe('fleet plate bounds', () => {
  it('preserves complete bounds, fit decisions and relocated matrices across edited plates and beds', () => {
    for (let seed = 0; seed < 120; seed++) {
      const plate = plateOf(Array.from({ length: seed % 21 }, (_, i) => itemOf(seed + i)));
      const saved = structuredClone(plate);
      const at = reference(plate);
      const from = bedOf(250);
      const to = { ...bedOf(seed % 2 ? 200 : 80), origin: [seed / 11, -seed / 13] as [number, number] };
      const fit = fitOnBed(at.w, at.d, at.h, to);
      const spot = fit?.yaw === 0 ? fit.spot : null;
      const moved = plateOnBed(plate, from, to);

      expect(plateFootprint(plate)).toEqual(at);
      expect(spotOn(plate, to)).toEqual(spot);

      if (spot) {
        const dx = spot.x - at.x;
        const dy = spot.y - at.y;
        const round = (v: number) => Math.round(v * 1e6) / 1e6;
        const items = plate.items.map((item) => {
          const matrix = [...item.matrix];

          matrix[12] = round(matrix[12] + (to.origin[0] - from.origin[0] + dx));
          matrix[13] = round(matrix[13] + (to.origin[1] - from.origin[1] + dy));

          return { ...item, x: item.x + dx, y: item.y + dy, matrix };
        });

        expect(moved).toEqual({ ...plate, local: 1, items });
      } else {
        expect(moved).toBeNull();
      }

      expect(plate).toEqual(saved);
      plate.items.push(itemOf(seed + 100));
      expect(plateFootprint(plate)).toEqual(reference(plate));
    }
  });

  it('preserves nonfinite bounds and refuses malformed placements', () => {
    for (const value of [NaN, Infinity, -Infinity, -0]) {
      for (const field of ['x', 'y', 'w', 'd', 'h', 'yaw'] as const) {
        const plate = plateOf([itemOf(1), { ...itemOf(2), [field]: value }]);

        expect(plateFootprint(plate)).toEqual(reference(plate));

        const size = reference(plate);
        const fit = fitOnBed(size.w, size.d, size.h, bedOf(200));

        expect(spotOn(plate, bedOf(200))).toEqual(fit?.yaw === 0 ? fit.spot : null);
      }
    }
  });

  it('measures each item once during relocation', () => {
    for (const count of [300, 600]) {
      let reads = 0;
      const items = Array.from({ length: count }, (_, i) => {
        const item = itemOf(i);

        return {
          ...item,
          get yaw() {
            reads++;

            return item.yaw;
          },
        };
      });

      expect(plateOnBed(plateOf(items), bedOf(1000), bedOf(1000))).not.toBeNull();
      expect(reads).toBe(count * 2);
    }
  });
});
