import type { RobotJoint, ScenePart } from '../../types/robotics';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import { box } from './parts';
import { buildMjcf } from '../mjcf';

export const tendonMechanisms = [
  { name: 'remote elbow', coefficients: [[10]] },
  { name: 'spring-return wrist', coefficients: [[10]], spring: true },
  { name: 'coupled finger', coefficients: [[10, 15]], chain: true },
  { name: 'opposing-jaw gripper', coefficients: [[1, -1]], slider: true },
  { name: 'three-joint finger', coefficients: [[10, 12, 15]], chain: true },
  { name: 'paired ankle joints', coefficients: [[10, 10]] },
  {
    name: 'two-axis differential wrist',
    orthogonal: true,
    chain: true,
    coefficients: [
      [10, 10],
      [10, -10],
    ],
  },
  { name: 'sliding carriage', coefficients: [[1]], slider: true },
  { name: 'coupled pan-tilt mechanism', coefficients: [[10, 20]], orthogonal: true, chain: true },
  {
    name: 'repeated independent finger modules',
    coefficients: [
      [10, 0],
      [0, 10],
    ],
  },
];

export function tendonMechanism(spec = tendonMechanisms[0]) {
  const parts: ScenePart[] = [box('base', [0, 400, 0], [20, 10, 20], 200)];
  const joints: RobotJoint[] = [];
  const count = spec.coefficients[0].length;

  for (let i = 0; i < count; i++) {
    parts.push(box(`link_${i}`, [50 + i * 100, 400, 0], [40, 10, 10], 30));
    joints.push({
      id: `output_${i}`,
      name: `Output ${i + 1}`,
      type: spec.slider ? 'prismatic' : 'revolute',
      parent: [spec.chain && i > 0 ? `link_${i - 1}` : 'base'],
      child: [`link_${i}`],
      origin: [30 + i * 100, 400, 0],
      axis: spec.orthogonal && i > 0 ? [1, 0, 0] : [0, 1, 0],
      range: [-80, 80],
      actuation: 'passive',
      damping: spec.slider ? 0.1 : 0.002,
      ...(spec.spring ? { stiffness: 2, springref: 0 } : {}),
    });
  }

  spec.coefficients.forEach((coefficients, i) => {
    const servo = `servo_${i}`;
    const spool = `spool_${i}`;

    parts.push(
      {
        ...box(servo, [-100 - i * 100, 400, 0], [20, 40, 20], 55),
        kind: 'component',
        componentId: 'feetech-sts3215',
        componentVariant: 'c001',
      },
      box(spool, [-100 - i * 100, 430, 0], [10, 10, 10], 10),
    );
    joints.push({
      id: `motor_${i}`,
      name: `Motor ${i + 1}`,
      type: 'revolute',
      parent: ['base', servo],
      child: [spool],
      origin: [-100 - i * 100, 420, 0],
      axis: [0, 1, 0],
      range: [-90, 90],
      actuators: [servo],
      tendon: {
        spool: { coefficient: -10, unit: 'mm/rad' },
        terms: coefficients.map((coefficient, index) => ({
          joint: `output_${index}`,
          coefficient,
          unit: spec.slider ? 'mm/mm' : 'mm/rad',
        })),
        law: { kind: 'fixed', lengthMm: 0 },
      },
    });
  });

  const project = { ...DEFAULT_PROJECT, joints };
  const rig = buildRig(joints, parts);
  const input = {
    parts,
    project,
    rig,
    measures: {},
    partTriangles: () => null,
    fixedBase: { [rig.robots[0].key]: true },
  };

  return { input, model: buildMjcf(input) };
}
