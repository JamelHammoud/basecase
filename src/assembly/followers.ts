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

function mountOf(clamped: string[], reaches: Reach[]): Reach | null {
  let best: Reach | null = null;

  for (const r of reaches) {
    const holds = clamped.some((id) => r.joint.parent.includes(id));

    if (holds && (!best || r.down.size > best.down.size)) best = r;
  }

  return best;
}

type Pick = (clamped: string[]) => Reach | null;

function assignFasteners(clamps: Clamps, skip: ReadonlySet<string>, pick: Pick): Map<string, string> {
  const out = new Map<string, string>();
  const direct = Object.entries(clamps).filter(([id, c]) => !skip.has(id) && !c[0]?.startsWith('@'));

  for (const [id, clamped] of direct) {
    const r = pick(clamped);

    if (r) out.set(id, r.joint.id);
  }

  for (const [id, clamped] of Object.entries(clamps)) {
    const screw = clamped[0]?.startsWith('@') ? clamped[0].slice(1) : null;
    const via = screw ? out.get(screw) : undefined;

    if (via && !skip.has(id)) out.set(id, via);
  }

  return out;
}

const reachesOf = (joints: RobotJoint[]): Reach[] =>
  joints.map((joint) => ({ joint, down: downstreamOf(joint, joints) }));

export function fastenerCarriers(joints: RobotJoint[], clamps: Clamps): Map<string, string> {
  const reaches = reachesOf(joints);

  return assignFasteners(clamps, listedIds(joints), (clamped) => carrierOf(clamped, reaches));
}

export function fastenerMounts(joints: RobotJoint[], clamps: Clamps): Map<string, string> {
  const reaches = reachesOf(joints);
  const carried = fastenerCarriers(joints, clamps);
  const skip = new Set([...listedIds(joints), ...carried.keys()]);

  return assignFasteners(clamps, skip, (clamped) => mountOf(clamped, reaches));
}

function byJoint(assigned: Map<string, string>): Map<string, string[]> {
  const out = new Map<string, string[]>();

  for (const [id, jointId] of assigned) out.set(jointId, [...(out.get(jointId) ?? []), id]);

  return out;
}

export function withFastenerFollowers(joints: RobotJoint[], clamps: Clamps | null | undefined): RobotJoint[] {
  if (!clamps || !joints.length) return joints;

  const moving = byJoint(fastenerCarriers(joints, clamps));
  const fixed = byJoint(fastenerMounts(joints, clamps));

  if (!moving.size && !fixed.size) return joints;

  return joints.map((j) =>
    moving.has(j.id) || fixed.has(j.id)
      ? { ...j, child: [...j.child, ...(moving.get(j.id) ?? [])], parent: [...j.parent, ...(fixed.get(j.id) ?? [])] }
      : j,
  );
}
