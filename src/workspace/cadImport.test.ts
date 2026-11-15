import { describe, expect, it } from 'vitest';
import type { CadBody } from '../utils/platform/types';
import { cadParts } from './cadImport';
import { importKindOf, isCadFileName } from './importRoute';

const TRIANGLE = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] };

function opened(bodies: Array<Pick<CadBody, 'name' | 'center' | 'size'>>) {
  const listed = bodies.map((b) => ({ ...b, color: '#cc3333', vertices: 3, triangles: 1 }));
  const chunks = listed.flatMap(() => [
    new Uint8Array(new Float32Array(TRIANGLE.positions).buffer),
    new Uint8Array(new Uint32Array(TRIANGLE.indices).buffer),
  ]);

  return { bodies: listed, data: new Uint8Array(chunks.flatMap((c) => [...c])) };
}

let ids = 0;
const newId = (prefix: string) => `${prefix}-${++ids}`;

describe('CAD import', () => {
  it('places each body as its own part, grouped under the file name, standing on the drop point', () => {
    const parts = cadParts(
      opened([
        { name: 'Base Plate', center: [0, 3.175, 0], size: [50.8, 6.35, 25.4] },
        { name: '', center: [76.2, 12.7, 0], size: [12.7, 25.4, 12.7] },
      ]),
      { name: 'stand', file: 'stand.step', at: [100, 0, -20], newId },
    );

    expect(parts.map((p) => p.name)).toEqual(['Base Plate', 'stand 2']);
    expect(new Set(parts.map((p) => p.group?.id)).size).toBe(1);
    expect(parts[0].group?.name).toBe('stand');
    expect(parts.map((p) => p.position)).toEqual([
      [71.43, 3.18, -20],
      [147.63, 12.7, -20],
    ]);
    expect(parts[1].dimensions).toEqual({ width: 12.7, height: 25.4, depth: 12.7 });
    expect(parts[0]).toMatchObject({ kind: 'mesh', color: '#cc3333', mesh: TRIANGLE });
  });

  it('leaves a single body ungrouped', () => {
    const [part] = cadParts(opened([{ name: '', center: [0, 0, 0], size: [1, 2, 3] }]), {
      name: 'bracket',
      file: 'bracket.igs',
      newId,
    });

    expect(part).toMatchObject({ name: 'bracket', position: [0, 1, 0] });
    expect(part.group).toBeUndefined();
  });

  it('places a full 1,000-body file using its outer bounds before rounding its parts', () => {
    const bodies = Array.from({ length: 1000 }, (_, i) => ({
      name: `Body ${i}`,
      center: [i * 10 - 5000, i % 2 ? -3.125 : 7, -20] as [number, number, number],
      size: [4.5, 2.25, 6] as [number, number, number],
    }));
    const parts = cadParts(opened(bodies), { name: 'array', file: 'array.step', at: [5, 12, -7], newId });

    expect(parts).toHaveLength(1000);
    expect(parts[0].position).toEqual([-4990, 23.25, -7]);
    expect(parts[999].position).toEqual([5000, 13.13, -7]);
    expect(parts[0].group).toEqual(parts[999].group);
  });

  it('takes STEP and IGES through the mesh import on desktop', () => {
    for (const name of ['a.step', 'b.STP', 'c.iges', 'd.igs']) {
      expect(importKindOf(name, { cad: true }), name).toBe('parts');
      expect(isCadFileName(name), name).toBe(true);
    }

    expect(isCadFileName('e.stl')).toBe(false);
  });
});
