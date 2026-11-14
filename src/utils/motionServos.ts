import type { RobotSkeleton } from '../types/skeleton';
import { sizeActuators, type JointPick } from './actuatorSizing';
import type { ServoPick } from './armServos';
import type { JointRates } from './motionFit';
import { jointInertia, skeletonSizing } from './skeletonSizing';

export interface MotionServos extends Omit<ServoPick, 'keys' | 'names'> {
  keys: Record<string, string>;
  names: Record<string, string>;
  failing: string[];
}

const RAD = Math.PI / 180;
const RPM_PER_DPS = 1 / 6;

const chosen = (p: JointPick) => (p.pick ?? p.strongest)?.option;

export function motionServos(skeleton: RobotSkeleton, rates: Map<string, JointRates>): MotionServos | null {
  const input = skeletonSizing(skeleton);

  if (typeof input === 'string') return null;

  const inertia = jointInertia(skeleton);
  const joints = input.joints.map((j) => {
    const r = rates.get(j.id) ?? { speedDps: 0, accelDps2: 0 };

    return {
      ...j,
      holdNm: j.holdNm + (inertia.get(j.id) ?? 0) * r.accelDps2 * RAD,
      speedRpm: r.speedDps * RPM_PER_DPS,
    };
  });
  const families = sizeActuators({ ...input, joints });
  const family = families.find((f) => !f.failures.length) ?? families[0];

  if (!family || family.picks.some((p) => !chosen(p))) return null;

  const options = family.picks.map((p) => chosen(p)!);
  const servosUsd = options.reduce((s, o) => s + o.usd, 0);

  return {
    keys: Object.fromEntries(family.picks.map((p, i) => [p.joint.id, options[i].key])),
    names: Object.fromEntries(family.picks.map((p, i) => [p.joint.id, options[i].name])),
    volts: family.rail.volts,
    rail: family.rail.name,
    servosUsd,
    costUsd: family.costUsd - family.actuatorsUsd + servosUsd,
    failing: family.failures.map((p) => p.joint.name),
  };
}

export function servoShortfall(servos: MotionServos | null): string | null {
  if (!servos) return 'No servo set fits these joints, so none were placed.';

  if (!servos.failing.length) return null;

  return `The strongest servo is still too slow or weak for ${servos.failing.join(', ')}.`;
}
