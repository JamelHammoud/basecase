import { describe, expect, it } from 'vitest';
import { booleanPart } from '../booleans/parts';
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

  it('cuts a plate from sheet at a stock thickness, reports it, and prints it again', () => {
    const plate = specToPart({ id: 'chest', size: [120, 80, 3] });
    const metal = applySpec(plate, { id: 'chest', sheet: { material: 'aluminum' } });

    expect(metal.sheet).toEqual({ material: 'aluminum', thickness: 3.18 });
    expect(snapshotScene([metal]).parts[0]).toMatchObject({ sheet: 'aluminum:3.18', material: undefined });
    expect(applySpec(metal, { id: 'chest', sheet: { material: 'carbon', thickness: 2.2 } }).sheet).toEqual({
      material: 'carbon',
      thickness: 2,
    });
    expect(applySpec(metal, { id: 'chest', sheet: null }).sheet).toBeUndefined();
    expect(applySpec(metal, { id: 'chest', material: 'petg' }).sheet).toBeUndefined();
    expect(specToPart({ id: 'hip', size: [60, 40, 4], sheet: { material: 'acrylic' } }).sheet).toEqual({
      material: 'acrylic',
      thickness: 4.5,
    });

    const legacy = { ...plate, mechanicalTag: 'CNC Aluminum' };

    expect(snapshotScene([legacy]).parts[0].sheet).toBe('aluminum:3.18');
    expect(applySpec(legacy, { id: 'chest', sheet: null }).mechanicalTag).toBe('3D Printed PLA/PETG');

    const chamfered = snapshotScene([{ ...legacy, edges: { kind: 'chamfer', mm: 1 } }]).parts[0];

    expect([chamfered.material, chamfered.sheet]).toEqual(['cnc', undefined]);
  });

  it('rounds a primitive’s edges, clamped to its size, reports them, and makes them sharp again', () => {
    const plate = specToPart({ id: 'plate', size: [40, 20, 10] });
    const rounded = applySpec(plate, { id: 'plate', edges: { kind: 'fillet', mm: 8 } });

    expect(rounded.edges).toEqual({ kind: 'fillet', mm: 4.9 });
    expect(snapshotScene([rounded]).parts[0].edges).toEqual({ kind: 'fillet', mm: 4.9 });
    expect(applySpec(rounded, { id: 'plate', edges: null }).edges).toBeUndefined();
    expect(specToPart({ id: 'ball', shape: 'sphere', edges: { kind: 'chamfer', mm: 2 } }).edges).toBeUndefined();
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

  it('takes bounds from the measured mesh when there is one', () => {
    const wheel = specToPart({
      id: 'wheel',
      shape: 'cylinder',
      size: [100, 20, 100],
      position: [0, 0, 50],
      rotation: [0, 45, 0],
    });
    const [loose] = snapshotScene([wheel]).parts;
    const [tight] = snapshotScene([wheel], { wheel: { min: [-50, 0, -10], max: [50, 100, 10] } }).parts;

    expect(loose.bounds.min[2]).toBeCloseTo(-20.7, 1);
    expect(tight.bounds.min[2]).toBe(0);
    expect(tight.bounds.max[2]).toBe(100);
  });

  it('falls back to the rotated box for a part with no measure', () => {
    const hidden = specToPart({ id: 'hidden', shape: 'box', size: [10, 10, 10], position: [0, 0, 5] });

    expect(snapshotScene([hidden], {}).parts[0].bounds).toEqual(snapshotScene([hidden]).parts[0].bounds);
  });

  it('counts only solids in the overall size', () => {
    const scene = snapshotScene([
      specToPart({ id: 'body', shape: 'box', size: [200, 50, 50], position: [0, 0, 25] }),
      specToPart({ id: 'hole', shape: 'hole_cylinder', size: [1000, 5, 5], position: [0, 0, 25] }),
      {
        ...specToPart({ id: 'ghost', shape: 'box', size: [10, 400, 700], position: [0, 0, 350] }),
        role: 'reference' as const,
      },
    ]);

    expect(scene.bounds?.size).toEqual([200, 50, 50]);
  });

  it('reports a boolean with its operation and its operands as parts, base first', () => {
    const plate = specToPart({ id: 'plate', shape: 'box', size: [40, 30, 4], position: [0, 0, 2] });
    const hole = specToPart({ id: 'hole', shape: 'hole_cylinder', size: [6, 6, 10], position: [5, 0, 2] });
    const [cut] = snapshotScene([booleanPart({ id: 'cut', base: plate, tools: [hole], op: 'subtract' })]).parts;

    expect(cut.kind).toBe('boolean (subtract)');
    expect(cut.operands?.map((o) => [o.id, o.kind, o.operandOf])).toEqual([
      ['plate', 'box', 'cut'],
      ['hole', 'hole_cylinder', 'cut'],
    ]);
    expect(cut.operands?.[1]).toMatchObject({ position: [5, 0, 2], size: [6, 6, 10] });
  });

  it('reports a nested boolean down to its innermost operands', () => {
    const block = specToPart({ id: 'block', shape: 'box', size: [20, 20, 20], position: [0, 0, 10] });
    const knob = specToPart({ id: 'knob', shape: 'box', size: [5, 5, 5], position: [0, 0, 22] });
    const slot = specToPart({ id: 'slot', shape: 'box', size: [4, 30, 4], position: [0, 0, 10] });
    const merged = booleanPart({ id: 'merged', base: block, tools: [knob], op: 'union' });
    const [outer] = snapshotScene([booleanPart({ id: 'outer', base: merged, tools: [slot], op: 'subtract' })]).parts;
    const inner = outer.operands?.[0];

    expect([outer.kind, inner?.kind, inner?.operandOf]).toEqual(['boolean (subtract)', 'boolean (union)', 'outer']);
    expect(inner?.operands?.map((o) => [o.id, o.operandOf])).toEqual([
      ['block', 'merged'],
      ['knob', 'merged'],
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
