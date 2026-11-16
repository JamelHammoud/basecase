import type { RobotJoint, RobotPoseState } from '../types/robotics';
import { clampJoint } from '../utils/kinematics';
import type { SimJoint } from './mjcfTypes';
import { toMj } from './mjcfFrames';
import { f, vec } from './mjcfText';

interface PassiveBuild {
  st: { simJoints: SimJoint[]; initialValues: Record<string, number> };
  robot: { key: string };
  local: RobotPoseState;
}

export function passiveJointXml({ st, robot, local }: PassiveBuild, joint: RobotJoint, name: string): string {
  const revolute = joint.type === 'revolute';
  const unit = (value: number) => (revolute ? (value * Math.PI) / 180 : value / 1000);
  const range = joint.range ? ` range="${f(unit(Math.min(...joint.range)))} ${f(unit(Math.max(...joint.range)))}"` : '';
  const damping = joint.damping ?? 0;
  const frictionloss = joint.frictionloss ?? 0;

  st.simJoints.push({
    id: joint.id,
    name,
    type: revolute ? 'revolute' : 'prismatic',
    range: joint.range,
    effort: 0,
    effortSource: 'passive',
    dynamics: 'passive',
    robot: robot.key,
    drive: 'position',
    actuator: -1,
  });

  const initial = local.values[joint.id];

  if (initial) st.initialValues[joint.id] = clampJoint(joint, initial);

  return `<joint name="${name}" type="${revolute ? 'hinge' : 'slide'}" axis="${vec(toMj(joint.axis).map((v) => v * 1000))}"${range} damping="${f(damping)}" frictionloss="${f(frictionloss)}"/>`;
}
