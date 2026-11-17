import { Matrix4 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { assemblyModel } from './assembly.mjs';

function mate(id, a, b, type = 'REVOLUTE') {
  const cs = { origin: [0, 0, 0], xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1] };

  return {
    prefix: [],
    feature: {
      id,
      featureType: 'mate',
      featureData: {
        name: id,
        mateType: type,
        matedEntities: [a, b].map((key) => ({ matedOccurrence: [String(key)], matedCS: cs })),
      },
    },
  };
}

function inputOf(size, features) {
  return {
    name: 'Tree assembly',
    occurrences: {
      parts: new Map(
        Array.from({ length: size }, (_, i) => [
          String(i),
          { name: `Part ${i}`, path: [String(i)], world: new Matrix4().makeTranslation(i, 0, 0), instance: {} },
        ]),
      ),
      features,
      fixed: '0',
    },
    limits: new Map(),
    masses: new Map(),
    meshes: new Map(),
  };
}

const endsOf = (model) => model.joints.map(({ name, parent, child }) => [name, parent, child]);

describe('Onshape mate tree traversal', () => {
  it('keeps breadth-first mate order through cycles, fused groups, missing ends and disconnected links', () => {
    const input = inputOf(9, [
      mate('Fuse', 1, 2, 'FASTENED'),
      mate('Internal', 2, 1),
      mate('Missing', 0, 99),
      mate('Deep', 3, 4),
      mate('Reverse', 2, 0),
      mate('Slide', 0, 3, 'SLIDER'),
      mate('Loop', 2, 3),
      mate('Unsupported', 1, 5, 'BALL'),
      mate('Axle', 3, 6, 'CYLINDRICAL'),
      mate('Isolated', 7, 8),
      mate('Parallel', 0, 1),
    ]);
    const before = structuredClone(input);
    const model = assemblyModel(input);

    expect(endsOf(model)).toEqual([
      ['Reverse', 'Part 0', 'Part 1'],
      ['Slide', 'Part 0', 'Part 3'],
      ['Unsupported', 'Part 1', 'Part 5'],
      ['Deep', 'Part 3', 'Part 4'],
      ['Axle', 'Part 3', 'Part 6'],
      ['Part 7 fixed', 'Part 0', 'Part 7'],
      ['Part 8 fixed', 'Part 0', 'Part 8'],
    ]);
    expect(model.joints.slice(0, 5).map((joint) => joint.type)).toEqual([
      'revolute',
      'prismatic',
      'fixed',
      'revolute',
      'revolute',
    ]);
    expect(model.joints[0].axis).toEqual([0, 0, -1]);
    expect(model.joints[1].axis).toEqual([0, 0, 1]);
    expect(model.fixedMates).toEqual([
      { name: 'Unsupported', link: 'Part 5' },
      { name: 'Axle slide', link: 'Part 6' },
    ]);
    expect(structuredClone(input)).toEqual(before);
    input.occurrences.fixed = '4';

    expect(endsOf(assemblyModel(input)).slice(0, 3)).toEqual([
      ['Deep', 'Part 4', 'Part 3'],
      ['Slide', 'Part 3', 'Part 0'],
      ['Loop', 'Part 3', 'Part 1'],
    ]);
    expect(endsOf(model)[0]).toEqual(['Reverse', 'Part 0', 'Part 1']);
  });

  it.each([300, 600])('bounds mate lookup work for %i links in both chains and wide trees', (size) => {
    for (const wide of [false, true]) {
      const features = Array.from({ length: size - 1 }, (_, i) => mate(`Mate ${i}`, wide ? 0 : i, i + 1));
      const input = inputOf(size, features);
      const spy = vi.spyOn(Map.prototype, 'get');
      let model;
      let reads;

      try {
        model = assemblyModel(input);
        reads = spy.mock.calls.length;
      } finally {
        spy.mockRestore();
      }

      expect(model.links).toHaveLength(size);
      expect(model.joints).toHaveLength(size - 1);
      expect(reads).toBeLessThan(size * 30);
      expect(endsOf(model)).toEqual(features.map((_, i) => [`Mate ${i}`, `Part ${wide ? 0 : i}`, `Part ${i + 1}`]));
    }
  });
});
