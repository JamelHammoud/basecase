import type { RobotJoint, ScenePart } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import { holdingLoad, jointServos } from './mjcfEffort';
import { f } from './mjcfText';
import { historySamples, servoDynamics, type ServoDynamics } from './servoModel';

interface FittedInput {
  j: RobotJoint;
  byId: Map<string, ScenePart>;
  rig: Rig;
  masses: Map<string, { grams: number; centroid: V3 }>;
}

export function fittedServo({ j, byId, rig, masses }: FittedInput): ServoDynamics | null {
  if (j.type !== 'revolute') return null;

  return servoDynamics(jointServos(j, byId), holdingLoad(j, rig, masses).momentNm);
}

export const fittedJointAttrs = (d: ServoDynamics) =>
  `damping="${f(d.damping)}" armature="${f(d.armature)}" frictionloss="${f(d.frictionloss)}"`;

export interface FittedActuator {
  name: string;
  dynamics: ServoDynamics;
  ctrlrange: string;
  timestep: number;
}

export function fittedActuatorXml({ name, dynamics: d, ctrlrange, timestep }: FittedActuator): string {
  const delay = `delay="${f(d.delayS)}" nsample="${historySamples(d.delayS, timestep)}" interp="linear"`;

  return `    <position name="${name}" joint="${name}" kp="${f(d.kp)}" kv="0" forcerange="${f(-d.forceNm)} ${f(d.forceNm)}"${ctrlrange} ${delay}/>`;
}
