import type { MainModule } from '@mujoco/mujoco';
import type { ServoFit } from '../../src/data/components';
import { SimEngine } from '../../src/sim/engine';
import { fixtureMeasures, fixtureTriangles } from '../../src/sim/fixtures/parts';
import { buildMjcf } from '../../src/sim/mjcf';
import type { MjcfInput, SimModel } from '../../src/sim/mjcfTypes';
import { fitDynamics, historySamples } from '../../src/sim/servoModel';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../../src/types/robotics';
import { buildRig } from '../../src/utils/kinematics';
import { servoPart } from '../servo/pendulum';
import { BOB_SIDE_M, type Payload, type ServoLog } from './plant';
import { CATALOG, type Family } from './units';

export const TWIN_JOINT = 'servo_joint';

const PIVOT_MM = 800;
const D2R = Math.PI / 180;

const solid = (id: string, position: [number, number, number], size: number, massG: number): ScenePart => ({
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
  massG,
});

export function twinInput(family: Family, payload: Payload): MjcfInput {
  const parts = [
    solid('base', [0, PIVOT_MM + 60, 0], 60, 500),
    servoPart('servo', CATALOG[family], [40, PIVOT_MM, 0]),
    solid('bob', [0, PIVOT_MM - payload.armM * 1000, 0], BOB_SIDE_M * 1000, payload.massKg * 1000),
  ];
  const joint: RobotJoint = {
    id: TWIN_JOINT,
    name: TWIN_JOINT,
    type: 'revolute',
    parent: ['base', 'servo'],
    child: ['bob'],
    origin: [0, PIVOT_MM, 0],
    axis: [1, 0, 0],
    actuators: ['servo'],
  };
  const rig = buildRig([joint], parts);

  return {
    parts,
    rig,
    project: { ...DEFAULT_PROJECT, joints: [joint] },
    measures: fixtureMeasures(parts),
    partTriangles: fixtureTriangles(parts),
    fixedBase: { [rig.robots[0].key]: true },
  };
}

export const presetModel = (family: Family, payload: Payload): SimModel => buildMjcf(twinInput(family, payload));

const attr = (xml: string, tag: RegExp, name: string, value: string) =>
  xml.replace(tag, (element) => element.replace(new RegExp(`\\b${name}="[^"]*"`), `${name}="${value}"`));

export function withFit(model: SimModel, options: { fit: ServoFit; volts: number; payload: Payload }): SimModel {
  const { fit, volts, payload } = options;
  const holding = payload.massKg * 9.81 * payload.armM;
  const d = fitDynamics(fit, volts, holding);
  const joint = /<joint [^>]*\bname="[^"]*servo_joint"[^>]*>/;
  const actuator = /<position [^>]*\bjoint="[^"]*servo_joint"[^>]*>/;
  let xml = model.xml;

  xml = attr(xml, joint, 'damping', d.damping.toFixed(6));
  xml = attr(xml, joint, 'armature', d.armature.toFixed(6));
  xml = attr(xml, joint, 'frictionloss', d.frictionloss.toFixed(6));
  xml = attr(xml, actuator, 'kp', d.kp.toFixed(6));
  xml = attr(xml, actuator, 'forcerange', `${(-d.forceNm).toFixed(6)} ${d.forceNm.toFixed(6)}`);
  xml = attr(xml, actuator, 'delay', d.delayS.toFixed(6));
  xml = attr(xml, actuator, 'nsample', String(historySamples(d.delayS, 0.002)));

  return { ...model, xml };
}

export function predict(mj: MainModule, model: SimModel, log: ServoLog): number[] {
  const engine = new SimEngine(mj, model);
  const joint = model.joints.find((j) => j.id === TWIN_JOINT);

  if (!joint) throw new Error('The calibrated model lost the servo joint');

  const id = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_JOINT.value, joint.name);
  const at = engine.model.jnt_qposadr[id];
  const out: number[] = [];

  try {
    engine.setController({ kind: 'hold', values: { [joint.id]: log.positionRad[0] / D2R } });
    engine.data.qpos[at] = log.positionRad[0];
    engine.refreshKinematics();

    for (const goal of log.goalRad) {
      out.push(engine.data.qpos[at]);
      engine.setController({ kind: 'hold', values: { [joint.id]: goal / D2R } });
      engine.step(log.dt);
    }
  } finally {
    engine.dispose();
  }

  return out;
}
