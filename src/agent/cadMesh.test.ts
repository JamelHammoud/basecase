import { describe, expect, it } from 'vitest';
import { r2, r3, toScene, type V3 } from './agentFrame';
import { cadMeshToScene, type AgentCadPayload } from './cadMesh';

function previous(cad: AgentCadPayload) {
  const positions = new Array<number>(cad.positions.length);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < cad.positions.length; i += 3) {
    const point = toScene([cad.positions[i], cad.positions[i + 1], cad.positions[i + 2]]);

    for (let axis = 0; axis < 3; axis++) {
      positions[i + axis] = point[axis];
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }

  const center: V3 = min.map((value, axis) => (value + max[axis]) / 2) as V3;

  for (let i = 0; i < positions.length; i += 3)
    for (let axis = 0; axis < 3; axis++) positions[i + axis] = r3(positions[i + axis] - center[axis]);

  const edges = cad.edges?.length ? new Array<number>(cad.edges.length) : null;

  for (let i = 0; edges && i < cad.edges!.length; i += 3) {
    const point = toScene([cad.edges![i], cad.edges![i + 1], cad.edges![i + 2]]);

    for (let axis = 0; axis < 3; axis++) edges[i + axis] = r3(point[axis] - center[axis]);
  }

  return {
    positions,
    indices: cad.indices,
    edges,
    center,
    size: min.map((value, axis) => r2(max[axis] - value)),
  };
}

const payload = (positions: number[], edges?: number[] | null): AgentCadPayload => ({
  language: 'replicad',
  code: '',
  positions,
  indices: [2, 0, 1],
  edges,
});

describe('CAD mesh frame conversion', () => {
  it('matches centered coordinates, bounds, edge endpoints and winding across varied meshes', () => {
    for (let sample = 0; sample < 100; sample++) {
      const positions = Array.from({ length: (sample + 1) * 9 }, (_, i) => Math.sin(i * 17 + sample) * 123.456789);
      const cad = payload(positions, positions.slice(3, 9));
      const source = structuredClone(cad);
      const actual = cadMeshToScene(cad);

      expect(actual).toStrictEqual(previous(cad));
      expect(actual.indices).toBe(cad.indices);
      expect(cad).toStrictEqual(source);
      expect(cadMeshToScene(cad).positions).not.toBe(actual.positions);
      cad.positions[0] += 1000;
      expect(cadMeshToScene(cad)).toStrictEqual(previous(cad));
    }
  });

  it('preserves empty, nonfinite, signed-zero and incomplete coordinate behavior', () => {
    const fixtures = [[], [0, -0, 0], [Infinity, 1, -Infinity], [NaN, 2, 3], [1], [1, 2]];

    for (const positions of fixtures) {
      for (const edges of [undefined, null, [], [0, -0, 0], [1], [1, 2], [Infinity, NaN, -Infinity]]) {
        const cad = payload(positions, edges);

        expect(cadMeshToScene(cad)).toStrictEqual(previous(cad));
      }
    }
  });
});
