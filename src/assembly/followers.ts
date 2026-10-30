import type { RobotJoint } from '../types/robotics';
import { downstreamOf } from '../utils/engineeringMass';
import type { ChainResult } from './assemblyTypes';

export type Clamps = Record<string, string[]>;

export function clampsOf(chains: ChainResult): Clamps {
  const out: Clamps = {};

  for (const c of chains.screws) out[c.id] = c.stack;

  for (const s of chains.sleeves) {
    if (s.kind === 'insert' && s.host) out[s.id] = [s.host];
    else if (s.screw) out[s.id] = [`@${s.screw}`];
  }

  return out;
}

const listedIds = (joints: RobotJoint[]) =>
  new Set(joints.flatMap((j) => [...j.child, ...j.parent, ...(j.actuators ?? [])]));

interface Reach {
  joint: RobotJoint;
  down: Set<string>;
}

function carrierOf(clamped: string[], reaches: Reach[]): Reach | null {
  let best: Reach | null = null;

  for (const r of reaches) {
    const actuators = new Set(r.joint.actuators ?? []);
    const rest = clamped.filter((id) => !actuators.has(id));
    const moves = rest.length > 0 && rest.every((id) => r.down.has(id));

    if (moves && (!best || r.down.size < best.down.size)) best = r;
  }

  return best;
}

export function fastenerCarriers(joints: RobotJoint[], clamps: Clamps): Map<string, string> {
  const listed = listedIds(joints);
  const reaches = joints.map((joint) => ({ joint, down: downstreamOf(joint, joints) }));
  const carrier = new Map<string, string>();
  const direct = Object.entries(clamps).filter(([id, c]) => !listed.has(id) && !c[0]?.startsWith('@'));

  for (const [id, clamped] of direct) {
    const r = carrierOf(clamped, reaches);

    if (r) carrier.set(id, r.joint.id);
  }

  for (const [id, clamped] of Object.entries(clamps)) {
    const screw = clamped[0]?.startsWith('@') ? clamped[0].slice(1) : null;
    const via = screw ? carrier.get(screw) : undefined;

    if (via && !listed.has(id)) carrier.set(id, via);
  }

  return carrier;
}

export function withFastenerFollowers(joints: RobotJoint[], clamps: Clamps | null | undefined): RobotJoint[] {
  if (!clamps || !joints.length) return joints;

  const carrier = fastenerCarriers(joints, clamps);

  if (!carrier.size) return joints;

  const added = new Map<string, string[]>();

  for (const [id, jointId] of carrier) added.set(jointId, [...(added.get(jointId) ?? []), id]);

  return joints.map((j) => (added.has(j.id) ? { ...j, child: [...j.child, ...added.get(j.id)!] } : j));
}
