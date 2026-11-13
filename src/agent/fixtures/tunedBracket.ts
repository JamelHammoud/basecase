import type { Port } from '../../types/ports';
import type { ScenePart } from '../../types/robotics';
import type { CadTuneAnswer } from '../../utils/platform/types';
import type { V3 } from '../agentFrame';
import { applySpec, specToPart, type AgentCadPayload } from '../agentScene';
import { planMate } from '../mate';

export const BRACKET_CODE = `include <robotics.scad>
// Servo mount plate. Print flat.
wall = 2; // [1:0.5:6]
cube([40, 30, wall]);`;

const BOX_INDICES = [
  0, 2, 3, 0, 3, 1, 4, 5, 7, 4, 7, 6, 0, 1, 5, 0, 5, 4, 2, 6, 7, 2, 7, 3, 0, 4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5,
];

const top = (z: number): Port => ({ name: 'top', position: [20, 15, z], axis: [0, 0, 1], kind: 'face' });

function boxResult(size: V3) {
  const [x, y, z] = size;

  return {
    ok: true,
    positions: [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [i & 1 ? x : 0, i & 2 ? y : 0, i & 4 ? z : 0]),
    indices: BOX_INDICES,
    edges: null,
    stats: { volume: x * y * z, triangles: 12, bbox: { min: [0, 0, 0], max: size, size } },
    audit: {
      bodies: 1,
      genus: 0,
      nonManifoldEdges: 0,
      openEdges: 0,
      hullVolume: x * y * z,
      ports: [top(z)],
      checks: [],
    },
  };
}

function bracketCad(wall: number): AgentCadPayload {
  const res = boxResult([40, 30, wall]);

  return { language: 'openscad', code: BRACKET_CODE, ...res, ports: res.audit.ports };
}

export function bracketAndServo(): ScenePart[] {
  const bracket = specToPart({ id: 'bracket', name: 'Bracket', shape: 'cad_part', cad: bracketCad(2) });
  const loose = specToPart({ id: 'servo', catalog: 'component:feetech-sts3215', position: [0, 80, 40] });
  const mate = { part: 'servo', port: 'idler', target: 'bracket', targetPort: 'top', type: 'face' as const };
  const plan = planMate([bracket, loose], mate);

  if (typeof plan === 'string') throw new Error(plan);

  return [bracket, applySpec(loose, plan.op.op === 'update' ? plan.op.part : { id: 'servo' })];
}

export const tunedAnswer = (wall: number): CadTuneAnswer => ({
  code: BRACKET_CODE.replace('wall = 2;', `wall = ${wall};`),
  result: boxResult([40, 30, wall]),
});
