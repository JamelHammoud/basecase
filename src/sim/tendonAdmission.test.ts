import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { tendonMechanism } from './fixtures/tendonMechanisms';
import { trainingJob } from './trainingJob';
import { kitJob } from '../skills/kitJob';
import { buildRig, solveIK } from '../utils/kinematics';
import { sceneRobotChoices } from '../robot/sceneRobot';
import { preparedCalibratedModel } from './calibratedModel';
import { SimEngine } from './engine';
import { robotPackageFiles } from './robotPackage/buildRobotPackage';
import { writeUrdf } from '../utils/robotImport/urdfWriter';
import { parseUrdf } from '../utils/robotImport/urdf';
import { parseMjcf } from '../utils/robotImport/mjcf';
import { parseXml } from '../utils/robotImport/robotImport.fixtures';
import { poseSetup } from './drivePose';
import { driveAccess } from './driveAccess';
import { buildMjcf } from './mjcf';

it('imports legacy direct-drive models with empty tendon sections', () => {
  const { input } = tendonMechanism();
  const joints = input.project.joints.map((joint) => ({ ...joint, tendon: undefined }));
  const model = buildMjcf({ ...input, project: { ...input.project, joints }, rig: buildRig(joints, input.parts) });
  const xml = model.xml.replace('</mujoco>', '<tendon/></mujoco>');
  const imported = parseMjcf(parseXml(xml));

  expect(imported.joints.filter((joint) => joint.actuation === 'powered')).toHaveLength(1);
  expect(imported.joints.filter((joint) => joint.actuation === 'passive')).toHaveLength(1);
});

it('refuses training, IK and runtime admission before treating passive coordinates as targets', () => {
  const { input, model } = tendonMechanism();

  expect(() =>
    trainingJob(model, model.robots[0].key, { task: 'stand', minutes: 1, command: [0, 0, 0] }, 'Elbow'),
  ).toThrow('Use Simulate');
  expect(() => kitJob(model, 'stand', { minutes: 1, seed: 1 })).toThrow('Use Simulate');
  expect(() => solveIK(input.rig, {}, [])).toThrow('Use Simulate');
  expect(sceneRobotChoices(input.project.joints)).toEqual({ ok: false, reason: 'Use Simulate for ideal tendons.' });
});

it('drives and records motor coordinates through the existing pose drive without targeting passive outputs', async () => {
  const { input, model } = tendonMechanism();
  const engine = new SimEngine(await loadMujoco(), model);
  const setup = poseSetup(input.rig, { robot: model.robots[0].key });

  try {
    expect(setup.joints.map((j) => j.id)).toEqual(['motor_0']);

    const legged = buildRig(
      input.project.joints.map((j) => (j.tendon ? { ...j, limb: 'leg' as const } : j)),
      input.parts,
    );

    expect(poseSetup(legged, { robot: model.robots[0].key }).joints.map((j) => j.id)).toEqual(['motor_0']);
    expect(driveAccess({ ...input, model }).kind).toBe('ready');
    engine.setController({ kind: 'drive', setup });
    engine.command({ v: [0, 0, 0], joints: { motor_0: 20, output_0: 80 } });
    engine.step(1);
    expect(engine.jointAngles()[0]).toBeCloseTo(engine.jointAngles()[1], 2);
    expect(engine.jointAngles()[0]).toBeGreaterThan(0.1);
    expect(engine.jointAngles()[0]).toBeLessThan(0.5);
  } finally {
    engine.dispose();
  }
});

it('retains the last supported controller when an unsupported controller is refused', async () => {
  const { input, model } = tendonMechanism();
  const engine = new SimEngine(await loadMujoco(), model);

  try {
    engine.setController({ kind: 'hold', values: { motor_0: 20 } });
    expect(() =>
      engine.setController({
        kind: 'drive',
        setup: { kind: 'legs', robot: model.robots[0].key, rig: input.rig, feet: [], start: {} },
      }),
    ).toThrow('Use Simulate');
    engine.step(0.5);
    expect(engine.jointAngles()[1]).toBeGreaterThan(0.1);
  } finally {
    engine.dispose();
  }
});

it('refuses cancelled and stale preparation without publishing model evidence', async () => {
  const { input } = tendonMechanism();
  const controller = new AbortController();
  const started = performance.now();

  controller.abort();
  await expect(preparedCalibratedModel(input, undefined, { signal: controller.signal })).rejects.toThrow();
  await expect(preparedCalibratedModel(input, undefined, { current: () => false })).rejects.toThrow(/changed/);
  process.stdout.write(JSON.stringify({ cancellationMs: performance.now() - started }));
});

it('exports original transmission declarations and explicitly marks the unsupported URDF extension', async () => {
  const { input, model } = tendonMechanism();
  const urdf = writeUrdf({
    name: 'Elbow',
    model,
    joints: input.project.joints,
    parts: input.parts,
    masses: [],
    triangles: () => null,
  }).urdf;

  expect(urdf).toContain('unsupported="ideal-tendons"');
  expect(() => parseUrdf(parseXml(urdf))).toThrow(/Basecase scene/);
  expect(() => parseMjcf(parseXml(model.xml))).toThrow(/Basecase scene/);

  const files = robotPackageFiles({
    name: 'Elbow',
    robot: model.robots[0].key,
    model,
    parts: input.parts,
    project: input.project,
    measures: {},
    triangles: {},
    policies: [],
  });
  const metadata = JSON.parse(new TextDecoder().decode(files['transmissions.json']));

  expect(new TextDecoder().decode(files['robot.xml'])).toBe(model.xml);
  expect(metadata.transmissions).toEqual([
    { motor: 'motor_0', tendon: input.project.joints.find((j) => j.id === 'motor_0')!.tendon },
  ]);
  expect(metadata.unsupported).toEqual(['urdf', 'runtime']);
  expect(metadata.coordinates.find((joint: { id: string }) => joint.id === 'motor_0').actuator).toBe(0);
  expect(metadata.coordinates.find((joint: { id: string }) => joint.id === 'output_0').actuator).toBe(-1);

  const mj = await loadMujoco();
  const compiled = mj.MjModel.from_xml_string(new TextDecoder().decode(files['robot.xml']));

  try {
    const actuators = Array.from({ length: compiled.nu }, (_, i) => compiled.actuator_trnid[i * 2]);

    for (const coordinate of metadata.coordinates) {
      const joint = mj.mj_name2id(compiled, mj.mjtObj.mjOBJ_JOINT.value, coordinate.name);

      expect(joint).toBeGreaterThanOrEqual(0);
      expect(actuators.indexOf(joint)).toBe(coordinate.actuator);
    }
  } finally {
    compiled.delete();
  }
});
