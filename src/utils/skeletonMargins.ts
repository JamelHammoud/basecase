import { actuatorOf, type ActuatorSpec } from '../data/components';
import type { RobotSkeleton } from '../types/skeleton';
import { actuatorOptions, type ActuatorOption } from './actuatorCatalog';
import { jointVerdict } from './actuatorSizing';
import { ratingAt, type LoadStatus } from './actuatorRules';
import { skeletonSizing } from './skeletonSizing';

export interface JointMargin {
  margin: number;
  status: LoadStatus;
}

const STRONGER = 1.05;

export function actuatorSpec(key: string | undefined): ActuatorSpec | undefined {
  if (!key) return undefined;

  const [head, variant] = key.split('|');

  return actuatorOf(head.replace(/^component:/, ''), variant);
}

export function skeletonMargins(skeleton: RobotSkeleton | undefined): Map<string, JointMargin> {
  const input = skeleton && skeletonSizing(skeleton);
  const out = new Map<string, JointMargin>();

  if (!skeleton || !input || typeof input === 'string') return out;

  for (const sized of input.joints) {
    const act = actuatorSpec(skeleton.joints.find((j) => j.id === sized.id)?.actuator);

    if (!act) continue;

    const verdict = jointVerdict(sized, sized, act);

    out.set(sized.id, { margin: 1 - verdict.stallShare, status: verdict.status });
  }

  return out;
}

const stallOf = (act: ActuatorSpec) => ratingAt(act).stallNm;

export function servoUp(key: string | undefined, options: ActuatorOption[] = actuatorOptions()): ActuatorOption | null {
  const now = actuatorSpec(key);
  const floor = now ? stallOf(now) * STRONGER : 0;
  const stronger = options
    .filter((o) => o.key !== key && (!now?.bus || o.bus === now.bus) && stallOf(o.act) > floor)
    .sort((a, b) => stallOf(a.act) - stallOf(b.act) || a.usd - b.usd);

  return stronger[0] ?? null;
}

export function withActuator(skeleton: RobotSkeleton, id: string, actuator: string): RobotSkeleton {
  return { ...skeleton, joints: skeleton.joints.map((j) => (j.id === id ? { ...j, actuator } : j)) };
}
