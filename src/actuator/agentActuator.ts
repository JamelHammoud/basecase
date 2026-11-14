import type { RobotJoint, ScenePart } from '../types/robotics';
import { actuatorOf } from '../data/components';
import { torque } from '../utils/torque';
import type { MadeActuator } from '../workspace/useMakeActuator';

export interface ActuatorToolContext {
  joints: RobotJoint[];
  make: (jointId: string) => Promise<MadeActuator>;
  setAction: (action: string) => void;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const findJoint = (joints: RobotJoint[], wanted: string) =>
  joints.find((j) => j.id === wanted) ?? joints.find((j) => sameName(j.name, wanted));

function madeText(made: Extract<MadeActuator, { added: ScenePart[] }>): string {
  const { added } = made;
  const motor = added.find((p) => p.componentId && actuatorOf(p.componentId, p.componentVariant));
  const spec = motor && actuatorOf(motor.componentId!, motor.componentVariant)!;
  const printed = added.filter((p) => p.cad).map((p) => `${p.id} (${p.name})`);
  const rating = spec
    ? `${motor!.name} ${motor!.componentVariant}: ${torque(spec.stallNm)} peak, ${torque(spec.ratedNm)} rated, ${spec.rpm} rpm at ${spec.atVolts} V, armature ${spec.armature} kg·m² (estimates). `
    : '';

  return `Made ${made.name} (one undo step): ${rating}Printed: ${printed.join(', ')}. The joint's actuator is ${motor?.id}; Checks re-run on their own.`;
}

export async function makeActuatorRequest(payload: { joint?: unknown }, ctx: ActuatorToolContext) {
  const wanted = typeof payload.joint === 'string' ? payload.joint : '';
  const joint = findJoint(ctx.joints, wanted);

  if (!joint) return { text: `No joint "${wanted}". get_rig lists the joints.` };

  ctx.setAction('Making an actuator');

  const made = await ctx.make(joint.id);

  return { text: 'problem' in made ? made.problem : madeText(made) };
}
