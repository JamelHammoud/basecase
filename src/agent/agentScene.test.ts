import { describe, expect, it } from 'vitest';
import {
  agentCatalog,
  applySpec,
  describeOp,
  mirrorParts,
  opTarget,
  rotToCad,
  rotToScene,
  snapshotScene,
  specToPart,
  toCad,
  toScene,
  type AgentPartSpec,
} from './agentScene';

const cube: AgentPartSpec['cad'] = {
  language: 'openscad',
  code: 'cube([10, 20, 30]);',
  positions: [0, 0, 0, 10, 0, 0, 10, 20, 0, 0, 20, 30],
  indices: [0, 1, 2, 0, 2, 3],
  edges: [0, 0, 0, 10, 20, 30],
  stats: { volume: 6000 },
};

describe('agent frame conversions', () => {
  it('round-trips points between agent Z-up and viewport Y-up', () => {
    expect(toScene([1, 2, 3])).toEqual([1, 3, -2]);
    expect(toCad(toScene([1, 2, 3]))).toEqual([1, 2, 3]);
  });

  it('round-trips rotations', () => {
    const deg: [number, number, number] = [30, -20, 45];

    expect(rotToScene([0, 0, 90])).toEqual([0, 90, 0]);
    rotToCad(rotToScene(deg)).forEach((v, i) => expect(Math.abs(v - deg[i])).toBeLessThanOrEqual(0.2));
  });
});

describe('specToPart and applySpec', () => {
  it('builds catalog, CAD and primitive parts', () => {
    const parts = [
      specToPart({
        id: 'servo',
        catalog: 'component:feetech-sts3215|c001',
        position: [10, 0, 5],
        rotation: [0, 0, 90],
      }),
      specToPart({ id: 'screw', catalog: 'hardware:socket_head|M3|10', group: 'Left Arm' }),
      specToPart({ id: 'shell', shape: 'cad_part', cad: cube, position: [5, 5, 0], material: 'petg', role: 'cutout' }),
      specToPart({ id: 'hole', shape: 'hole_round', size: [5, 5, 12] }),
      specToPart({ id: 'axis', shape: 'pivot_axis' }),
      specToPart({ id: 'pack', shape: 'box', size: [40, 30, 20], supply: 'supply:lipo-2s-2200', thickness: 2 }),
    ];

    expect(parts).toMatchSnapshot();
  });

  it('rejects unknown catalog keys and versions', () => {
    expect(() => specToPart({ id: 'x', catalog: 'component:nope' })).toThrow(/Unknown catalog part/);
    expect(() => specToPart({ id: 'x', catalog: 'component:feetech-sts3215|zzz' })).toThrow(/comes in/);
    expect(() => specToPart({ id: 'x', supply: 'supply:nope' })).toThrow(/Unknown supply/);
  });

  it('updates parts in place, keeping CAD placement', () => {
    const shell = specToPart({ id: 'shell', shape: 'cad_part', cad: cube, position: [5, 5, 0] });
    const block = specToPart({ id: 'block', size: [10, 10, 10] });

    expect([
      applySpec(shell, { id: 'shell', rotation: [0, 0, 45], name: 'Shell', material: 'tpu', supply: '' }),
      applySpec(block, {
        id: 'block',
        size: [20, 30, 40],
        position: [1, 2, 3],
        group: 'Body',
        note: 'n',
        color: '#fff',
      }),
    ]).toMatchSnapshot();
  });
});

describe('scene ops', () => {
  const parts = [
    specToPart({
      id: 'left-arm',
      name: 'Left Arm',
      shape: 'box',
      size: [10, 20, 30],
      position: [40, 0, 15],
      group: 'Left',
    }),
    specToPart({ id: 'shell', name: 'Top Shell', shape: 'cad_part', cad: cube, position: [0, 10, 0] }),
  ];

  it('mirrors parts and swaps side words', () => {
    expect(mirrorParts(parts, ['left-arm', 'shell'], 'x', {})).toMatchSnapshot();
    expect(mirrorParts(parts, ['shell'], 'z', { shell: 'bottom-shell' }).map((p) => [p.id, p.name])).toEqual([
      ['bottom-shell', 'Bottom Shell'],
    ]);
  });

  it('snapshots the scene in the agent frame', () => {
    expect(snapshotScene(parts)).toMatchSnapshot();
  });

  it('finds where each op lands', () => {
    expect([
      opTarget({ op: 'add', part: { id: 'a', position: [1, 2, 3], size: [1, 1, 4] } }, parts),
      opTarget({ op: 'add', part: { id: 'b', shape: 'cad_part', cad: cube, position: [1, 2, 3] } }, parts),
      opTarget({ op: 'add', part: { id: 'c' } }, parts),
      opTarget({ op: 'update', part: { id: 'missing', position: [1, 2, 3] } }, parts),
      opTarget({ op: 'update', part: { id: 'left-arm', position: [1, 2, 3] } }, parts),
      opTarget({ op: 'delete', id: 'left-arm' }, parts),
      opTarget({ op: 'mirror', ids: ['left-arm'], axis: 'x', rename: {} }, parts),
      opTarget({ op: 'mirror', ids: ['left-arm'], axis: 'y', rename: {} }, parts),
      opTarget({ op: 'mirror', ids: ['left-arm'], axis: 'z', rename: {} }, parts),
    ]).toMatchSnapshot();
    expect(describeOp({ op: 'mirror', ids: ['a', 'b'], axis: 'x', rename: {} }, parts)).toBe('2 parts');
  });
});

describe('agentCatalog', () => {
  it('lists matching components, hardware and supplies', () => {
    expect(agentCatalog('sts3215')).toMatchSnapshot();
    expect(agentCatalog('socket')).toMatchSnapshot();
    expect(agentCatalog('lipo')).toMatchSnapshot();
    expect(agentCatalog('zzzz-nothing')).toBe(
      'Nothing in the catalog matches "zzzz-nothing". Call find_parts with no query to see everything.',
    );
  });
});
