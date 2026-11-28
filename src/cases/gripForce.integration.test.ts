import { mkdirSync, writeFileSync } from 'node:fs';
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import { stageCase, stagedEffectors } from './caseCast';
import { decodeRecording, encodeRecording } from './recordingFile';
import { runCase } from './testing';
import { scoreTry, trySignals } from './tries';
import { selectedPickTargets } from './selectedPick.fixtures';
import { replayTry } from './tryReplay';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const shapes = selectedPickTargets();
const workflows = [
  ...shapes,
  { ...shapes[0], id: 'heavy-cube', massG: 60 },
  { ...shapes[5], id: 'wide-cylinder', dimensions: { width: 40, height: 22, depth: 40 } },
  { ...shapes[0], id: 'low-friction-cube', physics: { dynamic: true, friction: 0.2 } },
];

it.each([
  ...workflows.map((target) => ({ name: target.id, target, symmetric: false })),
  { name: 'symmetric-jaw-ranges', target: shapes[0], symmetric: true },
])('retains target-bound jaw forces and the complete verdict for $name', async ({ target, symmetric }) => {
  const original = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
  const arm = {
    ...original,
    joints: original.joints.map((joint) =>
      symmetric && joint.id.startsWith('finger_') ? { ...joint, range: [-25, 25] as [number, number] } : joint,
    ),
  };
  const rig = buildRig(arm.joints, arm.parts);
  const built = buildCase(
    { goal: 'pick', world: 'floor', pickTarget: target, values: { gripForceN: 3 } },
    builderRobot(rig, arm.parts),
  );

  if (!built.ok) throw new Error(built.problem);

  const result = await runCase(mj, built.kase, arm, { controller: 'reference', record: true });
  const recording = decodeRecording(encodeRecording(result.recording!))!;
  const staged = stageCase(result.case, { rig, parts: arm.parts }, []);
  const source = {
    kase: result.case,
    model: result.model,
    recording,
    ...stagedEffectors(staged, { rig, parts: arm.parts }),
  };
  const trace = trySignals(source);

  mkdirSync('scratch/grip-force-workflows', { recursive: true });
  writeFileSync(
    `scratch/grip-force-workflows/${symmetric ? 'symmetric-jaw-ranges' : target.id}.json`,
    JSON.stringify(
      {
        name: target.id,
        symmetric,
        massG: target.massG,
        friction: target.physics?.friction,
        passed: result.passed,
        margin: result.margin,
        peakN: Math.max(...trace.signals.gripForcePeak),
        sampledN: Math.max(...trace.signals.gripForce),
        frames: recording.frames,
        gripFrames: trace.signals.grip.filter(Boolean).length,
        provenance: recording.forceEvidence,
      },
      null,
      2,
    ),
  );

  expect(
    result.passed,
    JSON.stringify({
      peak: Math.max(...trace.signals.gripForcePeak),
      overloadAt: trace.signals.gripForcePeak.findIndex((force) => force > 3) * trace.dt,
      force: Math.max(...trace.signals.gripForce),
      grip: trace.signals.grip.filter(Boolean).length,
      margin: result.margin,
      command: result.recording!.commands?.findLast(
        (c) => c.at <= trace.signals.gripForcePeak.findIndex((force) => force > 3) * trace.dt,
      ),
    }),
  ).toBe(true);
  expect(Math.max(...trace.signals.gripForce)).toBeGreaterThan(0);
  expect(Math.max(...trace.signals.gripForcePeak)).toBeLessThanOrEqual(3);
  expect(trace.signals.jawForce1.some((force) => force > 0)).toBe(true);
  expect(trace.signals.jawForce2.some((force) => force > 0)).toBe(true);
  expect(recording.contactForce).toEqual(result.recording!.contactForce);
  expect(recording.contactForcePeak).toEqual(result.recording!.contactForcePeak);
  expect((await scoreTry(source)).passed).toBe(true);
  expect((await replayTry(mj, source, null)).passed).toBe(true);
  await expect(scoreTry({ ...source, recording: { ...recording, forceEvidence: undefined } })).rejects.toThrow();
  await expect(
    scoreTry({
      ...source,
      kase: {
        ...source.kase,
        world: {
          ...source.kase.world,
          objects: source.kase.world.objects.map((object) => ({ ...object, friction: 0.01 })),
        },
      },
    }),
  ).rejects.toThrow();
});
