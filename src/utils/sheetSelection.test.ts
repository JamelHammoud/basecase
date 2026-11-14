import { Box3, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { toCad } from '../agent/agentFrame';
import { partBoundsCad } from '../agent/sceneBounds';
import { sheetPart } from '../sheet/sheet.fixtures';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import type { ScenePart } from '../types/robotics';
import { dropToFloor, stackedPosition } from '../workspace/partTransforms';
import { articulatedShift, importOffset } from '../workspace/robotPlacement';
import { alignParts, distributeParts, halfExtents, partBounds, type AlignMode } from './selection';

const transform = new Matrix4().set(1, 0, 0.5, 7, 0, 1, 0.3, -3, 0.5, 0.3, 2, 2, 0, 0, 0, 1).toArray();
const part = (over: Partial<ScenePart> = {}) => sheetPart({ sheetTransform: transform, ...over });

function renderedBounds(p: ScenePart) {
  const group = buildPartGroup(p, false);
  const bounds = new Box3().setFromObject(group, true);

  releasePartGroup(group);

  return bounds;
}

describe('affine sheet selection bounds', () => {
  it('leaves the robot insertion gap beyond a translated sheet surface', () => {
    const obstacle = part();
    const incoming = sheetPart();
    const right = renderedBounds(obstacle).max.x;

    for (const [shift, gap] of [
      [importOffset([incoming], undefined, [obstacle]), 100],
      [articulatedShift([incoming], undefined, [obstacle]), 40],
    ] as const) {
      const placed = { ...incoming, position: shift };
      const distance = renderedBounds(placed).min.x - right;

      expect(distance).toBeGreaterThanOrEqual(gap);
      expect(distance).toBeLessThan(gap + 1);
    }
  });

  it('matches rendered corners including rotation and affine translation', () => {
    const p = part({ position: [20, 30, 40], rotation: [15, 30, 45] });
    const expected = renderedBounds(p);
    const actual = partBounds(p);
    const size = expected.getSize(new Vector3());

    actual.min.forEach((value, axis) => expect(value).toBeCloseTo(expected.min.getComponent(axis), 5));
    actual.max.forEach((value, axis) => expect(value).toBeCloseTo(expected.max.getComponent(axis), 5));
    halfExtents(p).forEach((value, axis) => expect(value * 2).toBeCloseTo(size.getComponent(axis), 5));

    const a = toCad(expected.min.toArray());
    const b = toCad(expected.max.toArray());
    const cad = partBoundsCad(p);

    cad.min.forEach((value, axis) => expect(value).toBeCloseTo(Math.min(a[axis], b[axis]), 2));
    cad.max.forEach((value, axis) => expect(value).toBeCloseTo(Math.max(a[axis], b[axis]), 2));
  });

  it.each<AlignMode>(['min', 'center', 'max'])('aligns the transformed %s anchor to the origin', (mode) => {
    const original = part({ position: [20, 30, 40] });
    const [aligned] = alignParts([original], [original.id], 0, mode);
    const bounds = renderedBounds(aligned);
    const anchors = { min: bounds.min.x, max: bounds.max.x, center: bounds.getCenter(new Vector3()).x };

    expect(anchors[mode]).toBeCloseTo(0, 5);
  });

  it('spreads translated bounds with equal gaps while keeping the outer edges fixed', () => {
    const parts = [
      part({ id: 'a', position: [0, 0, 0] }),
      sheetPart({ id: 'b', position: [200, 0, 0] }),
      part({ id: 'c', position: [400, 0, 0] }),
    ];
    const result = distributeParts(
      parts,
      parts.map((p) => p.id),
      0,
    );
    const bounds = result.map(renderedBounds);

    expect(bounds[0].min.x).toBeCloseTo(renderedBounds(parts[0]).min.x, 5);
    expect(bounds[2].max.x).toBeCloseTo(renderedBounds(parts[2]).max.x, 5);
    expect(bounds[1].min.x - bounds[0].max.x).toBeCloseTo(bounds[2].min.x - bounds[1].max.x, 5);
  });

  it('aligns an ordinary part to a fractional face on an affine sheet', () => {
    const parts = [part({ id: 'sheet' }), sheetPart({ id: 'plain', position: [100, 0, 0] })];
    const result = alignParts(parts, ['sheet', 'plain'], 0, 'min');
    const [sheet, plain] = result.map(renderedBounds);

    expect(plain.min.x).toBeCloseTo(sheet.min.x, 5);
    expect(plain.min.x).toBeCloseTo(renderedBounds(parts[0]).min.x, 5);
  });

  it('keeps fractional equal gaps in a mixed selection', () => {
    const parts = [
      part({ id: 'first' }),
      sheetPart({ id: 'middle', position: [150, 0, 0], dimensions: { width: 17.3, height: 10, depth: 3 } }),
      sheetPart({ id: 'last', position: [403.13, 0, 0], dimensions: { width: 20.26, height: 10, depth: 3 } }),
    ];
    const result = distributeParts(
      parts,
      parts.map((p) => p.id),
      0,
    );
    const [first, middle, last] = result.map(renderedBounds);

    expect(middle.min.x - first.max.x).toBeCloseTo(last.min.x - middle.max.x, 5);
    expect(last.max.x).toBeCloseTo(renderedBounds(parts[2]).max.x, 5);
  });

  it('drops and stacks the actual transformed bottom onto its support', () => {
    const original = part({ position: [0, 60, 0] });
    const [dropped] = dropToFloor([original], new Set([original.id]));
    const support = sheetPart({
      id: 'support',
      position: [0, 10, 0],
      dimensions: { width: 200, height: 20, depth: 200 },
    });
    const stacked = { ...original, position: stackedPosition(original, [support]) };

    expect(renderedBounds(dropped).min.y).toBeCloseTo(0, 5);
    expect(renderedBounds(stacked).min.y).toBeCloseTo(renderedBounds(support).max.y, 5);
  });
});
