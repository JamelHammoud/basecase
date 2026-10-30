import type { RobotJoint } from '../types/robotics';
import { MIN_CROUCH_DEG } from './actuatorRules';
import { downstreamOf } from './engineeringMass';
import { norm } from './engineeringMath';
import type { CheckContext } from './engineeringTypes';

export interface CrouchModel {
  crouchDeg: number;
  fromGait: boolean;
  legs: number;
  share: number;
  levers: Map<string, number>;
  knees: Set<string>;
}

const PITCH_AXIS = 0.9;

const isPitch = (j: RobotJoint) => Math.abs(norm(j.axis)[0]) >= PITCH_AXIS;

interface Chain {
  feet: Set<string>;
  joints: RobotJoint[];
}

function legChains(ctx: CheckContext): RobotJoint[][] {
  const chains: Chain[] = [];

  for (const j of ctx.joints) {
    if (j.limb !== 'leg' || j.type !== 'revolute') continue;

    const down = downstreamOf(j, ctx.joints);
    const feet = ctx.onFloor.filter((p) => down.has(p.id)).map((p) => p.id);
    const touching = chains.filter((c) => feet.some((id) => c.feet.has(id)));

    if (!feet.length) continue;

    const merged: Chain = {
      feet: new Set([...feet, ...touching.flatMap((c) => [...c.feet])]),
      joints: [...touching.flatMap((c) => c.joints), j],
    };

    for (const c of touching) chains.splice(chains.indexOf(c), 1);

    chains.push(merged);
  }

  return chains.map((c) => c.joints);
}

function soleOf(ctx: CheckContext, chain: RobotJoint[]): number {
  const down = downstreamOf(chain[chain.length - 1], ctx.joints);
  const soles = ctx.onFloor.filter((p) => down.has(p.id)).map((p) => ctx.measures[p.id]?.min[1] ?? 0);

  return soles.length ? Math.min(...soles) : 0;
}

function chainLevers(ctx: CheckContext, chain: RobotJoint[], out: CrouchModel) {
  const pitch = chain.filter(isPitch).sort((a, b) => b.origin[1] - a.origin[1]);

  if (pitch.length < 2) return;

  const heights = pitch.map((j) => j.origin[1]);
  const flatFoot = pitch.length >= 3;

  if (!flatFoot) heights.push(soleOf(ctx, chain));

  let offset = 0;
  let sign = 1;

  for (let i = heights.length - 2; i >= 0; i--) {
    offset += sign * (heights[i] - heights[i + 1]);
    sign = -sign;
    out.levers.set(pitch[i].id, offset);
  }

  if (flatFoot) out.levers.set(pitch[pitch.length - 1].id, 0);

  out.knees.add(pitch[flatFoot ? pitch.length - 2 : pitch.length - 1].id);
}

function gaitCrouch(ctx: CheckContext, knees: Set<string>): number | undefined {
  const gaits = (ctx.project.animations ?? []).filter((a) => a.source === 'gait' || /walk|gait/i.test(a.name));
  let best: number | undefined;

  for (const a of gaits)
    for (const id of knees) {
      const values = a.keyframes.map((k) => k.values[id]).filter((v): v is number => typeof v === 'number');

      if (values.length) best = Math.max(best ?? 0, Math.min(...values.map(Math.abs)));
    }

  return best;
}

export function crouchModel(ctx: CheckContext): CrouchModel {
  const chains = legChains(ctx);
  const model: CrouchModel = {
    crouchDeg: MIN_CROUCH_DEG,
    fromGait: false,
    legs: chains.length,
    share: chains.length >= 3 ? 0.5 : 1,
    levers: new Map(),
    knees: new Set(),
  };

  for (const chain of chains) chainLevers(ctx, chain, model);

  const gait = gaitCrouch(ctx, model.knees);

  if (gait !== undefined && gait > MIN_CROUCH_DEG) {
    model.crouchDeg = gait;
    model.fromGait = true;
  }

  return model;
}
