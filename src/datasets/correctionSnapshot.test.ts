import { expect, it } from 'vitest';
import { encodeRecording } from '../cases/recordingFile';
import type { StoredTry } from '../cases/tryFile';
import { fixtureModel } from '../skills/fixtureModels';
import { hashOf, sha256Hex } from '../skills/hash';
import type { Recording } from '../sim/recorder';
import { newDataset, freezeVersion, readDataset } from './datasetFile';
import { resolveSnapshot, restoreSamples, snapshotHash } from './datasetSnapshot';
import { mergedDatasetSamples } from './datasetSelections';
import { isDatasetSample } from './snapshotTypes';
import { assignSources } from './snapshotSplits';
import { correctionFrames } from '../sim/teachingRecording';
import { correctionEpisode } from './demos';

it('fits explicitly selected corrections as one source group while preserving independent validation and explicit splits', () => {
  const sources = [
    { source: 'correction', content: 'shared', preferTrain: true },
    { source: 'branch', content: 'shared' },
    ...['one', 'two', 'three', 'four'].map((source) => ({ source, content: source })),
  ];

  for (const seed of [1, 9, 42, 100]) {
    const splits = assignSources(sources, seed);

    expect(splits.slice(0, 2)).toEqual(['train', 'train']);
    expect(splits.slice(2)).toContain('validation');
    expect(assignSources(sources, seed)).toEqual(splits);
    expect(assignSources([{ ...sources[0], explicit: 'test' }, ...sources.slice(1)], seed).slice(0, 2)).toEqual([
      'test',
      'test',
    ]);
  }
});

async function fixture() {
  const model = fixtureModel('arm-3dof');
  const frames = 21;
  const boundaries = 200;
  const recording: Recording = {
    dt: 0.02,
    frames,
    nq: 3,
    nv: 3,
    nu: 3,
    nbody: model.bodies.length,
    t: Float32Array.from({ length: frames }, (_, i) => i * 0.02),
    ctrl: new Float32Array(frames * 3),
    qpos: new Float64Array(frames * 3),
    qvel: new Float32Array(frames * 3),
    poses: new Float32Array(frames * model.bodies.length * 7),
    jointQpos: Int32Array.from([0, 1, 2]),
    jointDof: Int32Array.from([0, 1, 2]),
    root: [-1, -1],
    teaching: {
      policy: hashOf('source'),
      model: sha256Hex(model.xml),
      robot: model.robots[0].key,
      fingerprint: model.robots[0].fingerprint,
      joints: model.joints.map((j) => j.id),
      defaultPose: [0, 0, 0],
      actionScale: 1,
      controlDt: 0.04,
      physicsDt: 0.002,
      command: [0, 0, 0],
      boundaries,
    },
    actionTime: Float64Array.from({ length: boundaries }, (_, i) => i * 0.002),
    actionOwner: Uint8Array.from({ length: boundaries }, (_, i) => Number(i >= 50 && i < 100)),
    actionCtrl: new Float64Array(boundaries * 3).fill(0.2),
    actionQpos: new Float64Array(boundaries * 3),
    actionQvel: new Float64Array(boundaries * 3),
    actionPrevious: new Float32Array(boundaries * 3).fill(0.1),
  };
  const stored: StoredTry = {
    version: 1,
    id: 'correction',
    sceneId: 'scene',
    robot: { name: 'Arm', modelHash: sha256Hex(model.xml), joints: model.joints.map((j) => j.id) },
    case: { id: 'pick', name: 'Pick', hash: 'case' },
    source: 'case',
    input: null,
    startedAt: '2026-11-20',
    seconds: 0.4,
    rate: 50,
    frames,
    outcome: { verdict: 'failed', margin: -1 },
    seed: 1,
    sourceTry: null,
    faults: [],
    split: 'validation',
  };
  const branch = { ...stored, id: 'branch', sourceTry: stored.id };
  const content = new Map<string, Uint8Array>();
  const ports = {
    manifests: async (ids: string[]) => [stored, branch].filter((s) => ids.includes(s.id)),
    bytes: async () => encodeRecording(recording),
    save: async (bytes: Uint8Array) => {
      const key = sha256Hex(bytes);

      content.set(key, bytes.slice());

      return key;
    },
  };
  const dataset = newDataset({
    id: 'teaching',
    name: 'Pick',
    task: 'Pick',
    members: [stored.id, branch.id],
    at: 'now',
    samples: [
      { tryId: stored.id, target: 'correction', from: 5, to: 10 },
      { tryId: branch.id, target: 'correction', from: 6, to: 9 },
    ],
  });

  return { model, recording, stored, dataset, ports, content };
}

it('freezes selected corrections from a failed try without relabeling the try or losing its context and ancestry', async () => {
  const f = await fixture();
  const snapshot = await resolveSnapshot(f);
  const revision = await snapshotHash(snapshot);
  const version = freezeVersion(f.dataset, revision, 'now', snapshot);
  const reopened = readDataset(JSON.parse(JSON.stringify(version.dataset)))!;
  const restored = await restoreSamples(reopened.versions[0].snapshot!, async (hash) => f.content.get(hash) ?? null);

  expect(restored).toHaveLength(2);
  expect(restored[0].recording.frames).toBe(f.recording.frames);
  expect(restored[0].recording.actionPrevious).toEqual(f.recording.actionPrevious);
  expect(restored[0].sample).toMatchObject({
    target: 'correction',
    from: 5,
    to: 10,
    excluded: [],
    split: 'validation',
  });
  expect(snapshot.samples[0].source).toBe(snapshot.samples[1].source);
  expect(snapshot.samples[1].split).toBe('validation');
  expect(snapshot.samples[0].stored.outcome.verdict).toBe('failed');
  expect(f.stored.outcome.verdict).toBe('failed');

  const changed = await resolveSnapshot({
    ...f,
    dataset: { ...f.dataset, samples: [{ tryId: 'correction', target: 'correction', from: 6, to: 10 }] },
  });

  expect(await snapshotHash(changed)).not.toBe(revision);
});

it('refuses empty correction windows and keeps ordinary failed or autonomous samples excluded', async () => {
  const f = await fixture();

  await expect(
    resolveSnapshot({
      ...f,
      dataset: { ...f.dataset, samples: [{ tryId: 'correction', target: 'correction', from: 0, to: 3 }] },
    }),
  ).rejects.toThrow('operator');

  const snapshot = await resolveSnapshot({ ...f, dataset: { ...f.dataset, samples: [{ tryId: 'correction' }] } });

  expect(snapshot.samples[0].excluded).toContain('verdict:failed');
  expect(snapshot.samples[0].excluded).toContain('correction:select');
  expect(isDatasetSample({ tryId: 'correction', target: 'correction' })).toBe(false);
  expect(isDatasetSample({ tryId: 'correction', target: 'policy', from: 0, to: 3 })).toBe(false);
});

it('retains explicit correction selections beside an ordinary whole-try selection', async () => {
  const f = await fixture();
  const samples = mergedDatasetSamples(
    { ...f.dataset, samples: [{ tryId: 'correction' }] },
    ['correction'],
    [{ tryId: 'correction', target: 'correction', from: 5, to: 10 }],
  );

  expect(samples).toHaveLength(2);
  expect(samples[1]).toMatchObject({ target: 'correction', from: 5, to: 10 });
});

it('selects closely spaced handoffs without repeating operator targets in overlapping frame ranges', async () => {
  const { recording, model } = await fixture();

  recording.actionOwner = Uint8Array.from({ length: recording.teaching!.boundaries }, (_, i) =>
    Number((i >= 51 && i < 64) || (i >= 67 && i < 84)),
  );

  const windows = correctionFrames(recording);
  const actions = windows.flatMap((window) => correctionEpisode(recording, model, window).actions);
  const complete = correctionEpisode(recording, model, { from: 0, to: recording.frames });

  expect(windows).toEqual([{ from: 5, to: 9 }]);
  expect(complete.actions).toHaveLength(2);
  expect(actions).toEqual(complete.actions);
});

it('keeps a single-frame correction with recorded operator boundaries available for fitting', async () => {
  const f = await fixture();
  const dataset = { ...f.dataset, samples: [{ tryId: 'correction', target: 'correction' as const, from: 5, to: 6 }] };
  const snapshot = await resolveSnapshot({ ...f, dataset });
  const episode = correctionEpisode(f.recording, f.model, snapshot.samples[0]);

  expect(snapshot.samples[0].excluded).toEqual([]);
  expect(episode.actions).toHaveLength(1);
  expect(snapshot.samples[0].stored.outcome.verdict).toBe('failed');
});
