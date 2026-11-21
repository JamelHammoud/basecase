import loadMujoco from '@mujoco/mujoco';
import { expect, it, vi } from 'vitest';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { caseCommand } from '../cases/caseTarget';
import { buildRig } from '../utils/kinematics';
import { driveAccess } from '../sim/driveAccess';
import { SimEngine } from '../sim/engine';
import { Recorder, type Recording } from '../sim/recorder';
import { teachingPolicy } from '../sim/fixtures/teachingPolicy';
import { fixtureModel, fixtureRobot } from './fixtureModels';
import { hashOf } from './hash';
import { triesJob } from './triesTraining';
import { runTries } from './triesRun';
import type { ForgeJob, ForgeRunner } from './forgeRunner';
import { encodeRecording } from '../cases/recordingFile';
import { importedStored } from '../datasets/labelFixtures';
import { snapshotTraining } from '../datasets/snapshotTraining';
import type { DatasetSnapshot } from '../datasets/snapshotTypes';
import { sha256Hex } from './hash';

async function fixture(controlDt = 0.04, originalSeconds = 0.12) {
  const robot = fixtureRobot('arm-3dof');
  const rig = buildRig(robot.joints, robot.parts);
  const made = buildCase({ goal: 'touch', world: 'floor' }, builderRobot(rig, robot.parts));

  if (!made.ok) throw new Error(made.problem);

  const kase = made.kase;
  const model = fixtureModel(robot.id);
  const policy = { ...teachingPolicy(model, caseCommand(kase)), controlDt };
  const engine = new SimEngine(await loadMujoco(), model);
  const access = driveAccess({ rig, parts: robot.parts, model });

  if (access.kind !== 'ready' || access.setup.kind !== 'arm') throw new Error('Expected arm');

  const controller = { kind: 'policy' as const, robot: model.robots[0].key, policy };

  try {
    engine.setController(controller);

    const original = new Recorder(engine);

    engine.stepHook = original.hook;
    engine.step(originalSeconds);

    const demo = original.finish();

    engine.startTeaching(access.setup);

    const recorder = new Recorder(engine, controller);

    engine.stepHook = recorder.hook;
    engine.controlHook = recorder.control;
    engine.step(0.04);
    engine.handoff('operator');
    engine.command({ v: [0, 0, 0], joints: { [policy.joints[0]]: 10 } });
    engine.step(0.12);
    engine.handoff('policy');
    engine.step(0.04);

    const correction = recorder.finish();
    const samples = [
      { tryId: 'original-train', from: 0, to: demo.frames, split: 'train' as const },
      { tryId: 'original-validation', from: 0, to: demo.frames, split: 'validation' as const },
      { tryId: 'corrected', target: 'correction' as const, from: 2, to: 8, split: 'train' as const },
    ];
    const recordings = [demo, demo, correction];
    const options = { samples, splits: samples.map((sample) => sample.split), revision: hashOf('frozen') };

    return { kase, model, policy, correction, recordings, options };
  } finally {
    engine.dispose();
  }
}

it('prepares a compatible warm cloning job with frozen correction targets and an explicit original mixture', async () => {
  const f = await fixture();
  const before = hashOf(f.policy);
  const result = triesJob(f.model, f.kase, f.recordings, f.options);
  const job = result.job as {
    warmPolicy: unknown;
    teaching: { revision: string; sourcePolicy: string; mixture: { originalRows: number; correctionRows: number } };
    demos: { episodes: Array<{ actions: number[][]; obs: number[][]; split: string }> };
  };

  expect(job.warmPolicy).toEqual(f.policy);
  expect(job.teaching).toMatchObject({ revision: f.options.revision, sourcePolicy: before });
  expect(job.teaching.mixture.originalRows).toBeGreaterThan(0);
  expect(job.teaching.mixture.correctionRows).toBe(3);
  expect(job.demos.episodes[2].actions).toHaveLength(3);
  expect(job.demos.episodes.map((episode) => episode.split)).toEqual(['train', 'validation', 'train']);
  expect(hashOf(f.policy)).toBe(before);

  const changed: Recording = {
    ...f.correction,
    controller: { kind: 'policy', robot: f.model.robots[0].key, policy: { ...f.policy, actionScale: 2 } },
  };

  expect(() => triesJob(f.model, f.kase, [f.recordings[0], f.recordings[1], changed], f.options)).toThrow(
    'same policy',
  );
  expect(() => triesJob(f.model, f.kase, f.recordings, { ...f.options, revision: '' })).toThrow('Freeze');

  const validationOriginals = f.options.samples.map((sample) => ({
    ...sample,
    split: sample.target ? ('train' as const) : ('validation' as const),
  }));

  expect(() =>
    triesJob(f.model, f.kase, f.recordings, {
      ...f.options,
      samples: validationOriginals,
      splits: validationOriginals.map((sample) => sample.split),
    }),
  ).toThrow('Select original');
});

it('preserves the incumbent when native warm starts are unavailable or the candidate becomes stale', async () => {
  const f = await fixture();
  const job: ForgeJob = triesJob(f.model, f.kase, f.recordings, f.options);
  const forge = Object.assign(
    vi.fn(async () => ({ ok: true, policy: f.policy, events: [], stderr: '' })),
    { canWarm: async () => false },
  ) as ForgeRunner;
  const done = vi.fn();
  const ports = { forge, design: 'arm', save: vi.fn(), onRecord: vi.fn() };
  const plan = { model: f.model, kase: f.kase, job, judge: vi.fn(), done };

  await runTries(plan, ports);
  expect(forge).not.toHaveBeenCalled();
  expect(done).toHaveBeenCalledWith(expect.objectContaining({ kept: false }));
  forge.canWarm = async () => true;

  let checks = 0;

  await expect(
    runTries(plan, {
      ...ports,
      assertCurrent: () => {
        if (++checks > 2) throw new Error('Changed');
      },
    }),
  ).rejects.toThrow('Changed');
  expect(plan.judge).not.toHaveBeenCalled();
  expect(ports.save).not.toHaveBeenCalled();
  expect(ports.onRecord).not.toHaveBeenCalled();
});

it.each([
  [0.02, 0.02],
  [0.04, 0.04],
  [0.08, 0.08],
  [0.08, 0.04],
])(
  'prepares frozen correction targets at source period %s with original duration %s and rejects substitutions',
  async (controlDt, originalSeconds) => {
    const f = await fixture(controlDt, originalSeconds);
    const contents = f.recordings.map((recording) => {
      const bytes = encodeRecording(recording);

      return { hash: sha256Hex(bytes), bytes };
    });
    const samples = await Promise.all(
      f.options.samples.map(async (sample, i) => ({
        ...sample,
        recording: contents[i].hash,
        source: `try:${sample.tryId}`,
        stored: await importedStored(f.model, f.recordings[i], sample.tryId),
        excluded: [],
      })),
    );
    const snapshot: DatasetSnapshot = { task: f.kase.brief, modelHash: sha256Hex(f.model.xml), samples, images: [] };
    const input = { model: f.model, kase: f.kase, snapshot, revision: hashOf(snapshot), contents, samples };

    if (originalSeconds < controlDt) {
      expect(() => snapshotTraining(input)).toThrow('These saved samples don’t fit this robot.');

      return;
    }

    const job = snapshotTraining(input);
    const demos = job.job.demos as { episodes: Array<{ actions: number[][] }> };

    expect(demos.episodes.slice(0, 2).map((episode) => episode.actions.length)).toEqual([1, 1]);
    expect(job.job.warmPolicy).toEqual(f.policy);
    expect(job.job.teaching).toMatchObject({ revision: input.revision, selections: f.options.samples });
    expect(() => snapshotTraining({ ...input, samples: [{ ...samples[2], from: 0 }] })).toThrow('frozen');
    expect(() => snapshotTraining({ ...input, contents: contents.slice(0, 2) })).toThrow('missing');
    expect(() =>
      snapshotTraining({ ...input, contents: contents.map((content) => ({ ...content, bytes: new Uint8Array(2) })) }),
    ).toThrow('content changed');
  },
);
