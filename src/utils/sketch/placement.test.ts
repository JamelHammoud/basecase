import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../../types/robotics';
import { addCircle, addRectangle } from './edit';
import { faceOf, placedPlane, referenceSketch, toPartLocal } from './face';
import { GROUND_PLANE, partFromSolid, partPlane, sketchSolid, type Vec3 } from './placement';
import { sketchProfile } from './profile';
import type { Sketch } from './types';

const boxSoup = (w: number, h: number, d: number) =>
  new THREE.BoxGeometry(w, h, d, 3, 2, 3).toNonIndexed().getAttribute('position').array;

const look = { id: 'node-1', name: 'Plate', color: '#e4e4e7' };

const empty: Sketch = { points: [], entities: [], constraints: [] };

const plate = () => {
  const rect = addRectangle(empty, { corner: { at: [-20, -10] }, opposite: [5, 5], width: 40, height: 20 })!;

  return addCircle(rect.sketch, { at: [0, 0] }, 4, true)!.sketch;
};

const part = (over: Partial<ScenePart>): ScenePart => ({
  id: 'p',
  name: 'Plate',
  kind: 'custom_model',
  category: 'custom_models',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 1, height: 1, depth: 1 },
  color: '#e4e4e7',
  note: '',
  visible: true,
  locked: false,
  ...over,
});

describe('sketch profile', () => {
  it('turns a rectangle with a circle inside into an outline with one hole', () => {
    const profile = sketchProfile(plate())!;

    expect(profile.outer).toHaveLength(4);
    expect(profile.holes).toHaveLength(1);
  });

  it('leaves out reference edges', () => {
    expect(
      sketchProfile(
        referenceSketch([
          [
            [0, 0],
            [10, 0],
          ],
        ]),
      ),
    ).toBeNull();
  });
});

describe('sketch on a face', () => {
  const pose = { position: [10, 15, -5] as Vec3, rotation: [0, 90, 0] as Vec3 };
  const soup = boxSoup(60, 30, 50);

  it('finds the top face, its plane and its four edges', () => {
    const face = faceOf(soup, { normal: [0, 1, 0] })!;

    expect(face.plane.origin).toEqual([0, 15, 0]);
    expect(face.plane.n).toEqual([0, 1, 0]);
    expect(face.edges).toHaveLength(4);
  });

  it('finds the face under a clicked point', () => {
    const local = toPartLocal([10 + 25, 8, -5], pose);
    const face = faceOf(soup, { point: local })!;

    expect(face.plane.n.map((v) => Math.round(v) + 0)).toEqual([0, 0, 1]);
  });

  it('extrudes a profile to an exact solid standing on the face, and finds the plane again from the part', () => {
    const face = faceOf(soup, { normal: [0, 1, 0] })!;
    const plane = placedPlane(face.plane, pose);
    const solid = sketchSolid(plane, { sketch: plate(), mode: 'extrude', depth: 5 }, look)!;

    expect(solid.dimensions).toEqual({ width: 40, height: 5, depth: 20 });
    expect(solid.position).toEqual([10, 32.5, -5]);
    expect(solid.role).toBe('solid');

    const placed = partFromSolid(part({}), solid);
    const again = partPlane(placed);

    expect(again.origin.map((v) => Math.round(v * 1e6) / 1e6)).toEqual(
      plane.origin.map((v) => Math.round(v * 1e6) / 1e6),
    );
  });

  it('cuts into the face when the depth is negative', () => {
    const solid = sketchSolid(GROUND_PLANE, { sketch: plate(), mode: 'extrude', depth: -5 }, look)!;

    expect(solid.role).toBe('cutout');
    expect(solid.position[1]).toBe(-2.5);
  });
});
