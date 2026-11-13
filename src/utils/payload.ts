import { G, norm, rotateAbout, sub, type V3 } from './engineeringMath';
import { HOLD_LIMIT, holdTorque, liftableKg, type JointAxis } from './holdingTorque';
import { seededRandom } from './seededRandom';

export const PAYLOAD_SAMPLES = 4096;
export const FULL_REACH_SHARE = 0.9;
export const CLOSE_IN_SHARE = 0.5;

const SEED = 'a11f7ed0a11f7ed0a11f7ed0a11f7ed0';
const MM = 0.001;

export interface ArmLink {
  anchor: V3;
  axis: V3;
  revolute: boolean;
  range: [number, number];
  stallNm: number;
  massKg: number;
  com: V3;
}

export interface ArmModel {
  links: ArmLink[];
  tip: V3;
  floorY: number;
}

export interface PayloadSample {
  at: V3;
  kg: number;
}

export interface PayloadMap {
  samples: PayloadSample[];
  reachMm: number;
  fullReachKg: number;
  closeInKg: number;
}

interface Posed {
  joints: JointAxis[];
  coms: V3[];
  tip: V3;
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

function moverOf(joint: JointAxis, value: number) {
  if (!joint.revolute) return (p: V3) => add(p, scale(joint.axis, value));

  return (p: V3) => add(joint.anchor, rotateAbout(sub(p, joint.anchor), joint.axis, value));
}

export function poseArm(arm: ArmModel, values: number[]): Posed {
  const joints = arm.links.map((l) => ({ anchor: l.anchor, axis: norm(l.axis), revolute: l.revolute }));
  const coms = arm.links.map((l) => l.com);
  let tip = arm.tip;

  joints.forEach((joint, i) => {
    const move = moverOf(joint, values[i]);
    const turn = (a: V3) => (joint.revolute ? rotateAbout(a, joint.axis, values[i]) : a);

    for (let k = i + 1; k < joints.length; k++)
      joints[k] = { ...joints[k], anchor: move(joints[k].anchor), axis: turn(joints[k].axis) };

    for (let k = i; k < coms.length; k++) coms[k] = move(coms[k]);

    tip = move(tip);
  });

  return { joints, coms, tip };
}

function holdingKg(arm: ArmModel, posed: Posed): number {
  return posed.joints.reduce((least, joint, i) => {
    const unit = joint.revolute ? MM : 1;
    const own = posed.coms
      .slice(i)
      .reduce((s, com, k) => s + holdTorque(joint, com, [0, -arm.links[i + k].massKg * G, 0]), 0);
    const perKg = holdTorque(joint, posed.tip, [0, -G, 0]);

    return Math.min(least, liftableKg(own * unit, perKg * unit, HOLD_LIMIT * arm.links[i].stallNm));
  }, Infinity);
}

const reachOf = (arm: ArmModel, at: V3) => Math.hypot(at[0] - arm.links[0].anchor[0], at[2] - arm.links[0].anchor[2]);

const least = (samples: PayloadSample[]) => samples.reduce((m, s) => Math.min(m, s.kg), Infinity);

export function payloadMap(arm: ArmModel, count = PAYLOAD_SAMPLES): PayloadMap | null {
  const random = seededRandom(SEED);
  const samples: Array<PayloadSample & { reach: number }> = [];

  for (let n = 0; n < count; n++) {
    const values = arm.links.map((l) => l.range[0] + (l.range[1] - l.range[0]) * random());
    const posed = poseArm(arm, values);

    if (posed.tip[1] < arm.floorY) continue;

    samples.push({ at: posed.tip, kg: holdingKg(arm, posed), reach: reachOf(arm, posed.tip) });
  }

  const reachMm = samples.reduce((m, s) => Math.max(m, s.reach), 0);

  if (!samples.length || reachMm <= 0) return null;

  return {
    samples: samples.map(({ at, kg }) => ({ at, kg })),
    reachMm,
    fullReachKg: least(samples.filter((s) => s.reach >= FULL_REACH_SHARE * reachMm)),
    closeInKg: least(samples.filter((s) => s.reach <= CLOSE_IN_SHARE * reachMm)),
  };
}
