import { beforeAll, describe, expect, it } from 'vitest';
import { loadedMujoco } from './calibrate';
import { applyBodyFit } from './bodyModel';
import { buildMjcf } from '../sim/mjcf';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { modelHashes } from '../skills/artifacts';
import { recordBodyCalibration, rollBackBody } from './history';
import type { BodyCalibration } from './bodyTypes';
import { SimEngine } from '../sim/engine';
import { robotWeight, runEngineering } from '../utils/engineering';
import { isStalePolicy, modelFingerprints } from '../sim/policyFreshness';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import { robotPackageFiles } from '../sim/robotPackage/buildRobotPackage';
import { parseXml } from '../utils/robotImport/robotImport.fixtures';
import { parseUrdf } from '../utils/robotImport/urdf';
import { rigBodies } from './bodyLayout';
import { Matrix3, Matrix4, Quaternion } from 'three';

function exportedInertia(text: string, name: string) {
  const xml = parseXml(text);
  const link = Array.from(xml.documentElement.children).find((entry) => entry.getAttribute('name') === name)!;
  const inertial = Array.from(link.children).find((entry) => entry.tagName === 'inertial')!;

  return Array.from(inertial.children).find((entry) => entry.tagName === 'inertia')!;
}

function compiledInertia(engine: SimEngine, body: number) {
  const [w, x, y, z] = engine.model.body_iquat.subarray(body * 4, body * 4 + 4);
  const [a, b, c] = engine.model.body_inertia.subarray(body * 3, body * 3 + 3);
  const rotation = new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromQuaternion(new Quaternion(x, y, z, w)));
  const diagonal = new Matrix3().set(a, 0, 0, 0, b, 0, 0, 0, c);

  return rotation.clone().multiply(diagonal).multiply(rotation.transpose()).elements;
}

const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const input = {
  parts: robot.parts,
  rig: buildRig(robot.joints, robot.parts),
  project: { ...DEFAULT_PROJECT, joints: robot.joints },
  measures: fixtureMeasures(robot.parts),
  partTriangles: fixtureTriangles(robot.parts),
};
const base = buildMjcf(input);
const key = base.robots[0].key;
const leaf = base.bodies.find((b) => b.joint === 'arm2')!;
const fit = { massScales: { [leaf.name]: 2 }, payloadKg: { [leaf.name]: 0.2 }, floorFrictionScale: 0.5 };
const calibration: BodyCalibration = {
  version: 0,
  verdict: 'measured',
  robot: key,
  fit,
  evidence: { presetErrorRad: 0.1, fittedErrorRad: 0.04, gain: 0.6 },
  modelFingerprint: base.robots[0].fingerprint,
};

describe('body fit physics', () => {
  let mj: Awaited<ReturnType<typeof loadedMujoco>>;

  beforeAll(async () => {
    mj = await loadedMujoco();
  });

  it('changes compiled geom mass, link inertia, COM and the floor contact coefficient', () => {
    const fitted = applyBodyFit(base, key, fit);
    const before = new SimEngine(mj, base);
    const after = new SimEngine(mj, fitted);
    const body = base.bodies.indexOf(leaf) + 1;

    try {
      expect(after.model.body_mass[body]).toBeCloseTo(before.model.body_mass[body] * 2 + 0.2, 6);
      expect(after.model.body_inertia[body * 3]).toBeGreaterThan(before.model.body_inertia[body * 3] * 2);
      expect(after.model.body_ipos[body * 3 + 2]).toBeGreaterThan(before.model.body_ipos[body * 3 + 2]);
      expect(after.model.geom_friction[0]).toBeCloseTo(0.45, 6);
      expect(fitted.massKg[key]).toBeCloseTo(base.massKg[key] + 0.26, 6);
      expect(fitted.xml).toContain('contype="0" conaffinity="0"');
      expect(base.xml).not.toContain('payload_');
    } finally {
      before.dispose();
      after.dispose();
    }
  });

  it('uses the active version, supports explicit fitter overrides and restores preset physics on rollback', () => {
    const history = recordBodyCalibration({ versions: [], active: null }, calibration);
    const project = { ...input.project, bodyCalibrations: { [key]: history } };
    const measured = buildMjcf({ ...input, project });
    const rolled = buildMjcf({ ...input, project: { ...project, bodyCalibrations: { [key]: rollBackBody(history) } } });
    const overridden = buildMjcf({ ...input, project, bodyFits: { [key]: { ...fit, massScales: {}, payloadKg: {} } } });

    expect(measured.xml).toBe(applyBodyFit(base, key, fit).xml);
    expect(rolled.xml).toBe(base.xml);
    expect(rolled.robots[0].fingerprint).toBe(base.robots[0].fingerprint);
    expect(overridden.massKg[key]).toBe(base.massKg[key]);
    expect(robotWeight({ ...input, project }).all.grams / 1000).toBeCloseTo(measured.massKg[key], 6);

    const policy = { robot: key, modelVersion: base.version, fingerprint: base.robots[0].fingerprint };

    expect(isStalePolicy(policy, modelFingerprints(measured))).toBe(true);
    expect(isStalePolicy(policy, modelFingerprints(rolled))).toBe(false);
  });

  it('changes policy physics and robot fingerprints without changing actuator or topology hashes', () => {
    const fitted = applyBodyFit(base, key, fit);
    const previous = modelHashes(base);
    const next = modelHashes(fitted);

    expect(next.physics).not.toBe(previous.physics);
    expect(next.topology).toBe(previous.topology);
    expect(next.actuators).toBe(previous.actuators);
    expect(fitted.robots[0].fingerprint).not.toBe(base.robots[0].fingerprint);
  });

  it('rejects unknown bodies, nonterminal payloads and nonphysical parameters', () => {
    expect(() => applyBodyFit(base, key, { ...fit, massScales: { missing: 2 } })).toThrow();
    expect(() => applyBodyFit(base, key, { ...fit, massScales: { [leaf.name]: 0 } })).toThrow();
    expect(() => applyBodyFit(base, key, { ...fit, payloadKg: { [base.robots[0].root]: 0.2 } })).toThrow();
    expect(() => applyBodyFit(base, key, { ...fit, floorFrictionScale: Number.NaN })).toThrow();
  });

  it('keeps an identity fit byte-for-byte unchanged', () => {
    expect(applyBodyFit(base, key, { massScales: {}, payloadKg: {}, floorFrictionScale: 1 })).toBe(base);
  });

  it('raises upstream servo torque and keeps vertical-axis gravity torque zero after a heavier payload is kept', () => {
    const history = recordBodyCalibration({ versions: [], active: null }, calibration);
    const before = runEngineering({ ...input, servoOutputs: {} });
    const after = runEngineering({
      ...input,
      project: { ...input.project, bodyCalibrations: { [key]: history } },
      servoOutputs: {},
    });

    expect(after.massG).toBeGreaterThan(before.massG);

    for (const id of ['arm0', 'arm1']) {
      expect(after.joints.find((j) => j.joint.id === id)!.loadNm).toBeGreaterThan(
        before.joints.find((j) => j.joint.id === id)!.loadNm,
      );
    }

    expect(before.joints.find((j) => j.joint.id === 'arm2')!.loadNm).toBe(0);
    expect(after.joints.find((j) => j.joint.id === 'arm2')!.loadNm).toBe(0);

    expect(after.rows.find((row) => row.check === 'Servo torque')?.detail).not.toBe(
      before.rows.find((row) => row.check === 'Servo torque')?.detail,
    );
  });

  it('exports the measured weight and center of mass in the robot package URDF', () => {
    const { job } = fixturePackageJob(robot);
    const history = recordBodyCalibration({ versions: [], active: null }, calibration);
    const project = { ...job.project, bodyCalibrations: { [key]: history } };
    const measured = buildMjcf({ ...input, project });
    const files = robotPackageFiles({ ...job, model: measured, project });
    const text = new TextDecoder().decode(files['urdf/robot.urdf']);
    const urdf = parseUrdf(parseXml(text));
    const total = [...urdf.links.values()].reduce((sum, link) => sum + (link.mass ?? 0), 0);
    const engine = new SimEngine(mj, measured);

    try {
      expect(total).toBeCloseTo(measured.massKg[key], 6);

      const body = measured.bodies.findIndex((body) => body.name === leaf.name) + 1;
      const center = urdf.links.get(leaf.name)!.com!;
      const inertia = exportedInertia(text, leaf.name);
      const expected = compiledInertia(engine, body);

      center.toArray().forEach((value, axis) => expect(value).toBeCloseTo(engine.model.body_ipos[body * 3 + axis], 6));

      for (const [attribute, index] of [
        ['ixx', 0],
        ['iyy', 4],
        ['izz', 8],
        ['ixy', 3],
        ['ixz', 6],
        ['iyz', 7],
      ] as const)
        expect(Number(inertia.getAttribute(attribute))).toBeCloseTo(expected[index], 10);
    } finally {
      engine.dispose();
    }
  });

  it.each(fixtureRobots())('maps Checks link membership to MJCF for $id', (robot) => {
    const { job } = fixturePackageJob(robot);

    expect(rigBodies(buildRig(robot.joints, robot.parts))).toEqual(job.model.bodies);
  });

  it('leaves a saved fit inactive after its named link is removed', () => {
    const history = recordBodyCalibration(
      { versions: [], active: null },
      { ...calibration, fit: { ...fit, massScales: { missing: 2 } } },
    );
    const project = { ...input.project, bodyCalibrations: { [key]: history } };

    expect(buildMjcf({ ...input, project }).xml).toBe(base.xml);
    expect(robotWeight({ ...input, project }).all.grams / 1000).toBeCloseTo(base.massKg[key], 6);
  });
});
