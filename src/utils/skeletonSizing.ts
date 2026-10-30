import { componentWeightG } from '../data/components';
import type { RobotSkeleton, SkeletonJoint, ZUpVec } from '../types/skeleton';
import type { SizingInput, SizingJoint } from './actuatorSizing';
import { crouchTorque, MIN_CROUCH_DEG } from './actuatorRules';
import { cross, dot, G, norm, type V3 } from './engineeringMath';
import { swingTorque } from './engineeringTorque';
import { prettyJointName } from './jointNames';
import { childrenOf, linkEnds, linkLength } from '../agent/skeleton';

export const LIMB_SHARE = 0.45;

const PITCH_AXIS = 0.9;

interface PointMass {
  g: number;
  at: ZUpVec;
  joint: string;
}

const toScene = ([x, y, z]: ZUpVec): V3 => [x, z, -y];
const diff = (a: ZUpVec, b: ZUpVec): ZUpVec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function actuatorGrams(j: SkeletonJoint): number {
  if (!j.actuator) return 0;

  return componentWeightG(j.actuator.split('|')[0].replace(/^component:/, '')) ?? 0;
}

function linkCentre(skeleton: RobotSkeleton, j: SkeletonJoint): ZUpVec {
  const ends = linkEnds(skeleton, j);

  if (!ends.length) return j.origin;

  const weights = ends.map((e) => Math.hypot(...diff(e, j.origin)) || 1);
  const total = weights.reduce((s, w) => s + w, 0);

  return [0, 1, 2].map(
    (k) => ends.reduce((s, e, i) => s + ((j.origin[k] + e[k]) / 2) * weights[i], 0) / total,
  ) as ZUpVec;
}

function pointMasses(skeleton: RobotSkeleton, totalG: number): PointMass[] {
  const joints = skeleton.joints;
  const actuators = joints.reduce((s, j) => s + actuatorGrams(j), 0);
  const fixed = joints.reduce((s, j) => s + (j.linkMassG ?? 0), 0);
  const free = joints.filter((j) => !j.linkMassG);
  const freeLength = free.reduce((s, j) => s + linkLength(skeleton, j), 0);
  const spread = Math.max(0, totalG - actuators - fixed) * LIMB_SHARE;
  const linkG = (j: SkeletonJoint) => j.linkMassG ?? (freeLength ? (spread * linkLength(skeleton, j)) / freeLength : 0);

  return joints.flatMap((j) => [
    { g: linkG(j), at: linkCentre(skeleton, j), joint: j.id },
    { g: actuatorGrams(j), at: j.origin, joint: j.id },
  ]);
}

function descendants(skeleton: RobotSkeleton, id: string): string[] {
  const out: string[] = [];
  const queue = [id];

  while (queue.length) {
    const next = childrenOf(skeleton, queue.shift()!).map((c) => c.id);

    out.push(...next);
    queue.push(...next);
  }

  return out;
}

function distal(masses: PointMass[], ids: Set<string>) {
  const own = masses.filter((m) => ids.has(m.joint) && m.g > 0);
  const g = own.reduce((s, m) => s + m.g, 0);
  const com = [0, 1, 2].map((k) => (g ? own.reduce((s, m) => s + m.at[k] * m.g, 0) / g : 0)) as ZUpVec;

  return { g, com };
}

function legChain(skeleton: RobotSkeleton, j: SkeletonJoint): SkeletonJoint[] {
  const byId = new Map(skeleton.joints.map((k) => [k.id, k]));
  const below = [j];
  let at = j;

  while (childrenOf(skeleton, at.id).length === 1 && childrenOf(skeleton, at.id)[0].limb === 'leg') {
    at = childrenOf(skeleton, at.id)[0];
    below.push(at);
  }

  const above: SkeletonJoint[] = [];
  let up = j.parent ? byId.get(j.parent) : undefined;

  while (up?.limb === 'leg') {
    above.unshift(up);
    up = up.parent ? byId.get(up.parent) : undefined;
  }

  return [...above, ...below];
}

const footOf = (chain: SkeletonJoint[]): ZUpVec => {
  const last = chain[chain.length - 1];

  return last.tip ?? [last.origin[0], last.origin[1], 0];
};

function crouchLever(chain: SkeletonJoint[], j: SkeletonJoint): number | undefined {
  const pitch = chain.filter((k) => Math.abs(norm(k.axis)[0]) >= PITCH_AXIS).sort((a, b) => b.origin[2] - a.origin[2]);
  const index = pitch.indexOf(j);

  if (pitch.length < 2 || index < 0) return undefined;

  const heights = pitch.map((k) => k.origin[2]);
  const flatFoot = pitch.length >= 3;

  if (!flatFoot) heights.push(footOf(chain)[2]);

  let offset = 0;
  let sign = 1;

  for (let i = heights.length - 2; i >= index; i--) {
    offset += sign * (heights[i] - heights[i + 1]);
    sign = -sign;
  }

  return flatFoot && index === pitch.length - 1 ? 0 : offset;
}

interface LegContext {
  weightN: number;
  share: number;
}

function stance(skeleton: RobotSkeleton, j: SkeletonJoint, leg: LegContext, swing: { g: number; com: ZUpVec }) {
  const chain = legChain(skeleton, j);
  const a = toScene(norm(j.axis));
  const grf: V3 = [0, leg.weightN * leg.share, 0];
  const tGrf = dot(cross(toScene(diff(footOf(chain), j.origin)), grf), a);
  const tDistal = dot(cross(toScene(diff(swing.com, j.origin)), [0, (-swing.g / 1000) * G, 0]), a);
  const modeled = Math.abs(tGrf + tDistal) / 1000;
  const lever = crouchLever(chain, j);
  const crouch = lever === undefined ? 0 : crouchTorque(leg.weightN * leg.share, lever, MIN_CROUCH_DEG);

  return { stanceNm: Math.max(modeled, crouch), leverMm: lever };
}

const legCount = (skeleton: RobotSkeleton) =>
  skeleton.joints.filter((j) => j.limb === 'leg' && !childrenOf(skeleton, j.id).some((c) => c.limb === 'leg')).length;

export function skeletonSizing(skeleton: RobotSkeleton): SizingInput | string {
  const totalG = skeleton.massG;

  if (!totalG) return 'Give the skeleton an estimated mass (define_skeleton mass_g) to size actuators from it.';

  if (!skeleton.joints.length) return 'The skeleton has no joints.';

  const masses = pointMasses(skeleton, totalG);
  const leg: LegContext = { weightN: (totalG / 1000) * G, share: legCount(skeleton) >= 3 ? 0.5 : 1 };
  const joints = skeleton.joints.map((j): SizingJoint => {
    const riders = descendants(skeleton, j.id);
    const swing = distal(masses, new Set([j.id, ...riders]));
    const holdNm = swingTorque(toScene(diff(swing.com, j.origin)), toScene(norm(j.axis)), swing.g, j.range);
    const standing = j.limb === 'leg' ? stance(skeleton, j, leg, swing) : undefined;

    return {
      id: j.id,
      name: prettyJointName(j.name ?? j.id),
      stanceNm: standing && standing.stanceNm > 0 ? standing.stanceNm : undefined,
      holdNm,
      massG: Math.max(1, swing.g),
      leverMm: standing?.leverMm,
      servos: 1,
      currentG: actuatorGrams(j),
      riders: riders.filter((id) => skeleton.joints.some((k) => k.id === id)),
    };
  });

  return { joints, totalG };
}
