import { describe, expect, it } from 'vitest';
import type { CadBody } from '../utils/platform/types';
import { cadParts } from './cadImport';
import { isCadFileName, isMeshFileName } from './meshImport';

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

  it('takes STEP and IGES through the mesh import on desktop', () => {
    for (const name of ['a.step', 'b.STP', 'c.iges', 'd.igs']) {
      expect(isMeshFileName(name), name).toBe(true);
      expect(isCadFileName(name), name).toBe(true);
    }

    expect(isCadFileName('e.stl')).toBe(false);
  });
});
