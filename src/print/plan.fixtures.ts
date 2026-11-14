import type { PlanInput } from './plan';

type V3 = [number, number, number];

export function planInput(id: string, size: V3, extra: Partial<PlanInput> = {}): PlanInput {
  const flat = { overhangMm2: 0, supportMm3: 0, contactMm2: 1 };

  return {
    id,
    name: id,
    material: 'PLA',
    shapeKey: `${id}:${size.join('x')}`,
    check: {
      pose: { down: [0, -1, 0], rotation: [0, 0, 0, 1], min: [0, 0, 0], size, ...flat },
      size,
      fits: true,
      ...flat,
      minWallMm: 2,
      thinShare: 0,
      thinAreaMm2: 0,
    },
    grams: 10,
    supportG: 0,
    hours: 1,
    ...extra,
  };
}
