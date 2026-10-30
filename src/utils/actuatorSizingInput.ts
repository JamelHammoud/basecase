import { componentWeightG } from '../data/components';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { SizingJoint } from './actuatorSizing';
import { downstreamOf } from './engineeringMass';
import type { EngineeringReport } from './engineeringTypes';
import { prettyJointName } from './kinematics';

function actuatorGrams(j: RobotJoint, byId: Map<string, ScenePart>): number {
  return (j.actuators ?? []).reduce((s, id) => {
    const p = byId.get(id);

    return s + (p?.componentId ? (componentWeightG(p.componentId) ?? 0) : 0);
  }, 0);
}

export function sizingJoints(report: EngineeringReport, parts: ScenePart[], joints: RobotJoint[]): SizingJoint[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const sized = report.joints.filter((l) => l.joint.actuators?.length || !l.joint.effortNm);

  return sized.map((l) => {
    const j = l.joint;
    const down = downstreamOf(j, joints);
    const standing = j.limb === 'leg' ? Math.max(l.stanceNm, l.crouchNm ?? 0) : 0;
    const riders = sized
      .filter((k) => k.joint !== j && (k.joint.actuators ?? []).some((id) => down.has(id)))
      .map((k) => k.joint.id);

    return {
      id: j.id,
      name: prettyJointName(j.name),
      stanceNm: standing > 0 ? standing : undefined,
      holdNm: l.swingNm,
      massG: l.massG,
      leverMm: l.leverMm,
      servos: Math.max(1, j.actuators?.length ?? 0),
      currentG: actuatorGrams(j, byId),
      riders,
    };
  });
}
