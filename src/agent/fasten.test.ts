import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { toCad, type V3 } from './agentFrame';
import { applySpec, specToPart, type AgentCadPayload, type AgentPartSpec } from './agentScene';
import { planFasten, type FastenPlan } from './fasten';
import { planMate } from './mate';
import { findPort, worldPort } from './ports';

function boxCad(size: V3, extra: Partial<AgentCadPayload> = {}): AgentCadPayload {
  const [x, y, z] = size;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [i & 1 ? x : 0, i & 2 ? y : 0, i & 4 ? z : 0]);
  const quads = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];

  return {
    language: 'openscad',
    code: `include <robotics.scad>\ncube([${size.join(', ')}]);`,
    positions: corners,
    indices: quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]),
    stats: { volume: x * y * z },
    ...extra,
  };
}

const plate = (id: string, size: V3, at: V3, extra?: Partial<AgentCadPayload>) =>
  specToPart({ id, shape: 'cad_part', cad: boxCad(size, extra), position: at });

const added = (plan: FastenPlan) => plan.ops.map((o) => (o.op === 'add' ? o.part : null)) as AgentPartSpec[];

describe('fasten', () => {
  const lid = plate('lid', [30, 30, 4], [-15, -15, 10]);
  const base = plate('base', [30, 30, 10], [-15, -15, 0]);

  it('picks the stock length for a heat-set insert and cuts both holes', () => {
    const plan = planFasten([lid, base], {
      size: 'M3',
      through: ['lid', 'base'],
      into: 'insert',
      at: [0, 0, 14],
      from: [0, 0, 1],
    });

    if (typeof plan === 'string') throw new Error(plan);

    const [screw, insert] = added(plan);

    expect(screw.catalog).toBe('hardware:socket_head|M3|10');
    expect(screw.position).toEqual([0, 0, 10.5]);
    expect(screw.rotation).toEqual([0, 0, 0]);
    expect(insert.catalog).toBe('hardware:heat_insert|M3');
    expect(insert.position).toEqual([0, 0, 7.15]);
    expect(plan.recode.map((r) => r.id)).toEqual(['lid', 'base']);
    expect(plan.recode[0].code).toContain('difference()');
    expect(plan.recode[1].code).toContain('cylinder(d = 4.2');
    expect(plan.text).toContain('grip 4 mm');
    expect(plan.text).toContain('Driver access: clear');
  });

  it('reports a blocked driver', () => {
    const roof = plate('roof', [40, 40, 3], [-20, -20, 40]);
    const plan = planFasten([lid, base, roof], {
      size: 'M3',
      through: ['lid', 'base'],
      into: 'insert',
      at: [0, 0, 14],
      from: [0, 0, 1],
    });

    expect(typeof plan === 'string' ? plan : plan.text).toContain('roof is');
  });

  it('threads into a servo horn port with the length the datasheet names', () => {
    const servo = specToPart({ id: 'servo', catalog: 'component:feetech-sts3215|c018', position: [0, 0, -18.35] });
    const bracket = plate('bracket', [30, 30, 3], [-20, -15, 0]);
    const plan = planFasten([servo, bracket], { size: 'M3', through: ['bracket'], into: 'servo:horn-1' });

    if (typeof plan === 'string') throw new Error(plan);

    const [screw] = added(plan);
    const hole = worldPort(servo, findPort(servo, 'horn-1')!);

    expect(screw.catalog).toBe('hardware:socket_head|M3|6');
    expect(screw.position![0]).toBeCloseTo(toCad(hole.position)[0], 2);
    expect(screw.position![1]).toBeCloseTo(toCad(hole.position)[1], 2);
  });

  it('refuses a stack no stock screw fits', () => {
    const thin = plate('thin', [30, 30, 2], [-15, -15, 0]);
    const plan = planFasten([lid, thin], {
      size: 'M3',
      through: ['lid', 'thin'],
      into: 'insert',
      at: [0, 0, 14],
      from: [0, 0, 1],
    });

    expect(plan).toContain('No stock M3 screw fits');
  });
});

describe('mate', () => {
  it('puts the servo output on a declared bore, facing it', () => {
    const ports = [{ name: 'bore', position: [15, 15, 0] as V3, axis: [0, 0, -1] as V3, kind: 'bore' as const }];
    const plain = plate('bracket', [30, 30, 3], [10, 20, 50]);
    const bracket = { ...plain, cad: { ...plain.cad!, ports } };
    const servo: ScenePart = specToPart({
      id: 'servo',
      catalog: 'component:feetech-sts3215|c018',
      position: [0, 0, 0],
      rotation: [20, 0, 0],
    });
    const plan = planMate([servo, bracket], {
      part: 'servo',
      port: 'output',
      target: 'bracket',
      targetPort: 'bore',
      type: 'fastened',
      turns: 1,
    });

    if (typeof plan === 'string') throw new Error(plan);

    const moved = applySpec(servo, plan.op.op === 'update' ? plan.op.part : { id: 'servo' });
    const out = worldPort(moved, findPort(moved, 'output')!);
    const bore = worldPort(bracket, findPort(bracket, 'bore')!);

    out.position.forEach((v, k) => expect(v).toBeCloseTo(bore.position[k], 1));
    out.axis.forEach((v, k) => expect(v).toBeCloseTo(-bore.axis[k], 2));
    expect(moved.mates).toEqual([
      { port: 'output', target: 'bracket', targetPort: 'bore', type: 'fastened', turns: 1 },
    ]);
  });
});
