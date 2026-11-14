import { describe, expect, it } from 'vitest';
import { BAM_STS3215_7V4 } from '../data/servoFits';
import { calibratedInput } from '../reality/calibratedInput';
import { simCalibrations } from '../reality/history';
import { withCalibration, withRollBack } from '../reality/projectCalibrations';
import type { ServoCalibration } from '../reality/types';
import { DEFAULT_PROJECT, type ProjectSettings, type RobotPoseState, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematicsRig';
import { box, fixtureMeasures, fixtureTriangles } from './fixtures/parts';
import { fixtureRobots } from './fixtures/robots';
import { buildMjcf } from './mjcf';
import { SIM_MODEL_VERSION } from './mjcfTypes';
import { isStalePolicy, modelFingerprints } from './policyFreshness';

interface Scene {
  parts: ScenePart[];
  project: ProjectSettings;
}

const servo = (id: string, at: [number, number, number]): ScenePart => ({
  ...box(id, at, [24, 32, 45], 55),
  componentId: 'feetech-sts3215',
  componentVariant: 'c001',
});

function withServo(scene: Scene, jointId: string): Scene {
  const joint = scene.project.joints!.find((j) => j.id === jointId)!;
  const id = `${jointId}_servo`;

  return {
    parts: [...scene.parts, servo(id, joint.origin)],
    project: {
      ...scene.project,
      joints: scene.project.joints!.map((j) =>
        j.id === jointId ? { ...j, parent: [...j.parent, id], actuators: [id] } : j,
      ),
    },
  };
}

function quad(): Scene {
  const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;

  return withServo({ parts: robot.parts, project: { ...DEFAULT_PROJECT, joints: robot.joints } }, 'leg0_abduct');
}

function model({ parts, project }: Scene, pose?: RobotPoseState) {
  const input = {
    parts,
    rig: buildRig(project.joints ?? [], parts),
    project,
    pose,
    measures: fixtureMeasures(parts),
    partTriangles: fixtureTriangles(parts),
  };

  return buildMjcf(calibratedInput(input, simCalibrations(project.servoCalibrations)));
}

const fingerprint = (scene: Scene, pose?: RobotPoseState) => model(scene, pose).robots[0].fingerprint;

const calibration = (ktScale: number): ServoCalibration => ({
  verdict: 'measured',
  family: 'sts3215',
  version: 0,
  rung: 'response',
  fit: { ...BAM_STS3215_7V4, kt: BAM_STS3215_7V4.kt * ktScale },
  volts: 7.4,
  scales: { kt: ktScale },
  conditions: { volts: 7.4, temperatureC: 30 },
  evidence: { logs: 3, presetErrorRad: 0.04, fittedErrorRad: 0.01, gain: 0.75, explained: 0.9, reason: '' },
});

const resized = (scene: Scene, id: string): Scene => ({
  ...scene,
  parts: scene.parts.map((p) =>
    p.id === id ? { ...p, dimensions: { ...p.dimensions, height: p.dimensions.height + 20 } } : p,
  ),
});

const moved = (scene: Scene, dx: number): Scene => ({
  parts: scene.parts.map((p) => ({ ...p, position: [p.position[0] + dx, p.position[1], p.position[2]] })),
  project: {
    ...scene.project,
    joints: scene.project.joints!.map((j) => ({ ...j, origin: [j.origin[0] + dx, j.origin[1], j.origin[2]] })),
  },
});

describe('robot fingerprint', () => {
  it('stays the same across a save and reload, a new pose, a move across the floor and new scenery', () => {
    const scene = quad();
    const before = fingerprint(scene);
    const reloaded = JSON.parse(JSON.stringify(scene)) as Scene;
    const withScenery = { ...scene, parts: [...scene.parts, box('crate', [400, 50, 0], [100, 100, 100], 900)] };

    expect(fingerprint(reloaded)).toBe(before);
    expect(fingerprint(scene, { values: { leg0_swing: 30, leg1_bend: -40 } })).toBe(before);
    expect(fingerprint(moved(scene, 250))).toBe(before);
    expect(fingerprint(withScenery)).toBe(before);
  });

  it('changes with a resized link and with a new servo', () => {
    const scene = quad();
    const before = fingerprint(scene);

    expect(fingerprint(resized(scene, 'leg2_lower'))).not.toBe(before);
    expect(fingerprint(withServo(scene, 'leg1_abduct'))).not.toBe(before);
  });

  it('changes with a new active calibration and comes back when it is rolled back', () => {
    const scene = quad();
    const before = fingerprint(scene);
    const calibrated = { ...scene, project: withCalibration(scene.project, 'leg0_abduct', calibration(0.8)) };
    const recalibrated = { ...scene, project: withCalibration(calibrated.project, 'leg0_abduct', calibration(0.9)) };
    const after = fingerprint(calibrated);

    expect(after).not.toBe(before);
    expect(fingerprint(recalibrated)).not.toBe(after);
    expect(fingerprint({ ...scene, project: withRollBack(recalibrated.project, 'leg0_abduct') })).toBe(after);
    expect(fingerprint({ ...scene, project: withRollBack(calibrated.project, 'leg0_abduct') })).toBe(before);
  });
});

describe('isStalePolicy', () => {
  const scene = quad();
  const current = modelFingerprints(model(scene));
  const robot = model(scene).robots[0].key;
  const trained = { robot, modelVersion: SIM_MODEL_VERSION, fingerprint: current[robot] };

  it('marks a policy stale once its robot’s model no longer matches', () => {
    const changed = modelFingerprints(model(resized(scene, 'leg2_lower')));

    expect(isStalePolicy(trained, current)).toBe(false);
    expect(isStalePolicy(trained, changed)).toBe(true);
    expect(isStalePolicy({ ...trained, modelVersion: 0 }, current)).toBe(true);
  });

  it('falls back to the sim version for records with no fingerprint, or when the model isn’t built', () => {
    const changed = modelFingerprints(model(resized(scene, 'leg2_lower')));

    expect(isStalePolicy({ robot, modelVersion: SIM_MODEL_VERSION }, changed)).toBe(false);
    expect(isStalePolicy({ robot }, changed)).toBe(true);
    expect(isStalePolicy(trained)).toBe(false);
    expect(isStalePolicy(trained, modelFingerprints(null))).toBe(false);
  });
});
