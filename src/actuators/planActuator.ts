import type { ActuatorSpec } from '../data/components';
import { ratioLabel } from '../data/generatedActuators';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { designRatio, type CycloidalDesign } from './cycloidal';
import { pickActuator, type ActuatorLoads, type BedSize } from './pick';
import { withActuator, type ActuatorEdit } from './withActuator';

export interface ActuatorPlan {
  joint: RobotJoint;
  design: CycloidalDesign;
  spec: ActuatorSpec;
  edit: ActuatorEdit;
  name: string;
}

export interface PlanInput {
  parts: ScenePart[];
  joints: RobotJoint[];
  joint: string;
  loads: ActuatorLoads;
  bed: BedSize;
  base: string;
}

export function planActuator({ parts, joints, joint, loads, bed, base }: PlanInput): ActuatorPlan | string {
  const target = joints.find((j) => j.id === joint);

  if (!target) return `There’s no joint ${joint}.`;

  const pick = pickActuator(loads, bed);

  if ('refusal' in pick) return `${target.name} ${pick.refusal}`;

  const edit = withActuator({ parts, joints }, joint, pick.design, base);

  if (typeof edit === 'string') return edit;

  return { joint: target, design: pick.design, spec: pick.spec, edit, name: `${target.name} actuator` };
}

export const planRatio = (plan: ActuatorPlan) => ratioLabel(designRatio(plan.design));
