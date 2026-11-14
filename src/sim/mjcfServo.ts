import type { RobotJoint, ScenePart } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import { holdingLoad, jointServos } from './mjcfEffort';
import { f } from './mjcfText';
import type { JointServoFit } from './mjcfTypes';
import { historySamples, servoDynamics, type ServoDynamics } from './servoModel';

interface FittedInput {
  j: RobotJoint;
  byId: Map<string, ScenePart>;
  rig: Rig;
  masses: Map<string, { grams: number; centroid: V3 }>;
  calibrated?: JointServoFit;
  volts?: number;
}

export function fittedServo({ j, byId, rig, masses, calibrated, volts }: FittedInput): ServoDynamics | null {
  if (j.type !== 'revolute') return null;

  const specs = jointServos(j, byId, volts);
  const used = calibrated ? specs.map((s) => ({ ...s, fit: calibrated.fit, atVolts: calibrated.volts })) : specs;

  return servoDynamics(used, holdingLoad(j, rig, masses).momentNm);
}

export const fittedJointAttrs = (d: ServoDynamics) =>
  `damping="${f(d.damping)}" armature="${f(d.armature)}" frictionloss="${f(d.frictionloss)}"`;

export interface FittedActuator {
  name: string;
  dynamics: ServoDynamics;
  ctrlrange: string;
  timestep: number;
  historyS?: number;
}

export function fittedActuatorXml({ name, dynamics: d, ctrlrange, timestep, historyS = 0 }: FittedActuator): string {
  const samples = historySamples(Math.max(d.delayS, historyS), timestep);
  const delay = `delay="${f(d.delayS)}" nsample="${samples}" interp="linear"`;

  return `    <position name="${name}" joint="${name}" kp="${f(d.kp)}" kv="0" forcerange="${f(-d.forceNm)} ${f(d.forceNm)}"${ctrlrange} ${delay}/>`;
}
