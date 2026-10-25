import { actuatorOf } from '../data/components';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import type { SimJoint } from './mjcf';

export function effortOf(
  j: RobotJoint,
  byId: Map<string, ScenePart>,
  rig: Rig,
  masses: Map<string, { grams: number; centroid: V3 }>,
): { effort: number; source: SimJoint['effortSource'] } {
  const servos = (j.actuators ?? []).map((id) => byId.get(id)).filter((p): p is ScenePart => !!p?.componentId);
  const stall = servos.reduce((s, p) => s + (actuatorOf(p.componentId!, p.componentVariant)?.stallNm ?? 0), 0);

  if (stall > 0) return { effort: stall, source: 'servo' };

  if (j.effortNm && j.effortNm > 0) return { effort: j.effortNm, source: 'published' };

  const below = new Set<string>();

  for (const [pid, owner] of rig.ownerOf) if (rig.chain.get(owner)?.has(j.id)) below.add(pid);

  let moment = 0;
  let grams = 0;

  for (const id of below) {
    const m = masses.get(id);

    if (!m) continue;

    grams += m.grams;
    moment +=
      (m.grams / 1000) *
      9.81 *
      (Math.hypot(m.centroid[0] - j.origin[0], m.centroid[1] - j.origin[1], m.centroid[2] - j.origin[2]) / 1000);
  }

  if (j.type === 'prismatic') return { effort: Math.max(5, (grams / 1000) * 9.81 * 3), source: 'estimate' };

  return { effort: Math.max(0.3, moment * 3), source: 'estimate' };
}
