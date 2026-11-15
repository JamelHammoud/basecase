import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { place, type Placed } from '../three/analysis/collide';
import { solidFromPositions } from '../three/analysis/shapeSolid';
import type { FastenerInput, V3 } from './assemblyTypes';
import { traceFasteners } from './fastenerChain';
import type { SleeveSpec } from './fastenerSpec';

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

function sleeve(id: string, y0: number, y1: number, kind: SleeveSpec['kind'] = 'nut'): SleeveSpec {
  return { id, kind, d: 3, y0, y1, outerR: 2 };
}

function withSleeves(specs: SleeveSpec[]) {
  const scene = fixture(10);
  const placed = box('sleeve', [4, 24, 4], [0, 0, 0], new THREE.Matrix4());

  scene.input.specs.push(...specs);
  scene.placed.push(...specs.map(({ id }) => ({ ...placed, id })));

  for (const { id } of specs) scene.input.roles[id] = 'hardware';

  return scene;
}

describe('fastener evidence selection', () => {
  it('keeps the first greatest receiver, excludes washers and reads edited overlap limits', () => {
    const first = sleeve('first', 1, 7);
    const tied = sleeve('tied', 2, 8, 'insert');
    const scene = withSleeves([
      sleeve('washer', 0, 10, 'washer'),
      sleeve('before-tip', -30, 1),
      first,
      tied,
      sleeve('past-head', 9, 25),
    ]);
    const result = traceFasteners(scene.placed, scene.input);
    const saved = structuredClone(result);

    expect(result.screws[0].endsIn).toEqual({ kind: 'nut', id: 'first' });
    expect(result.screws[0].engagementMm).toBe(6);
    expect(result.sleeves.find(({ id }) => id === 'first')?.screw).toBe('screw');
    expect(result.sleeves.find(({ id }) => id === 'tied')?.screw).toBeNull();

    scene.input.specs.reverse();

    expect(traceFasteners(scene.placed, scene.input).screws[0].endsIn).toEqual({ kind: 'insert', id: 'tied' });

    first.y1 = 8;

    expect(traceFasteners(scene.placed, scene.input).screws[0].endsIn).toEqual({ kind: 'nut', id: 'first' });
    expect(result).toEqual(saved);

    const cutoff = sleeve('cutoff', 0, 0.2);
    const boundary = withSleeves([cutoff, sleeve('washer', 0, 10, 'washer')]);

    expect(traceFasteners(boundary.placed, boundary.input).screws[0].endsIn).toEqual({ kind: 'printed', id: 'host' });

    cutoff.y1 += Number.EPSILON;

    expect(traceFasteners(boundary.placed, boundary.input).screws[0].endsIn).toEqual({ kind: 'nut', id: 'cutoff' });
  });

  it.each([
    new THREE.Matrix4(),
    new THREE.Matrix4().makeRotationZ(0.7).setPosition(23, -14, 37),
    new THREE.Matrix4().makeScale(-1, 1, 1).setPosition(-21, 17, 3),
  ])('keeps the first sampled host on equal uncut runs through placement and role edits', (transform) => {
    const scene = fixture(10, transform);

    scene.placed = [
      scene.placed[1],
      box('upper', [8, 4, 8], [0, 6, 0], transform),
      box('lower', [8, 4, 8], [0, 3, 0], transform),
    ];
    scene.input.roles = { screw: 'hardware', upper: 'printed', lower: 'printed' };

    const result = traceFasteners(scene.placed, scene.input);

    expect(result.screws[0].problems).toContainEqual({ code: 'uncut', part: 'lower', mm: 4 });

    scene.placed[1] = box('upper', [8, 6, 8], [0, 6, 0], transform);

    expect(traceFasteners(scene.placed, scene.input).screws[0].problems).toContainEqual({
      code: 'uncut',
      part: 'upper',
      mm: 6,
    });

    scene.input.roles.upper = 'component';

    expect(traceFasteners(scene.placed, scene.input).screws[0].problems).toContainEqual({
      code: 'uncut',
      part: 'lower',
      mm: 4,
    });
    expect(result.screws[0].problems).toContainEqual({ code: 'uncut', part: 'lower', mm: 4 });
  });

  it.each(['insert', 'nut', 'washer'] as const)(
    'keeps the strongest %s host in source order at the contact cutoff',
    (kind) => {
      const identity = new THREE.Matrix4();
      const input: FastenerInput = {
        specs: [sleeve('sleeve', 3, 5, kind)],
        roles: { sleeve: 'hardware', partial: 'printed', first: 'printed', tied: 'printed', sparse: 'printed' },
      };
      const placed = [
        box('sleeve', [4, 10, 4], [0, 0, 0], identity),
        box('partial', [12, 4, 12], [6.55, 4, 0], identity),
        box('first', [12, 4, 12], [0, 4, 0], identity),
        box('tied', [12, 4, 12], [0, 4, 0], identity),
      ];
      const expected = (host: string | null) => ({
        id: 'sleeve',
        kind,
        host: kind === 'washer' ? null : host,
        screw: null,
      });
      const result = traceFasteners(placed, input);

      expect(result.sleeves).toEqual([expected('first')]);
      expect(traceFasteners([...placed].reverse(), input).sleeves).toEqual([expected('tied')]);
      expect(traceFasteners(placed.slice(0, 2), input).sleeves).toEqual([expected('partial')]);
      expect(traceFasteners([placed[0], box('sparse', [12, 4, 12], [6.55, 4, 5.45], identity)], input).sleeves).toEqual(
        [expected(null)],
      );
      expect(traceFasteners([placed[0]], input).sleeves).toEqual([expected(null)]);
      expect(result.sleeves).toEqual([expected('first')]);
    },
  );

  it.each([300, 600])('calculates each receiver overlap once among %i sleeves', (count) => {
    const specs = Array.from({ length: count }, (_, i) => sleeve(`nut-${i}`, 0, 1 + (((i * 197) % count) / count) * 7));
    const scene = withSleeves(specs);

    scene.placed.shift();
    delete scene.input.roles.host;

    const original = Math.min;
    let overlaps = 0;
    const spy = vi.spyOn(Math, 'min').mockImplementation((...values: number[]) => {
      if (values.length === 2 && values[1] === 10 && values[0] > 0 && values[0] < 9) overlaps++;

      return original(...values);
    });
    let result: ReturnType<typeof traceFasteners>;

    try {
      result = traceFasteners(scene.placed, scene.input);
    } finally {
      spy.mockRestore();
    }

    expect(result.screws[0].endsIn).toEqual({
      kind: 'nut',
      id: specs.find(({ y1 }) => y1 === 1 + ((count - 1) / count) * 7)!.id,
    });
    expect(overlaps).toBe(count + 1);
  });
});
