import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import { selectedPickTargets } from './selectedPick.fixtures';
import { runCase } from './testing';
import { selectedPickContract } from './selectedPickContract';
import { evaluateContract } from '../skills/contract';
import { decodeRecording, encodeRecording } from './recordingFile';
import { sampleRecording } from '../datasets/snapshotRecording';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function fixture(ceilingN: number) {
  const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
  const target = selectedPickTargets()[0];
  const built = buildCase(
    { goal: 'pick', world: 'floor', pickTarget: target, values: { gripForceN: ceilingN } },
    builderRobot(buildRig(arm.joints, arm.parts), arm.parts),
  );

  if (!built.ok) throw new Error(built.problem);

  return { arm, kase: built.kase };
}

const held = (trace: Parameters<typeof evaluateContract>[1]) =>
  evaluateContract(
    {
      version: 1,
      success: selectedPickContract(20, 12),
      failures: [],
    },
    trace,
  );

it('distinguishes dropping, excessive closure and a force-controlled lift with the original holding contract', async () => {
  const { arm, kase } = fixture(3);
  const uncontrolled = {
    ...kase,
    task: { ...kase.task, probes: kase.task.probes.map(({ ceilingN: _ceiling, ...probe }) => probe) },
  };
  const excess = await runCase(mj, uncontrolled, arm, { controller: 'reference', record: true });
  const controlled = await runCase(mj, kase, arm, { controller: 'reference', record: true });
  const tooLight = fixture(0.01);
  const drop = await runCase(mj, tooLight.kase, arm, { controller: 'reference', record: true });

  expect((await held(excess.trace)).passed).toBe(true);
  expect(excess.passed).toBe(false);
  expect(Math.max(...excess.trace.signals.gripForcePeak)).toBeGreaterThan(3);
  expect(controlled.passed).toBe(true);
  expect((await held(controlled.trace)).passed).toBe(true);
  expect(Math.max(...controlled.trace.signals.gripForcePeak)).toBeLessThanOrEqual(3);
  expect(drop.passed).toBe(false);
  expect((await held(drop.trace)).passed).toBe(false);
});

it('retains seeded force samples exactly, slices them with dataset frames and rejects incomplete encodings', async () => {
  const { arm, kase } = fixture(3);
  const options = { controller: 'reference' as const, record: true, seed: 7, worldRandomization: false };
  const first = await runCase(mj, kase, arm, options);
  const second = await runCase(mj, kase, arm, options);
  const recording = first.recording!;
  const sliced = sampleRecording(recording, { from: 10, to: 30 });

  expect(recording.contactForce).toEqual(second.recording!.contactForce);
  expect(recording.contactForcePeak).toEqual(second.recording!.contactForcePeak);
  expect(decodeRecording(encodeRecording(sliced))).toEqual(sliced);
  expect(sliced.contactForce).toEqual(recording.contactForce!.slice(40, 120));

  for (const broken of [
    { contactForce: undefined },
    { contactForcePeak: undefined },
    { forceEvidence: undefined },
    { contactForce: Float64Array.of(Number.NaN) },
    { forceEvidence: { ...recording.forceEvidence!, channels: null } },
  ]) {
    expect(decodeRecording(encodeRecording({ ...recording, ...broken } as typeof recording))).toBeNull();
  }
});

it('cancels force-observing physics without returning a partial retained try', async () => {
  const { arm, kase } = fixture(3);
  let cancelled = false;

  await expect(
    runCase(mj, kase, arm, {
      controller: 'reference',
      record: true,
      cancelled: () => cancelled,
      checkpoint: async () => {
        cancelled = true;
      },
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
