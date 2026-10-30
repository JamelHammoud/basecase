import { describe, expect, it } from 'vitest';
import type { Port } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import { declareJoints } from '../workspace/agentBuildRequests';
import { toCad, type V3 } from './agentFrame';
import { applySpec, specToPart, type AgentCadPayload } from './agentScene';
import { followMates } from './mateFollow';
import { planMate } from './mate';
import { mateJointSpec } from './mateJoint';
import { findPort, worldPort } from './ports';

function boxCad(size: V3, ports: Port[]): AgentCadPayload {
  const [x, y, z] = size;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [i & 1 ? x : 0, i & 2 ? y : 0, i & 4 ? z : 0]);

  return {
    language: 'openscad',
    code: `cube([${size.join(', ')}]);`,
    positions: corners,
    indices: [
      0, 2, 3, 0, 3, 1, 4, 5, 7, 4, 7, 6, 0, 1, 5, 0, 5, 4, 2, 6, 7, 2, 7, 3, 0, 4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5,
    ],
    stats: { volume: x * y * z },
    ports,
  };
}

const top = (z: number): Port => ({ name: 'top', position: [15, 15, z], axis: [0, 0, 1], kind: 'face' });
const bore = (name: string): Port => ({ name, position: [15, 15, 0], axis: [0, 0, -1], kind: 'bore' });
const PROJECT = { printer: 'default', material: 'PLA' as const, infillPct: 20 };
const bottom: Port = { name: 'bottom', position: [10, 10, 0], axis: [0, 0, -1], kind: 'face' };

const base = specToPart({ id: 'base', shape: 'cad_part', cad: boxCad([30, 30, 10], [top(10)]), position: [0, 0, 0] });
const loose = specToPart({ id: 'lid', shape: 'cad_part', cad: boxCad([20, 20, 4], [bottom]), position: [40, 0, 0] });

function mated(): ScenePart[] {
  const plan = planMate([base, loose], {
    part: 'lid',
    port: 'bottom',
    target: 'base',
    targetPort: 'top',
    type: 'face',
  });

  if (typeof plan === 'string') throw new Error(plan);

  const lid = applySpec(loose, plan.op.op === 'update' ? plan.op.part : { id: 'lid' });

  return [base, lid];
}

const portAt = (parts: ScenePart[], id: string, name: string) => {
  const part = parts.find((p) => p.id === id)!;

  return worldPort(part, findPort(part, name)!).position;
};

const expectTouching = (parts: ScenePart[]) =>
  portAt(parts, 'lid', 'bottom').forEach((v, k) => expect(v).toBeCloseTo(portAt(parts, 'base', 'top')[k], 2));

describe('recorded mates', () => {
  it('moves the mated part with its target', () => {
    const before = mated();
    const moved = [applySpec(before[0], { id: 'base', position: [5, -20, 30] }), before[1]];
    const result = followMates({ before, after: moved, placed: new Set(['base']) });
    const after = moved.map((p) => result.updated.find((u) => u.id === p.id) ?? p);

    expect(result.followed).toEqual(['lid']);
    expectTouching(after);
  });

  it('follows a remodeled target whose port moved', () => {
    const before = mated();
    const taller = applySpec(before[0], { id: 'base', cad: boxCad([30, 30, 25], [top(25)]) });
    const result = followMates({ before, after: [taller, before[1]], placed: new Set() });

    expect(result.followed).toEqual(['lid']);
    expectTouching([taller, result.updated[0]]);
  });

  it('releases the mate when the agent moves the part itself', () => {
    const before = mated();
    const lid = applySpec(before[1], { id: 'lid', position: [80, 0, 0] });
    const result = followMates({ before, after: [before[0], lid], placed: new Set(['lid']) });

    expect(result.released).toEqual(['lid']);
    expect(result.updated[0].mates).toBeUndefined();
    expect(result.notes[0]).toMatch(/^Released mate lid:bottom → base:top/);
  });

  it('warns by name when the target port disappears', () => {
    const before = mated();
    const plain = applySpec(before[0], { id: 'base', cad: { ...boxCad([30, 30, 12], []), ports: [] } });
    const result = followMates({ before, after: [plain, before[1]], placed: new Set() });

    expect(result.updated).toEqual([]);
    expect(result.notes).toEqual([
      'Broken mate lid:bottom → base:top: base has no port "top". get_ports lists its ports. lid stays where it is; restore the port or mate it again.',
    ]);
  });
});

describe('mate with joint', () => {
  it('declares a coaxial servo mate as a joint driven by that servo', () => {
    const shaft = bore('shaft');
    const link = specToPart({ id: 'link', shape: 'cad_part', cad: boxCad([30, 30, 4], [shaft]), position: [0, 0, 60] });
    const servo = specToPart({ id: 'servo', catalog: 'component:feetech-sts3215|c018', position: [0, 0, 0] });
    const args = { part: 'link', port: 'shaft', target: 'servo', targetPort: 'output', type: 'coaxial' as const };
    const plan = planMate([servo, link], args);

    if (typeof plan === 'string') throw new Error(plan);

    const spec = mateJointSpec([servo, link], { ...args, joint: { id: 'elbow', range: [-90, 90] } }, plan.target);

    if (typeof spec === 'string') throw new Error(spec);

    expect(spec).toMatchObject({ type: 'revolute', parent: ['servo'], child: ['link'], actuators: ['servo'] });

    const { next } = declareJoints({ joints: [spec] }, [servo, link], PROJECT, () => null);
    const elbow = next.joints![0];

    toCad(elbow.origin).forEach((v, k) => expect(v).toBeCloseTo(toCad(plan.target.position)[k], 2));
    expect(elbow.range).toEqual([-90, 90]);
  });

  it('refuses a face mate', () => {
    const spec = mateJointSpec(
      [],
      { part: 'a', port: 'p', target: 'b', targetPort: 'q', type: 'face', joint: { id: 'j' } },
      {
        position: [0, 0, 0],
        axis: [0, 1, 0],
      },
    );

    expect(spec).toBe('A joint needs a coaxial or slider mate, not face.');
  });
});
