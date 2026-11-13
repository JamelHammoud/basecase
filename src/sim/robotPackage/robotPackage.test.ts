import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RobotJoint } from '../../types/robotics';
import { runEngineering } from '../../utils/engineering';
import { importRobot } from '../../utils/robotImport';
import { localFile, parseXml, TinyDomParser } from '../../utils/robotImport/robotImport.fixtures';
import { parseUrdf } from '../../utils/robotImport/urdf';
import { SimEngine } from '../engine';
import { fixturePackageJob } from '../fixtures/robotPackage';
import { fixtureRobots } from '../fixtures/robots';
import { toMj } from '../mjcf';
import { POLICY_FORMAT, POLICY_VERSION, policyObsSize, type PolicySpec } from '../policy';
import { buildRobotPackage, robotPackageFiles } from './buildRobotPackage';
import type { JointMap } from './jointMap';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const TWO_LINK_ARM = `<?xml version="1.0"?>
<robot name="two_link_arm">
  <link name="base_link">
    <inertial><origin xyz="0 0 0.01"/><mass value="1.5"/></inertial>
    <visual><origin xyz="0 0 0.05"/><geometry><box size="0.2 0.1 0.1"/></geometry></visual>
  </link>
  <link name="upper_link">
    <inertial><origin xyz="0 0 0.1"/><mass value="0.4"/></inertial>
    <visual><origin xyz="0 0 0.1"/><geometry><box size="0.04 0.04 0.2"/></geometry></visual>
  </link>
  <joint name="shoulder" type="revolute">
    <parent link="base_link"/><child link="upper_link"/>
    <origin xyz="0 0 0.1"/><axis xyz="0 1 0"/>
    <limit lower="-1.2" upper="1.5" effort="12" velocity="3"/>
  </joint>
</robot>`;

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const round = (v: number) => Math.round(v * 1000) / 1000 + 0;
const sortedRange = (r?: [number, number]) => r && [Math.min(...r), Math.max(...r)].map(round);

const movable = (joints: RobotJoint[]) => joints.filter((j) => j.type !== 'fixed');

describe('robot package', () => {
  it.each(fixtureRobots().map((r) => [r.id, r] as const))('packages %s', (_id, robot) => {
    const { job, project, measures } = fixturePackageJob(robot);
    const files = robotPackageFiles(job);
    const mjcf = text(files['robot.xml']);
    const engine = new SimEngine(mj, { ...job.model, xml: mjcf });

    engine.dispose();
    expect(mjcf).toBe(job.model.xml);

    const urdf = parseUrdf(parseXml(text(files['urdf/robot.urdf'])));
    const moving = urdf.joints.filter((j) => j.type !== 'fixed');

    expect(moving.map((j) => j.name)).toEqual(job.model.joints.map((j) => j.name));

    for (const j of moving) {
      const sim = job.model.joints.find((s) => s.name === j.name)!;
      const scene = robot.joints.find((s) => s.id === sim.id)!;
      const axis = new THREE.Vector3(...toMj(scene.axis)).normalize();

      expect(j.axis.distanceTo(axis)).toBeLessThan(1e-5);

      const toScene = sim.type === 'prismatic' ? (v: number) => v * 1000 : THREE.MathUtils.radToDeg;

      expect(j.limit?.map((v) => round(toScene(v)))).toEqual(sortedRange(sim.range));
    }

    const urdfKg = [...urdf.links.values()].reduce((s, l) => s + (l.mass ?? 0), 0);
    const weightKg = runEngineering({ parts: robot.parts, project, measures, servoOutputs: {} }).massG / 1000;

    expect(Math.abs(urdfKg - weightKg) / weightKg).toBeLessThan(0.01);
    expect(Object.keys(files).filter((f) => f.endsWith('.stl'))).toHaveLength(robot.parts.length);

    const map = JSON.parse(text(files['joint_map.json'])) as JointMap;

    expect(map.joints.map((j) => j.id)).toEqual(movable(robot.joints).map((_, i) => i + 1));
    expect(map.joints.map((j) => j.name)).toEqual(
      movable(robot.joints).map((j) => job.model.joints.find((s) => s.id === j.id)!.name),
    );
  });

  it('writes binary STL meshes in metres, Z up, in their link frame', () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
    const files = robotPackageFiles(fixturePackageJob(arm).job);
    const stl = files['meshes/base.stl'];
    const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
    const zs = Array.from({ length: view.getUint32(80, true) * 3 }, (_, i) => {
      const facet = 84 + Math.floor(i / 3) * 50;

      return view.getFloat32(facet + 12 + (i % 3) * 12 + 8, true);
    });

    expect(stl.byteLength).toBe(84 + 12 * 50);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.05, 4);
  });

  it('carries each policy with its observation and action spec', () => {
    const quad = fixtureRobots().find((r) => r.id === 'quad-servo')!;
    const joints = movable(quad.joints).map((j) => j.id);
    const spec: PolicySpec = {
      format: POLICY_FORMAT,
      version: POLICY_VERSION,
      task: 'walk',
      robot: 'quad',
      joints,
      defaultPose: joints.map(() => 0),
      actionScale: 0.25,
      controlDt: 0.02,
      command: [0.3, 0, 0],
      obsMean: Array.from({ length: policyObsSize({ joints }) }, () => 0),
      obsStd: Array.from({ length: policyObsSize({ joints }) }, () => 1),
      layers: [],
      activation: 'elu',
      trainedSteps: 1000,
      mujoco: '4.0.0',
      createdAt: '2026-11-12T00:00:00Z',
    };
    const record = {
      id: 'run-1',
      name: 'Walk',
      task: 'walk' as const,
      robot: 'quad',
      robotName: 'Quad',
      command: spec.command,
      trainedSteps: 1000,
      createdAt: spec.createdAt,
    };
    const { job } = fixturePackageJob(quad, [{ record, spec }]);
    const files = unzipSync(buildRobotPackage(job));
    const described = JSON.parse(text(files['quad-servo-robot/policies/run-1/spec.json']));
    const obs = described.observation.reduce((n: number, t: { size: number }) => n + t.size, 0);

    expect(JSON.parse(text(files['quad-servo-robot/policies/run-1/policy.json']))).toEqual(spec);
    expect(obs).toBe(spec.obsMean.length);
    expect(described.action.joints).toEqual(joints.map((id) => job.model.joints.find((j) => j.id === id)!.name));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'quad-servo-robot/robot.xml',
        'quad-servo-robot/urdf/robot.urdf',
        'quad-servo-robot/joint_map.json',
      ]),
    );
  });

  it('exports an imported URDF robot back with its joint, axis, limits and mass', async () => {
    vi.stubGlobal('DOMParser', TinyDomParser);

    const imported = await importRobot({ kind: 'files', files: [localFile('arm/arm.urdf', TWO_LINK_ARM)] });
    const { job } = fixturePackageJob({ id: 'arm', ...imported });
    const urdf = parseUrdf(parseXml(text(robotPackageFiles(job)['urdf/robot.urdf'])));
    const shoulder = urdf.joints.find((j) => j.type !== 'fixed')!;
    const kg = [...urdf.links.values()].reduce((s, l) => s + (l.mass ?? 0), 0);

    expect(shoulder).toMatchObject({ name: 'j0_shoulder', type: 'revolute', effort: 12 });
    expect(shoulder.axis.toArray().map(round)).toEqual(toMj(imported.joints[0].axis).map((v) => round(v * 1000)));
    expect(shoulder.limit?.map(round)).toEqual([-1.2, 1.5]);
    expect(kg).toBeCloseTo(1.9, 3);
  });
});
