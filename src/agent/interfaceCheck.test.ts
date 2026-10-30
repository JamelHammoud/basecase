import { describe, expect, it } from 'vitest';
import type { FastenerChain } from '../assembly/assemblyTypes';
import type { Port } from '../types/ports';
import type { V3 } from './agentFrame';
import { toScene } from './agentFrame';
import { specToPart, type AgentCadPayload } from './agentScene';
import { checkInterfaces, interfaceText, type InterfaceCheckInput } from './interfaceCheck';
import { buildInterfaces, type ContractInput } from './interfaces';

function boxCad(size: V3, ports: Port[] = []): AgentCadPayload {
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

const bore = (name: string, at: V3, axis: V3 = [0, 0, 1]): Port => ({ name, position: at, axis, kind: 'bore' });

function bracket(hipY: number) {
  return specToPart({
    id: 'hip-bracket',
    shape: 'cad_part',
    cad: boxCad(
      [40, 30, 20],
      [bore('hip', [20, hipY, 10], [1, 0, 0]), bore('mount-1', [10, 15, 20]), bore('mount-2', [30, 15, 20])],
    ),
    position: [20, -15, 280],
  });
}

const shell = specToPart({
  id: 'torso-shell',
  shape: 'cad_part',
  cad: boxCad([120, 80, 150]),
  position: [-60, -40, 300],
});
const battery = specToPart({ id: 'battery', shape: 'box', size: [60, 30, 20], position: [0, 0, 380] });

const LEG: ContractInput = {
  owner: 'Left leg',
  ids: ['hip-bracket'],
  envelopes: [{ min: [10, -30, 0], max: [90, 30, 305] }],
  datums: [{ name: 'hip axis', joint: 'left-hip' }],
  bolt_patterns: [
    {
      name: 'hip mount',
      size: 'M3',
      axis: [0, 0, 1],
      points: [
        [30, 0, 300],
        [50, 0, 300],
      ],
    },
  ],
  seams: [{ with: 'Torso', size: 'M3', count: 1 }],
};

const TORSO: ContractInput = { owner: 'Torso', ids: ['torso-shell', 'battery'] };

const seamScrew: FastenerChain = {
  id: 'hip-m3',
  d: 3,
  axis: toScene([0, 0, -1]),
  tip: toScene([30, 0, 290]),
  top: toScene([30, 0, 306]),
  headR: 2.75,
  stack: ['hip-bracket', 'torso-shell'],
  endsIn: { kind: 'insert' },
  engagementMm: 4,
  needMm: 4,
  problems: [],
};

function input(hipY: number, edits: string[]): InterfaceCheckInput {
  const parts = [bracket(hipY), shell, battery];
  const frameOf = (id: string) =>
    id === 'left-hip' ? { origin: [60, 0, 290] as V3, axis: [1, 0, 0] as V3 } : undefined;
  const { plan } = buildInterfaces({ contracts: [LEG, TORSO] }, undefined, { parts, frameOf });

  return { owner: 'left leg', plan, parts, frameOf, chains: [seamScrew], edits };
}

describe('check_interfaces', () => {
  it('passes a subassembly that keeps its contract', () => {
    const check = checkInterfaces(input(15, ['hip-bracket', 'torso-shell']));

    if (typeof check === 'string') throw new Error(check);

    expect(check.problems).toEqual([]);
    expect(interfaceText('Left leg', check)).toBe(
      'Interfaces for Left leg: pass. You can hand back.\n' +
        'Passed: envelope (1 parts), datum hip axis (hip-bracket:hip), bolt pattern hip mount (2 M3), seam with Torso (1 M3), ' +
        'ownership (holes cut across seams in torso-shell).',
    );
  });

  it('names every broken promise', () => {
    const run = input(15, ['hip-bracket', 'battery']);
    const moved = run.parts.map((p) =>
      p.id === 'hip-bracket' ? { ...p, position: [p.position[0] + 1, p.position[1] + 10, p.position[2]] as V3 } : p,
    );
    const check = checkInterfaces({ ...run, parts: moved, chains: [] });

    if (typeof check === 'string') throw new Error(check);

    expect(check.pass).toBe(false);
    expect(check.problems).toEqual([
      'Envelope: hip-bracket is 5 mm outside its envelope.',
      'Datum hip axis: nearest port hip-bracket:hip is 10 mm off the axis at [60, 0, 290] along [1, 0, 0].',
      'Bolt pattern hip mount: 0 of 2 M3 holes found; none at [30, 0, 300], [50, 0, 300].',
      'Seam with Torso: 0 of 1 M3 screws cross it. Use fasten through both sides.',
      "Ownership: edited battery, which Left leg doesn't own. Undo those edits, or ask the lead to move them into this contract.",
    ]);
  });

  it('measures a datum to 0.2 mm', () => {
    const check = checkInterfaces(input(15.3, []));

    expect(typeof check !== 'string' && check.problems).toEqual([
      'Datum hip axis: nearest port hip-bracket:hip is 0.3 mm off the axis at [60, 0, 290] along [1, 0, 0].',
    ]);
  });

  it('asks for a contract it does not have', () => {
    expect(checkInterfaces({ ...input(15, []), owner: 'Head' })).toBe(
      'No contract for "Head". Contracts: Left leg, Torso.',
    );
  });
});
