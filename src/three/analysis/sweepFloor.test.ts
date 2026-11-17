import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../utils/seededRandom';
import { place, type Placed } from './collide';
import { ShapeSolid } from './shapeSolid';
import { lowestPart, sweepClashes } from './sweep';

function referenceLowest(placed: Placed[], included?: ReadonlySet<string>) {
  let lowest: { id: string; y: number } | null = null;
  const point = new THREE.Vector3();

  for (const part of placed.filter((p) => !included || included.has(p.id))) {
    const positions = part.solid.positions;
    let y = Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      y = Math.min(y, point.fromArray(positions, i).applyMatrix4(part.matrix).y);
    }

    if (!lowest || y < lowest.y) lowest = { id: part.id, y };
  }

  return lowest;
}

describe('sweep floor clearance', () => {
  it('selects the same lowest included part across transformed scenes, ties and membership edits', () => {
    const random = seededRandom('0123456789abcdef0123456789abcdef');
    const solid = new ShapeSolid(new Float32Array([3, -4, 8, -7, 5, 2, 1, 9, -6]));
    const included = new Set<string>();

    for (let scene = 0; scene < 80; scene++) {
      const placed = Array.from({ length: 40 }, (_, i) =>
        place(
          `part-${i}`,
          solid,
          new THREE.Matrix4().compose(
            new THREE.Vector3(random() * 200, random() * 200 - 100, random() * 200),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(random(), random(), random())),
            new THREE.Vector3(1 + random(), 1 + random(), 1 + random()),
          ),
        ),
      );
      const original = placed.map((p) => p.matrix.toArray());

      included.clear();

      expect(lowestPart(placed, included)).toBeNull();

      for (let i = 0; i < placed.length; i += 3) included.add(placed[i].id);

      expect(lowestPart(placed, included)).toEqual(referenceLowest(placed, included));
      expect(lowestPart(placed)).toEqual(referenceLowest(placed));
      expect(placed.map((p) => p.matrix.toArray())).toEqual(original);
    }

    const first = place('first', solid, new THREE.Matrix4());
    const second = place('second', solid, new THREE.Matrix4());

    expect(lowestPart([first, second], new Set(['first', 'second']))).toEqual({ id: 'first', y: -4 });
    expect(lowestPart([first, second], new Set(['second', 'missing']))).toEqual({ id: 'second', y: -4 });
    expect(lowestPart([])).toBeNull();
    expect(solid.positions).toEqual(new Float32Array([3, -4, 8, -7, 5, 2, 1, 9, -6]));
  });

  it('reports only moving floor contacts while retaining angle order and repeated samples', () => {
    const geometry = new THREE.BoxGeometry(8, 8, 8).toNonIndexed();
    const solid = new ShapeSolid(new Float32Array(geometry.attributes.position.array));
    const scene = [
      place('fixed', solid, new THREE.Matrix4().makeTranslation(1000, -100, 0)),
      place('moving', solid, new THREE.Matrix4().makeTranslation(15, 10, 0)),
    ];
    const spec = {
      moving: ['moving', 'missing'],
      origin: [0, 10, 0] as [number, number, number],
      axis: [0, 0, 3] as [number, number, number],
      anglesDeg: [0, 90, -90, 180, -90],
    };

    try {
      expect(sweepClashes(scene, spec)).toEqual([
        { a: 'moving', b: 'floor', depthMm: 9, angle: -90 },
        { a: 'moving', b: 'floor', depthMm: 9, angle: -90 },
      ]);
      expect(sweepClashes(scene, { ...spec, moving: [] })).toEqual([]);
      expect(sweepClashes(scene, { ...spec, anglesDeg: [] })).toEqual([]);
    } finally {
      geometry.dispose();
      solid.dispose();
    }
  });
});
