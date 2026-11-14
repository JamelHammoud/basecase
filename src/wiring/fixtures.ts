import { COMPONENT_BY_ID } from '../data/components';
import { box, joint } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT, type ProjectSettings, type RobotJoint, type ScenePart } from '../types/robotics';

export interface WiringFixture {
  parts: ScenePart[];
  project: ProjectSettings;
}

export function component(id: string, componentId: string, variant?: string): ScenePart {
  return {
    ...box(id, [0, 0, 0], [20, 20, 20], 50),
    name: `${COMPONENT_BY_ID[componentId].name} ${id}`,
    kind: 'component',
    category: 'actuators',
    componentId,
    ...(variant ? { componentVariant: variant } : {}),
  };
}

interface Servos {
  prefix: string;
  componentId: string;
  variant?: string;
  count: number;
  limb?: RobotJoint['limb'];
}

export function servoJoints({ prefix, componentId, variant, count, limb }: Servos) {
  const parts = Array.from({ length: count }, (_, i) => component(`${prefix}${i + 1}`, componentId, variant));
  const joints = parts.map((p, i): RobotJoint => ({
    ...joint({
      id: `${prefix}-joint${i + 1}`,
      link: ['base', p.id],
      origin: [0, 0, 0],
      axis: [0, 0, 1],
      effortNm: 1,
      limb,
    }),
    actuators: [p.id],
  }));

  return { parts, joints };
}

export const sceneOf = (parts: ScenePart[], joints: RobotJoint[], extra: Partial<ProjectSettings> = {}) => ({
  parts,
  project: { ...DEFAULT_PROJECT, joints, ...extra },
});

export function so101(): WiringFixture {
  const arm = servoJoints({ prefix: 'servo', componentId: 'feetech-sts3215', variant: 'c001', count: 6, limb: 'arm' });

  return sceneOf([component('adapter', 'waveshare-bus-servo-adapter-a'), ...arm.parts], arm.joints);
}

export function xl330Arm(): WiringFixture {
  const arm = servoJoints({ prefix: 'xl', componentId: 'dynamixel-xl330-m288', count: 5, limb: 'arm' });

  return sceneOf([component('u2d2', 'robotis-u2d2'), ...arm.parts], arm.joints);
}

export function hexapod(): WiringFixture {
  const legs = servoJoints({ prefix: 'leg', componentId: 'feetech-sts3215', variant: 'c001', count: 18, limb: 'leg' });
  const adapters = [
    component('front', 'waveshare-bus-servo-adapter-a'),
    component('back', 'waveshare-bus-servo-adapter-a'),
  ];

  return sceneOf([...adapters, ...legs.parts], legs.joints);
}

export function rover(): WiringFixture {
  const wheels = servoJoints({ prefix: 'wheel', componentId: 'feetech-sts3215', variant: 'c001', count: 2 });
  const power = [component('pack', 'ovonic-3s-2200-50c'), component('buck', 'pololu-d36v50f6')];

  return sceneOf([component('adapter', 'waveshare-bus-servo-adapter-a'), ...power, ...wheels.parts], wheels.joints);
}

export function mixedArm(): WiringFixture {
  const feetech = servoJoints({ prefix: 'sts', componentId: 'feetech-sts3215', variant: 'c001', count: 3 });
  const dynamixel = servoJoints({ prefix: 'xl', componentId: 'dynamixel-xl430-w250', count: 2 });

  return sceneOf(
    [component('adapter', 'waveshare-bus-servo-adapter-a'), ...feetech.parts, ...dynamixel.parts],
    [...feetech.joints, ...dynamixel.joints],
  );
}
