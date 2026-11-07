import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../../src/sim/engine';
import { fixtureMeasures, fixtureTriangles } from '../../src/sim/fixtures/parts';
import { buildMjcf, type SimModel } from '../../src/sim/mjcf';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../../src/types/robotics';
import { buildRig } from '../../src/utils/kinematics';

export interface CatalogServo {
  componentId: string;
  variant?: string;
}

export const CATALOG_SERVOS: Record<string, CatalogServo> = {
  sts3215: { componentId: 'feetech-sts3215', variant: 'c001' },
  xl330: { componentId: 'dynamixel-xl330-m288' },
};

export type Canary = 'kp55' | 'no-delay' | 'no-prime' | undefined;

export const canary = (): Canary => process.env.SERVO_CANARY as Canary;

export interface PendulumLoad {
  massKg: number;
  armM: number;
  bobSideM: number;
}

const PIVOT_MM = 800;
const JOINT_ID = 'servo_joint';

const solid = (id: string, position: [number, number, number], size: number, extra: Partial<ScenePart>): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: size, height: size, depth: size },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

export function servoPart(id: string, servo: CatalogServo, position: [number, number, number]): ScenePart {
  return solid(id, position, 30, {
    componentId: servo.componentId,
    ...(servo.variant ? { componentVariant: servo.variant } : {}),
    massG: 50,
  });
}

export function pendulumModel(servo: CatalogServo, load: PendulumLoad): SimModel {
  const parts = [
    solid('base', [0, PIVOT_MM + 60, 0], 60, { massG: 500 }),
    servoPart('servo', servo, [40, PIVOT_MM, 0]),
    solid('bob', [0, PIVOT_MM - load.armM * 1000, 0], load.bobSideM * 1000, { massG: load.massKg * 1000 }),
  ];
  const joint: RobotJoint = {
    id: JOINT_ID,
    name: JOINT_ID,
    type: 'revolute',
    parent: ['base', 'servo'],
    child: ['bob'],
    origin: [0, PIVOT_MM, 0],
    axis: [1, 0, 0],
    actuators: ['servo'],
  };
  const rig = buildRig([joint], parts);

  return buildMjcf({
    parts,
    rig,
    project: { ...DEFAULT_PROJECT, joints: [joint] },
    measures: fixtureMeasures(parts),
    partTriangles: fixtureTriangles(parts),
    fixedBase: { [rig.robots[0].key]: true },
  });
}

const scaleKp = (xml: string, factor: number) =>
  xml.replace(/(<position [^>]*\bkp=")([\d.e-]+)"/g, (_, head: string, kp: string) => `${head}${Number(kp) * factor}"`);

const dropDelay = (xml: string) => xml.replace(/ delay="[^"]*"| nsample="[^"]*"| interp="[^"]*"/g, '');

export function plantCanary(model: SimModel, which: Canary = canary()): SimModel {
  if (which === 'kp55') return { ...model, xml: scaleKp(model.xml, 55) };

  if (which === 'no-delay') return { ...model, xml: dropDelay(model.xml) };

  return model;
}

const D2R = Math.PI / 180;

export function runPendulum(mj: MainModule, model: SimModel, command: number[]): number[] {
  const engine = new SimEngine(mj, model);
  const joint = model.joints[0];
  const at = engine.model.jnt_qposadr[mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_JOINT.value, joint.name)];
  const positions: number[] = [];

  for (const target of command) {
    positions.push(engine.data.qpos[at]);
    engine.setController({ kind: 'hold', values: { [joint.id]: target / D2R } });
    engine.step(engine.dt);
  }

  engine.dispose();

  return positions;
}
