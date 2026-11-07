import loadMujoco from '@mujoco/mujoco';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { measureTriangles } from '../three/meshMeasure';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { SimEngine } from './engine';
import { buildMjcf } from './mjcf';
import { isStalePolicy } from './policyFreshness';
import { isPolicySpec, POLICY_FORMAT, POLICY_VERSION } from './policy';

const box = (
  id: string,
  position: [number, number, number],
  size: number,
  extra: Partial<ScenePart> = {},
): ScenePart => ({
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
  massG: 200,
  ...extra,
});

const joint = (
  id: string,
  [parent, child]: [string, string],
  origin: [number, number, number],
  extra: Partial<RobotJoint> = {},
): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [parent],
  child: [child],
  origin,
  axis: [1, 0, 0],
  range: [-90, 90],
  ...extra,
});

const cube = (size: number) =>
  new Float32Array(new THREE.BoxGeometry(size, size, size).toNonIndexed().getAttribute('position').array);

function build(parts: ScenePart[], joints: RobotJoint[]) {
  const measures = Object.fromEntries(parts.map((p) => [p.id, measureTriangles(cube(p.dimensions.width))]));

  return buildMjcf({
    parts,
    rig: buildRig(joints, parts),
    project: DEFAULT_PROJECT,
    measures,
    partTriangles: (id) => cube(parts.find((p) => p.id === id)!.dimensions.width),
  });
}

function unnamedQuadruped() {
  const corners: Array<[number, number]> = [
    [-60, -60],
    [60, -60],
    [-60, 60],
    [60, 60],
  ];
  const parts = [box('body', [0, 120, 0], 100)];
  const joints: RobotJoint[] = [];

  corners.forEach(([x, z], i) => {
    parts.push(box(`upper${i}`, [x, 80, z], 20), box(`lower${i}`, [x, 40, z], 20));
    joints.push(
      joint(`joint${i}a`, ['body', `upper${i}`], [x, 100, z]),
      joint(`joint${i}b`, [`upper${i}`, `lower${i}`], [x, 60, z], { parentJoint: `joint${i}a` }),
    );
  });

  return { parts, joints };
}

function rover() {
  const parts = [box('chassis', [0, 40, 0], 100), box('left', [-70, 30, 0], 30), box('right', [70, 30, 0], 30)];
  const joints = [
    joint('left_wheel', ['chassis', 'left'], [-70, 30, 0], { range: undefined }),
    joint('right_wheel', ['chassis', 'right'], [70, 30, 0], { range: undefined }),
  ];

  return { parts, joints };
}

function arm() {
  const parts = [box('base', [0, 20, 0], 40), box('link1', [0, 80, 0], 20), box('link2', [0, 140, 0], 20)];
  const joints = [
    joint('j1', ['base', 'link1'], [0, 40, 0]),
    joint('j2', ['link1', 'link2'], [0, 110, 0], { parentJoint: 'j1' }),
  ];

  return { parts, joints };
}

describe('robot classification', () => {
  it('floats a quadruped whose joints have no leg-like names', () => {
    const { parts, joints } = unnamedQuadruped();
    const m = build(parts, joints);

    expect(m.robots[0].morphology).toBe('legged');
    expect(m.robots[0].floating).toBe(true);
    expect(m.xml).toContain('freejoint');
  });

  it('floats a rover and drives its wheels by velocity', () => {
    const { parts, joints } = rover();
    const m = build(parts, joints);

    expect(m.robots[0].morphology).toBe('wheeled');
    expect(m.robots[0].floating).toBe(true);
    expect(m.joints.map((j) => j.drive)).toEqual(['velocity', 'velocity']);
    expect(m.xml).toMatch(/<velocity name="[^"]*left_wheel"/);
  });

  it('keeps a single arm welded to the floor', () => {
    const { parts, joints } = arm();
    const m = build(parts, joints);

    expect(m.robots[0].morphology).toBe('fixed');
    expect(m.robots[0].floating).toBe(false);
  });

  it('lets an explicit choice override the classifier', () => {
    const { parts, joints } = unnamedQuadruped();
    const m = buildMjcf({
      parts,
      rig: buildRig(joints, parts),
      project: DEFAULT_PROJECT,
      measures: {},
      partTriangles: () => null,
      fixedBase: { [buildRig(joints, parts).robots[0].key]: true },
    });

    expect(m.robots[0].floating).toBe(false);
  });
});

describe('limp and drives on real MuJoCo', () => {
  it('a limp arm falls and a held arm does not', async () => {
    const mj = await loadMujoco();
    const { parts, joints } = arm();
    const sideways = joints.map((j) => ({ ...j, axis: [0, 0, 1] as [number, number, number] }));
    const m = build(parts, sideways);
    const hold = new SimEngine(mj, m);
    const limp = new SimEngine(mj, m);

    limp.setController({ kind: 'limp' });

    for (const e of [hold, limp]) {
      e.data.qpos[0] = 0.5;
      e.step(1.5);
    }

    const heldError = Math.abs(hold.data.qpos[0]);
    const limpAngle = Math.abs(limp.data.qpos[0]);

    hold.dispose();
    limp.dispose();
    expect(heldError).toBeLessThan(0.1);
    expect(limpAngle).toBeGreaterThan(0.5);
  });

  it('restores servo strength when leaving limp', async () => {
    const mj = await loadMujoco();
    const { parts, joints } = arm();
    const e = new SimEngine(mj, build(parts, joints));
    const before = Array.from(e.model.actuator_forcerange);

    e.setController({ kind: 'limp' });
    expect(Array.from(e.model.actuator_forcerange).every((v) => v === 0)).toBe(true);
    e.setController({ kind: 'hold' });
    expect(Array.from(e.model.actuator_forcerange)).toEqual(before);
    e.dispose();
  });

  it('a rover holds its wheels still by default instead of spinning them to a pose angle', async () => {
    const mj = await loadMujoco();
    const { parts, joints } = rover();
    const e = new SimEngine(mj, build(parts, joints));

    e.step(1);

    const speeds = e.sim.joints.map((_, i) => Math.abs(e.data.qvel[6 + i]));

    e.dispose();
    expect(Math.max(...speeds)).toBeLessThan(0.2);
  });
});

describe('object friction', () => {
  async function slideDistance(friction: number) {
    const mj = await loadMujoco();
    const parts = [box('puck', [0, 15, 0], 30, { physics: { dynamic: true, friction } })];
    const e = new SimEngine(mj, build(parts, []));

    e.step(0.3);

    const x0 = e.data.qpos[0];

    e.data.qvel[0] = 1.5;
    e.step(1.5);

    const d = e.data.qpos[0] - x0;

    e.dispose();

    return d;
  }

  it('a slippery object slides farther than a grippy one, even below the default friction', async () => {
    const slippery = await slideDistance(0.1);
    const medium = await slideDistance(0.4);

    expect(slippery).toBeGreaterThan(medium * 2);
  });
});

describe('policy freshness', () => {
  it('treats a record with no version as version 0', () => {
    expect(isStalePolicy({})).toBe(false);
    expect(isStalePolicy({ modelVersion: 99 })).toBe(true);
  });

  it('rejects a policy from another contract version', () => {
    const base = { format: POLICY_FORMAT, layers: [], joints: [] };

    expect(isPolicySpec({ ...base, version: POLICY_VERSION })).toBe(true);
    expect(isPolicySpec({ ...base, version: POLICY_VERSION + 1 })).toBe(false);
  });
});
