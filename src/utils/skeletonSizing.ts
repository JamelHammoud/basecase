import { componentWeightG } from '../data/components';
import type { RobotSkeleton, SkeletonJoint, ZUpVec } from '../types/skeleton';
import type { SizingInput, SizingJoint } from './actuatorSizing';
import { crouchTorque, MIN_CROUCH_DEG } from './actuatorRules';
import { cross, dot, G, norm, type V3 } from './engineeringMath';
import { swingTorque } from './engineeringTorque';
import { prettyJointName } from './jointNames';
import { SkeletonTree } from './skeletonTree';
import { measureSkeletonLink } from './skeletonLinkMeasure';

export const LIMB_SHARE = 0.45;

const PITCH_AXIS = 0.9;

interface PointMass {
  g: number;
  at: ZUpVec;
  joint: string;
  radiusMm: number;
}

const toScene = ([x, y, z]: ZUpVec): V3 => [x, z, -y];
const diff = (a: ZUpVec, b: ZUpVec): ZUpVec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function actuatorGrams(j: SkeletonJoint): number {
  if (!j.actuator) return 0;

  return componentWeightG(j.actuator.split('|')[0].replace(/^component:/, '')) ?? 0;
}

function pointMasses(skeleton: RobotSkeleton, totalG: number, tree: SkeletonTree): PointMass[] {
  const joints = skeleton.joints;
  const actuators = joints.reduce((s, j) => s + actuatorGrams(j), 0);
  const fixed = joints.reduce((s, j) => s + (j.linkMassG ?? 0), 0);
  const links = joints.map((joint) => ({ joint, ...measureSkeletonLink(joint.origin, tree.linkEnds(joint)) }));
  const freeLength = links.reduce((sum, link) => (link.joint.linkMassG ? sum : sum + link.length), 0);
  const spread = Math.max(0, totalG - actuators - fixed) * LIMB_SHARE;

  return links.flatMap(({ joint: j, length, at }) => [
    { g: j.linkMassG ?? (freeLength ? (spread * length) / freeLength : 0), at, joint: j.id, radiusMm: length },
    { g: actuatorGrams(j), at: j.origin, joint: j.id, radiusMm: 0 },
    {
      g: j.payloadG ?? 0,
      at: j.tip ?? j.origin,
      joint: j.id,
      radiusMm: Math.hypot(...diff(j.tip ?? j.origin, j.origin)),
    },
  ]);
}

function inertiaBound(tree: SkeletonTree, joint: SkeletonJoint, masses: PointMass[]) {
  const radii = new Map([[joint.id, 0]]);
  const queue = [joint];

  for (let i = 0; i < queue.length; i++) {
    const parent = queue[i];

    for (const child of tree.childrenOf(parent.id)) {
      radii.set(child.id, radii.get(parent.id)! + Math.hypot(...diff(child.origin, parent.origin)));
      queue.push(child);
    }
  }

  const inertiaKgM2 = masses.reduce((sum, mass) => {
    const radius = radii.get(mass.joint);

    return radius === undefined ? sum : sum + (mass.g / 1000) * ((radius + mass.radiusMm) / 1000) ** 2;
  }, 0);

  return { inertiaKgM2, riderRadiusMm: Object.fromEntries(radii) };
}

function distal(masses: PointMass[], ids: Set<string>) {
  const own = masses.filter((m) => ids.has(m.joint) && m.g > 0);
  const g = own.reduce((s, m) => s + m.g, 0);
  const com = [0, 1, 2].map((k) => (g ? own.reduce((s, m) => s + m.at[k] * m.g, 0) / g : 0)) as ZUpVec;

  return { g, com };
}

function legChain(tree: SkeletonTree, j: SkeletonJoint): SkeletonJoint[] {
  const byId = tree.byId;
  const below = [j];
  let at = j;

  while (tree.childrenOf(at.id).length === 1 && tree.childrenOf(at.id)[0].limb === 'leg') {
    at = tree.childrenOf(at.id)[0];
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

function stance(tree: SkeletonTree, j: SkeletonJoint, leg: LegContext, swing: { g: number; com: ZUpVec }) {
  const chain = legChain(tree, j);
  const a = toScene(norm(j.axis));
  const grf: V3 = [0, leg.weightN * leg.share, 0];
  const tGrf = dot(cross(toScene(diff(footOf(chain), j.origin)), grf), a);
  const tDistal = dot(cross(toScene(diff(swing.com, j.origin)), [0, (-swing.g / 1000) * G, 0]), a);
  const modeled = Math.abs(tGrf + tDistal) / 1000;
  const lever = crouchLever(chain, j);
  const crouch = lever === undefined ? 0 : crouchTorque(leg.weightN * leg.share, lever, MIN_CROUCH_DEG);

  return { stanceNm: Math.max(modeled, crouch), leverMm: lever };
}

const legCount = (skeleton: RobotSkeleton, tree: SkeletonTree) =>
  skeleton.joints.filter((j) => j.limb === 'leg' && !tree.childrenOf(j.id).some((c) => c.limb === 'leg')).length;

export function skeletonSizing(skeleton: RobotSkeleton): SizingInput | string {
  const totalG = skeleton.massG;

  if (!totalG) return 'Give the skeleton an estimated mass (define_skeleton mass_g) to size actuators from it.';

  if (!skeleton.joints.length) return 'The skeleton has no joints.';

  const tree = new SkeletonTree(skeleton);
  const masses = pointMasses(skeleton, totalG, tree);
  const leg: LegContext = { weightN: (totalG / 1000) * G, share: legCount(skeleton, tree) >= 3 ? 0.5 : 1 };
  const joints = skeleton.joints.map((j): SizingJoint => {
    const riders = tree.subtreeOf(j.id).slice(1);
    const swing = distal(masses, new Set([j.id, ...riders]));
    const holdNm = swingTorque(toScene(diff(swing.com, j.origin)), toScene(norm(j.axis)), swing.g, j.range);
    const standing = j.limb === 'leg' ? stance(tree, j, leg, swing) : undefined;

    return {
      id: j.id,
      name: prettyJointName(j.name ?? j.id),
      stanceNm: standing && standing.stanceNm > 0 ? standing.stanceNm : undefined,
      holdNm,
      massG: Math.max(1, swing.g),
      leverMm: standing?.leverMm,
      servos: 1,
      currentG: actuatorGrams(j),
      riders,
      ...inertiaBound(tree, j, masses),
    };
  });

  return { joints, totalG };
}
