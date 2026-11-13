import type { Port } from '../../types/ports';
import type { ScenePart } from '../../types/robotics';
import type { V3 } from '../agentFrame';
import { specToPart, type AgentCadPayload } from '../agentScene';
import { findPort, worldPort } from '../ports';

function plateCad(size: V3, ports: Port[]): AgentCadPayload {
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

export const HORN_CIRCLE: Port = {
  name: 'horn',
  position: [20, 20, 0],
  axis: [0, 0, -1],
  kind: 'hole_circle',
  thread: 'M3',
  pitchDiameterMm: 14,
  count: 4,
  ref: [1, 0, 0],
};

export const PIVOT: Port = { name: 'pivot', position: [60, 20, 0], axis: [0, 0, -1], kind: 'bore', diameterMm: 20.5 };

export const M5: Port = { name: 'm5', position: [90, 20, 0], axis: [0, 0, -1], kind: 'screw', thread: 'M5' };

export const snapBracket = (): ScenePart =>
  specToPart({
    id: 'bracket',
    name: 'Bracket',
    shape: 'cad_part',
    cad: plateCad([100, 40, 4], [HORN_CIRCLE, PIVOT, M5]),
    position: [0, 0, 100],
  });

export const servoAt = (position: V3): ScenePart =>
  specToPart({ id: 'servo', catalog: 'component:feetech-sts3215', position, rotation: [0, 0, 0] });

export const portOf = (part: ScenePart, name: string) => worldPort(part, findPort(part, name)!);

export function servoWithPortNear(portName: string, target: ScenePart, targetPort: string, nudge: V3): ScenePart {
  const servo = servoAt([0, 0, 0]);
  const own = portOf(servo, portName).position;
  const want = portOf(target, targetPort).position;

  return { ...servo, position: [0, 1, 2].map((k) => want[k] - own[k] + nudge[k]) as V3 };
}
