import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { place, type Placed } from '../three/analysis/collide';
import { solidFromPositions } from '../three/analysis/shapeSolid';
import type { FastenerInput, V3 } from './assemblyTypes';
import { traceFasteners } from './fastenerChain';

function box(id: string, size: V3, at: V3, transform: THREE.Matrix4): Placed {
  const geometry = new THREE.BoxGeometry(...size).toNonIndexed();
  const matrix = transform.clone().multiply(new THREE.Matrix4().makeTranslation(...at));

  return place(id, solidFromPositions(geometry.attributes.position.array as Float32Array), matrix);
}

function fixture(length: number, transform = new THREE.Matrix4()) {
  const input: FastenerInput = {
    specs: [
      { id: 'screw', kind: 'screw', d: 3, tipY: 0, underY: length, topY: length + 3, headR: 3, countersunk: false },
    ],
    roles: { host: 'printed', screw: 'hardware' },
  };
  const placed = [
    box('host', [8, length + 8, 8], [0, length / 2, 0], transform),
    box('screw', [3, length, 3], [0, 0, 0], transform),
  ];

  return { input, placed };
}

describe('fastener probe workspace', () => {
  it('preserves engagement, problems and owned coordinates across screws, placements and edits', () => {
    const { input, placed } = fixture(10);
    const before = placed.map(({ matrix, inverse, box }) => ({
      matrix: matrix.clone(),
      inverse: inverse.clone(),
      box: box.clone(),
    }));
    const first = traceFasteners(placed, input);
    const saved = structuredClone(first);

    expect(first.screws[0]).toEqual({
      id: 'screw',
      d: 3,
      axis: [0, 1, 0],
      tip: [0, 0, 0],
      top: [0, 13, 0],
      headR: 3,
      stack: ['host'],
      endsIn: { kind: 'printed', id: 'host' },
      engagementMm: 10.2,
      needMm: 4.5,
      problems: [
        { code: 'uncut', part: 'host', mm: 9.5 },
        { code: 'sunk', part: 'host' },
      ],
    });

    const transform = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(23, -14, 37);
    const moved = fixture(10, transform);
    const turned = traceFasteners(moved.placed, moved.input).screws[0];

    expect(turned.engagementMm).toBe(first.screws[0].engagementMm);
    expect(turned.problems).toEqual(first.screws[0].problems);
    expect(turned.stack).toEqual(['host']);
    expect(turned.tip).toEqual([23, -14, 37]);
    expect(turned.top[0]).toBeCloseTo(10, 12);
    expect(turned.top[1]).toBeCloseTo(-14, 12);
    expect(turned.top[2]).toBe(37);

    const other = fixture(6, new THREE.Matrix4().makeTranslation(100, 0, 0));
    const together = traceFasteners([...placed, ...other.placed.map((part) => ({ ...part, id: `${part.id}-2` }))], {
      specs: [...input.specs, ...other.input.specs.map((spec) => ({ ...spec, id: `${spec.id}-2` }))],
      roles: { ...input.roles, 'host-2': 'printed', 'screw-2': 'hardware' },
    });

    expect(together.screws[0]).toEqual(first.screws[0]);
    expect(together.screws[1].tip).toEqual([100, 0, 0]);
    expect(together.screws[1].top).toEqual([100, 9, 0]);
    expect(together.screws[1].engagementMm).toBeCloseTo(6.2, 12);
    expect(together.screws[1].stack).toEqual(['host-2']);

    input.roles.host = 'component';

    expect(traceFasteners(placed, input).screws[0].endsIn).toEqual({ kind: 'component', id: 'host' });
    expect(traceFasteners([placed[1]], input).screws[0].problems).toEqual([{ code: 'air' }, { code: 'unseated' }]);
    expect(first).toEqual(saved);
    expect(placed.map(({ matrix, inverse, box }) => ({ matrix, inverse, box }))).toEqual(before);
  });

  it.each([300, 600])('avoids cloning the screw origin for each axial sample at %i mm', (length) => {
    const { input, placed } = fixture(length);
    const original = THREE.Vector3.prototype.clone;
    let clones = 0;
    const clone = vi.spyOn(THREE.Vector3.prototype, 'clone').mockImplementation(function (this: THREE.Vector3) {
      if (this.x === 0 && this.y === 0 && this.z === 0) clones++;

      return original.call(this);
    });

    try {
      const result = traceFasteners(placed, input);

      expect(result.screws[0].engagementMm).toBeCloseTo(length + 0.2, 8);
      expect(result.screws[0].stack).toEqual(['host']);
    } finally {
      clone.mockRestore();
    }

    expect(clones).toBe(2);
  });
});
