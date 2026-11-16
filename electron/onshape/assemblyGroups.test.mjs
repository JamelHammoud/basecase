import { Matrix4 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { assemblyModel } from './assembly.mjs';

function inputOf(size) {
  const parts = new Map(
    Array.from({ length: size }, (_, i) => [
      `part-${i}`,
      { name: `Part ${i}`, path: [`part-${i}`], world: new Matrix4(), instance: {} },
    ]),
  );
  const features = Array.from({ length: size - 1 }, (_, i) => ({
    prefix: [],
    feature: {
      featureType: 'mateGroup',
      featureData: { occurrences: [{ occurrence: [`part-${i}`] }, { occurrence: [`part-${i + 1}`] }] },
    },
  }));

  return {
    name: 'Shared assembly',
    occurrences: { parts, features },
    limits: new Map(),
    masses: new Map(),
    meshes: new Map(),
  };
}

describe('Onshape rigid component paths', () => {
  it.each([300, 600])('groups %i chained occurrences without repeated intermediate root walks', (size) => {
    const input = inputOf(size);
    const before = structuredClone(input);
    const spy = vi.spyOn(Map.prototype, 'get');
    let model;
    let reads;

    try {
      model = assemblyModel(input);
      reads = spy.mock.calls.length;
    } finally {
      spy.mockRestore();
    }

    expect(model.root).toBe('Part 0');
    expect(model.links).toHaveLength(1);
    expect(model.links[0].occurrences).toEqual([...input.occurrences.parts.keys()]);
    expect(model.joints).toEqual([]);
    expect(reads).toBeLessThan(size * 40);
    expect(structuredClone(input)).toEqual(before);
    input.occurrences.features.length = 0;
    expect(assemblyModel(input).links).toHaveLength(size);
  });
});
