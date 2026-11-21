import { DEFAULT_PROJECT, type RobotJoint } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import { box, type P3 } from './parts';
import { buildMjcf } from '../mjcf';

interface Mechanism {
  name: string;
  type: 'revolute' | 'prismatic';
  axis: P3;
  count: number;
  powered: number;
  chain?: boolean;
  free?: boolean;
  length?: number;
  contact?: boolean;
}

export const passiveMechanisms: Mechanism[] = [
  { name: 'falling hinged finger', type: 'revolute', axis: [0, 0, 1], count: 1, powered: 0, length: 30 },
  { name: 'vertical sliding finger', type: 'prismatic', axis: [0, 1, 0], count: 1, powered: 0 },
  { name: 'caster swivel', type: 'revolute', axis: [0, 1, 0], count: 1, powered: 0, free: true },
  { name: 'free wheel axle', type: 'revolute', axis: [1, 0, 0], count: 1, powered: 0, free: true },
  { name: 'gravity pendulum', type: 'revolute', axis: [0, 0, 1], count: 1, powered: 0, length: 200 },
  { name: 'articulated tail', type: 'revolute', axis: [0, 0, 1], count: 3, powered: 0, chain: true },
  { name: 'contact driven pad', type: 'prismatic', axis: [0, 1, 0], count: 1, powered: 0, contact: true },
  { name: 'suspension rocker', type: 'revolute', axis: [Math.SQRT1_2, 0, Math.SQRT1_2], count: 1, powered: 0 },
  { name: 'powered shoulder and passive wrist', type: 'revolute', axis: [0, 0, 1], count: 2, powered: 1, chain: true },
  { name: 'two passive fingers beside one powered joint', type: 'revolute', axis: [0, 0, 1], count: 3, powered: 1 },
];

export function passiveMechanism(spec: Mechanism) {
  const { type, axis, count, powered, chain = false, length = 100 } = spec;
  const parts = [box('base', [0, 500, 0], [10, 10, 10], 100)];
  const joints: RobotJoint[] = [];
  const range: [number, number] = type === 'prismatic' ? [-100, 100] : [-90, 90];

  for (let i = 0; i < count; i++) {
    const id = `joint_${i}`;
    const x = chain ? i * length : 0;
    const z = chain ? 0 : i * 100;

    parts.push(box(`link_${i}`, [x + length / 2, 500, z], [length, 10, 10], 100));
    joints.push({
      id,
      name: id,
      type,
      parent: [chain && i > 0 ? `link_${i - 1}` : 'base'],
      child: [`link_${i}`],
      origin: [x, 500, z],
      axis,
      actuation: i < powered ? 'powered' : 'passive',
      ...(spec.free ? {} : { range }),
    });
  }

  if (spec.contact) parts.push(box('stop', [50, 420, 0], [120, 10, 20], 1000));

  const project = { ...DEFAULT_PROJECT, joints };
  const model = buildMjcf({ parts, project, rig: buildRig(joints, parts), measures: {}, partTriangles: () => null });

  return { parts, joints, project, model };
}
