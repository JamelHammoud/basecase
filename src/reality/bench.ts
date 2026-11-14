import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import type { MjcfInput } from '../sim/mjcfTypes';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import type { BenchPayload, ServoPart } from './types';

export const BENCH_JOINT = 'servo_joint';

const PIVOT_MM = 800;
const BOB_SIDE_MM = 20;

const block = (id: string, position: [number, number, number], size: number, extra: Partial<ScenePart>): ScenePart => ({
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

export function benchInput({ componentId, variant }: ServoPart, payload: BenchPayload): MjcfInput {
  const parts = [
    block('base', [0, PIVOT_MM + 60, 0], 60, { massG: 500 }),
    block('servo', [40, PIVOT_MM, 0], 30, {
      componentId,
      ...(variant ? { componentVariant: variant } : {}),
      massG: 50,
    }),
    block('bob', [0, PIVOT_MM - payload.armM * 1000, 0], BOB_SIDE_MM, { massG: payload.massKg * 1000 }),
  ];
  const joint: RobotJoint = {
    id: BENCH_JOINT,
    name: BENCH_JOINT,
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
