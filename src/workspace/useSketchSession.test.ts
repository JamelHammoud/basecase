import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { addRectangle, removeItems, setDimension } from '../utils/sketch/edit';
import { GROUND_PLANE, partFromSolid, sketchSolid } from '../utils/sketch/placement';
import { rebuiltPart } from './useSketchSession';

const rect = addRectangle(
  { points: [], entities: [], constraints: [] },
  { corner: { at: [-10, -5] }, opposite: [1, 1], width: 40, height: 20 },
)!;

const placed = (): ScenePart => {
  const solid = sketchSolid(
    GROUND_PLANE,
    { sketch: rect.sketch, mode: 'extrude', depth: 5 },
    { id: 'n', name: 'Plate', color: '#fff' },
  )!;
  const part: ScenePart = {
    id: 'plate',
    name: 'Plate',
    kind: 'custom_model',
    category: 'custom_models',
    role: 'solid',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 1, height: 1, depth: 1 },
    color: '#fff',
    note: '',
    visible: true,
    locked: false,
  };

  return { ...partFromSolid(part, solid), position: [100, 30, -40] };
};

describe('re-extruding a sketched part', () => {
  it('keeps the left edge and the base where they were when a length grows', () => {
    const before = placed();
    const after = rebuiltPart(before, { sketch: setDimension(rect.sketch, rect.lines[0], 50)! });

    expect(after.dimensions).toMatchObject({ width: 50, height: 5, depth: 20 });
    expect(after.position[0] - 25).toBeCloseTo(before.position[0] - 20, 9);
    expect(after.position[1]).toBeCloseTo(before.position[1], 9);
  });

  it('turns into a cut when the thickness goes negative, with its top on the old base', () => {
    const before = placed();
    const after = rebuiltPart(before, { depth: -5 });

    expect(after.role).toBe('cutout');
    expect(after.position[1]).toBeCloseTo(before.position[1] - 5, 9);
  });

  it('keeps the solid while the outline is open', () => {
    const before = placed();
    const open = removeItems(rect.sketch, [rect.lines[1]]);
    const after = rebuiltPart(before, { sketch: open });

    expect(after.customNodes).toBe(before.customNodes);
    expect(after.sketch?.sketch).toBe(open);
  });
});
