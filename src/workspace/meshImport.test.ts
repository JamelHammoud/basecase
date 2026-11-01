import { describe, expect, it } from 'vitest';
import { isPrinted } from '../utils/bom';
import { meshPartFromFile } from './meshImport';

function boxStl([x, y, z]: [number, number, number]): string {
  const corners = [
    [0, 0, 0],
    [x, 0, 0],
    [x, y, 0],
    [0, y, 0],
    [0, 0, z],
    [x, 0, z],
    [x, y, z],
    [0, y, z],
  ];
  const faces = [
    [0, 2, 1, 0, 3, 2],
    [4, 5, 6, 4, 6, 7],
    [0, 1, 5, 0, 5, 4],
    [3, 7, 6, 3, 6, 2],
    [0, 4, 7, 0, 7, 3],
    [1, 2, 6, 1, 6, 5],
  ];
  const facets = faces.flatMap((f) => [f.slice(0, 3), f.slice(3)]);
  const body = facets
    .map(
      (t) =>
        `facet normal 0 0 0\nouter loop\n${t.map((i) => `vertex ${corners[i].join(' ')}`).join('\n')}\nendloop\nendfacet`,
    )
    .join('\n');

  return `solid box\n${body}\nendsolid box\n`;
}

describe('mesh import', () => {
  it('turns a Z-up STL into a printable part standing on the drop point', async () => {
    const file = new File([boxStl([10, 20, 30])], 'bracket.stl');
    const part = await meshPartFromFile({ file, id: 'mesh-1', at: [50, 0, -20] });

    expect(part.name).toBe('bracket');
    expect(part.dimensions).toEqual({ width: 10, height: 30, depth: 20 });
    expect(part.position).toEqual([50, 15, -20]);
    expect(part.mesh?.indices).toHaveLength(36);
    expect(isPrinted(part)).toBe(true);
  });

  it('reads a model drawn in metres at real size', async () => {
    const file = new File([boxStl([0.04, 0.02, 0.01])], 'tiny.stl');
    const part = await meshPartFromFile({ file, id: 'mesh-2' });

    expect(part.dimensions).toEqual({ width: 40, height: 10, depth: 20 });
  });
});
