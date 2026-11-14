import { actuatorOf, type ActuatorSpec } from '../data/components';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { ratingAt } from '../utils/actuatorRules';
import type { Rig, V3 } from '../utils/kinematics';
import type { SimJoint } from './mjcf';

type Masses = Map<string, { grams: number; centroid: V3 }>;

export function ratedAt(spec: ActuatorSpec, volts: number | undefined): ActuatorSpec {
  if (volts === undefined) return spec;

  const rating = ratingAt(spec, volts);

  return { ...spec, stallNm: rating.stallNm, ratedNm: rating.ratedNm, atVolts: rating.volts };
}

export function jointServos(j: RobotJoint, byId: Map<string, ScenePart>, volts?: number): ActuatorSpec[] {
  return (j.actuators ?? [])
    .map((id) => byId.get(id))
    .flatMap((p) => (p?.componentId ? [actuatorOf(p.componentId, p.componentVariant)] : []))
    .filter((s): s is ActuatorSpec => !!s)
    .map((s) => ratedAt(s, volts));
}

export function holdingLoad(j: RobotJoint, rig: Rig, masses: Masses): { momentNm: number; grams: number } {
  let momentNm = 0;
  let grams = 0;

  for (const [pid, owner] of rig.ownerOf) {
    const m = rig.chain.get(owner)?.has(j.id) ? masses.get(pid) : undefined;

    if (!m) continue;

    grams += m.grams;
    momentNm +=
      (m.grams / 1000) *
      9.81 *
      (Math.hypot(m.centroid[0] - j.origin[0], m.centroid[1] - j.origin[1], m.centroid[2] - j.origin[2]) / 1000);
  }

  return { momentNm, grams };
}

export interface EffortScene {
  byId: Map<string, ScenePart>;
  rig: Rig;
  masses: Masses;
  volts?: number;
}

export function effortOf(
  j: RobotJoint,
  { byId, rig, masses, volts }: EffortScene,
): { effort: number; source: SimJoint['effortSource'] } {
  const stall = jointServos(j, byId, volts).reduce((s, spec) => s + spec.stallNm, 0);

  if (stall > 0) return { effort: stall, source: 'servo' };

  if (j.effortNm && j.effortNm > 0) return { effort: j.effortNm, source: 'published' };

  const { momentNm, grams } = holdingLoad(j, rig, masses);

  if (j.type === 'prismatic') return { effort: Math.max(5, (grams / 1000) * 9.81 * 3), source: 'estimate' };

  return { effort: Math.max(0.3, momentNm * 3), source: 'estimate' };
}
