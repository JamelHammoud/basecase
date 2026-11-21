import { finishAppearance } from '../appearance/model';
import { expect, it } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { copySourceKeys } from './copySource';
import { shapeKey } from './shapeKey';

it('distinguishes changed mesh topology and coordinates below the readiness-key rounding', () => {
  const part = {
    ...box('printed', [0, 0, 0], [10, 10, 10], 1),
    mesh: {
      positions: [0, 0, 0, 10, 0, 0, 0, 10, 0],
      indices: [0, 1, 2],
      baseSize: [10, 10, 10] as [number, number, number],
    },
  };
  const topology = { ...part, mesh: { ...part.mesh, indices: [0, 2, 1] } };
  const coordinates = { ...part, mesh: { ...part.mesh, positions: [0.000001, 0, 0, 10, 0, 0, 0, 10, 0] } };

  expect(shapeKey(part)).toBe(shapeKey(topology));
  expect(shapeKey(part)).toBe(shapeKey(coordinates));
  expect(copySourceKeys([part]).printed).not.toBe(copySourceKeys([topology]).printed);
  expect(copySourceKeys([part]).printed).not.toBe(copySourceKeys([coordinates]).printed);
});

it('retains source identity across presentation, copy quantity and JSON field ordering changes', () => {
  const part = box('printed', [0, 0, 0], [10, 10, 10], 1);
  const renamed = {
    ...part,
    name: 'Renamed',
    color: '#000000',
    print: { copies: 20 },
    position: [20, 0, 0] as [number, number, number],
    dimensions: { depth: 10, width: 10, height: 10 },
  };

  expect(copySourceKeys([part])).toEqual(copySourceKeys([renamed]));
  expect(copySourceKeys([{ ...part, dimensions: { ...part.dimensions, width: 11 } }])).not.toEqual(
    copySourceKeys([part]),
  );
});

it('binds the captured manufacturing mesh and treats worker buffers and retained arrays identically', () => {
  const part = box('printed', [0, 0, 0], [10, 10, 10], 1);
  const positions = [0, 0, 0, 10, 0, 0, 0, 10, 0];
  const indices = [0, 1, 2];
  const retained = { printed: { positions, indices } };
  const worker = { printed: { positions: new Float32Array(positions), indices: new Uint32Array(indices) } };

  expect(copySourceKeys([part], retained)).toEqual(copySourceKeys([part], worker));
  expect(copySourceKeys([part], { printed: { positions, indices: [0, 2, 1] } })).not.toEqual(
    copySourceKeys([part], retained),
  );
});

it('preserves physical copy identity across root and nested visual finishes', () => {
  const part = box('printed', [0, 0, 0], [10, 10, 10], 1);
  const child = { ...part, id: 'child' };
  const before = { ...part, boolean: { op: 'union' as const, operands: [child] } };
  const after = {
    ...before,
    appearance: finishAppearance('metal', '#123456'),
    boolean: { ...before.boolean, operands: [{ ...child, appearance: finishAppearance('paint', '#abcdef') }] },
  };

  expect(copySourceKeys([before])).toEqual(copySourceKeys([after]));
  expect(copySourceKeys([{ ...after, dimensions: { ...part.dimensions, width: 11 } }])).not.toEqual(
    copySourceKeys([before]),
  );
});
