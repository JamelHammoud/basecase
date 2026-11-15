import { describe, expect, it } from 'vitest';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import type { SimModel } from '../sim/mjcfTypes';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { robotWeight } from '../utils/engineering';
import { bodyKey } from './bodyLayout';
import type { BodyFit } from './bodyTypes';
import { recordBodyCalibration, rollBackBody } from './history';

const arm = fixtureRobots().find((robot) => robot.id === 'arm-3dof')!;
const second = {
  parts: arm.parts.map((part) => ({
    ...part,
    id: `aaa_${part.id}`,
    position: [part.position[0] + 300, part.position[1], part.position[2]] as [number, number, number],
  })),
  joints: arm.joints.map((joint) => ({
    ...joint,
    id: `aaa_${joint.id}`,
    name: `aaa_${joint.name}`,
    parent: joint.parent.map((id) => `aaa_${id}`),
    child: joint.child.map((id) => `aaa_${id}`),
    origin: [joint.origin[0] + 300, joint.origin[1], joint.origin[2]] as [number, number, number],
    parentJoint: joint.parentJoint && `aaa_${joint.parentJoint}`,
  })),
};

function scene(pair = true) {
  const parts = pair ? [...arm.parts, ...second.parts] : arm.parts;
  const joints = pair ? [...arm.joints, ...second.joints] : arm.joints;

  return {
    parts,
    rig: buildRig(joints, parts),
    project: { ...DEFAULT_PROJECT, joints },
    measures: fixtureMeasures(parts),
    partTriangles: fixtureTriangles(parts),
  };
}

function recorded(model: SimModel, robot: string, fit: BodyFit, date: string) {
  return recordBodyCalibration(
    { versions: [], active: null },
    {
      version: 0,
      verdict: 'measured',
      robot,
      fit,
      evidence: { presetErrorRad: 0.1, fittedErrorRad: 0.04, gain: 0.6 },
      modelFingerprint: model.robots.find((r) => r.key === robot)!.fingerprint,
      bodyKeys: Object.fromEntries(
        model.bodies.filter((body) => body.robot === robot).map((body) => [body.name, bodyKey(body)]),
      ),
    },
    new Date(date),
  );
}

describe('shared floor and stable body identities', () => {
  it('uses the newest active floor fit once, changes both robots and restores the earlier floor on rollback', () => {
    const input = scene();
    const base = buildMjcf(input);
    const [a, b] = base.robots.map((robot) => robot.key);
    const fit = (floorFrictionScale: number): BodyFit => ({ massScales: {}, payloadKg: {}, floorFrictionScale });
    const older = recorded(base, a, fit(0.5), '2026-11-14T12:00:00Z');
    const newer = recorded(base, b, fit(0.8), '2026-11-14T12:00:01Z');
    const project = { ...input.project, bodyCalibrations: { [a]: older, [b]: newer } };
    const measured = buildMjcf({ ...input, project });
    const rolled = buildMjcf({
      ...input,
      project: { ...project, bodyCalibrations: { [a]: older, [b]: rollBackBody(newer) } },
    });

    expect(measured.xml).toMatch(/name="floor"[^>]*friction="0.72 0.02 0.002"/);
    expect(rolled.xml).toMatch(/name="floor"[^>]*friction="0.45 0.02 0.002"/);
    expect(measured.robots.every((robot, index) => robot.fingerprint !== base.robots[index].fingerprint)).toBe(true);
    expect(rolled.robots.every((robot, index) => robot.fingerprint !== measured.robots[index].fingerprint)).toBe(true);
  });

  it('keeps a measured link fit and fingerprint when another robot changes scene numbering', () => {
    const original = scene(false);
    const base = buildMjcf(original);
    const robot = base.robots[0].key;
    const wrist = base.bodies.find((body) => body.joint === 'arm2')!.name;
    const forearm = base.bodies.find((body) => body.joint === 'arm1')!.name;
    const fit = { massScales: { [forearm]: 1.3 }, payloadKg: { [wrist]: 0.15 }, floorFrictionScale: 1 };
    const history = recorded(base, robot, fit, '2026-11-14T12:00:00Z');
    const project = { ...original.project, bodyCalibrations: { [robot]: history } };
    const measured = buildMjcf({ ...original, project });
    const paired = scene();
    const pairedProject = { ...paired.project, bodyCalibrations: { [robot]: history } };
    const added = buildMjcf({ ...paired, project: pairedProject });

    expect(added.bodies.find((body) => body.joint === 'arm2')!.name).not.toBe(wrist);
    expect(added.massKg[robot]).toBeCloseTo(measured.massKg[robot], 6);
    expect(added.robots.find((r) => r.key === robot)!.fingerprint).toBe(measured.robots[0].fingerprint);
    expect(
      robotWeight({ ...paired, project: pairedProject }).bodies.find((body) => body.key === robot)!.mass.grams / 1000,
    ).toBeCloseTo(measured.massKg[robot], 6);
  });
});
