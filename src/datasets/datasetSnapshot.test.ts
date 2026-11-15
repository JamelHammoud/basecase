import { describe, expect, it, vi } from 'vitest';
import { encodeRecording } from '../cases/recordingFile';
import type { StoredTry } from '../cases/tryFile';
import { emptyLabels } from '../cases/tryLabels';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import { sha256 } from '../cases/tries';
import { datasetContentHash } from './contentHash';
import { freezeVersion, newDataset, readDataset } from './datasetFile';
import { resolveSnapshot, snapshotHash, restoreSamples } from './datasetSnapshot';
import { assignSources } from './snapshotSplits';
import { sampleRecording } from './snapshotRecording';
import { readSnapshot } from './snapshotTypes';
import { decodeJson, encodeJson } from './snapshotWorker';
import { snapshotJobs } from './snapshotJobs';

const model = { xml: '<robot/>', joints: [{ actuator: 0 }], bodies: [{}] } as unknown as SimModel;
const recording: Recording = {
  dt: 0.02,
  frames: 12,
  nq: 1,
  nv: 1,
  nu: 1,
  nbody: 1,
  t: Float32Array.from({ length: 12 }, (_, i) => i * 0.02),
  ctrl: Float32Array.from({ length: 12 }, (_, i) => i),
  qpos: Float64Array.from({ length: 12 }, (_, i) => i),
  qvel: new Float32Array(12),
  poses: new Float32Array(84),
  jointQpos: new Int32Array([0]),
};

async function fixture() {
  const stored: StoredTry = {
    version: 1,
    id: 'try-a',
    sceneId: 'scene',
    robot: { name: 'Arm', modelHash: await sha256(model.xml), joints: ['j'] },
    case: { id: 'pick', name: 'Pick a block', hash: 'case' },
    source: 'case',
    input: null,
    startedAt: '2026-11-14',
    seconds: 0.24,
    rate: 50,
    frames: 12,
    outcome: { verdict: 'passed', margin: 1 },
    seed: 1,
    sourceTry: null,
    faults: [],
    labels: {
      ...emptyLabels(),
      instruction: 'Pick the red block',
      segments: [
        { from: 0, to: 4, label: 'reach' },
        { from: 4, to: 8, label: 'grasp', instruction: 'Close the gripper' },
        { from: 8, to: 12, label: 'release' },
      ],
    },
  };
  const content = new Map<string, Uint8Array>();
  const dataset = newDataset({ id: 'dataset', name: 'Grasps', task: 'Pick', members: [stored.id], at: 'now' });
  const ports = {
    manifests: async () => [structuredClone(stored)],
    bytes: async () => encodeRecording(recording),
    save: async (bytes: Uint8Array) => {
      const hash = await datasetContentHash(bytes);

      content.set(hash, bytes.slice());

      return hash;
    },
  };

  return { stored, dataset, content, ports };
}

describe('frozen dataset samples', () => {
  it('versions instructions, boundaries and flags while preserving the original labels and recording bytes', async () => {
    const { dataset, stored, ports, content } = await fixture();
    const one = await resolveSnapshot({ dataset, model, ports });
    const firstHash = await snapshotHash(one);
    const frozen = freezeVersion(dataset, firstHash, 'first', one);

    stored.labels!.instruction = 'Pick the blue block';
    expect(await snapshotHash(await resolveSnapshot({ dataset, model, ports }))).not.toBe(firstHash);
    stored.labels!.instruction = 'Pick the red block';
    stored.labels!.segments[0].to = 3;
    stored.labels!.segments[1].from = 3;
    expect(await snapshotHash(await resolveSnapshot({ dataset, model, ports }))).not.toBe(firstHash);
    stored.labels!.flags = [{ kind: 'effort', at: 0 }];

    const flagged = await resolveSnapshot({ dataset, model, ports });

    expect(flagged.samples[0].excluded).toContain('quality:effort');
    expect(await restoreSamples(flagged, async (hash) => content.get(hash) ?? null)).toEqual([]);

    const restored = await restoreSamples(one, async (hash) => content.get(hash) ?? null);

    expect(restored[0].sample.stored.labels?.instruction).toBe('Pick the red block');
    expect(encodeRecording(restored[0].recording)).toEqual(encodeRecording(recording));
    expect(readDataset(JSON.parse(JSON.stringify(frozen.dataset)))).toEqual(frozen.dataset);
  });

  it('keeps only the exact grasp frames and shifts its annotations with that range', async () => {
    const { dataset, ports, content } = await fixture();
    const snapshot = await resolveSnapshot({
      dataset: { ...dataset, samples: [{ tryId: 'try-a', from: 4, to: 8 }] },
      model,
      ports,
    });
    const [restored] = await restoreSamples(snapshot, async (hash) => content.get(hash) ?? null);

    expect([...restored.recording.ctrl]).toEqual([4, 5, 6, 7]);
    expect(restored.segments).toEqual([{ from: 0, to: 4, text: 'Close the gripper' }]);
    expect([...restored.recording.t]).toEqual([0, expect.closeTo(0.02), expect.closeTo(0.04), expect.closeTo(0.06)]);
  });

  it('reports missing sources and immutable content instead of omitting them', async () => {
    const { dataset, ports } = await fixture();

    await expect(resolveSnapshot({ dataset, model, ports: { ...ports, bytes: async () => null } })).rejects.toThrow(
      /missing/i,
    );
    await expect(resolveSnapshot({ dataset, model, ports: { ...ports, manifests: async () => [] } })).rejects.toThrow(
      /missing/i,
    );

    const snapshot = await resolveSnapshot({ dataset, model, ports });

    await expect(restoreSamples(snapshot, async () => null)).rejects.toThrow(/missing/i);
    await expect(restoreSamples(snapshot, async () => new Uint8Array([1]))).rejects.toThrow(/changed/i);
  });

  it('refuses negative, fractional and out-of-range boundaries or changed frame counts', async () => {
    const { dataset, ports, stored } = await fixture();

    for (const [from, to] of [
      [-1, 4],
      [0.5, 4],
      [0, 13],
      [4, 4],
    ]) {
      const selected = { ...dataset, samples: [{ tryId: stored.id, from, to }] };

      await expect(resolveSnapshot({ dataset: selected, model, ports })).rejects.toThrow(/frames/i);
      expect(() => sampleRecording(recording, { from, to })).toThrow(/frames/i);
    }

    stored.frames = 11;
    await expect(resolveSnapshot({ dataset, model, ports })).rejects.toThrow(/frame count/i);
  });

  it('crops fault intervals with the selected recording', () => {
    const cropped = sampleRecording(
      {
        ...recording,
        faults: [
          { joint: 'old', kind: 'limp', at: 0, until: 0.01 },
          { joint: 'active', kind: 'weak', at: 0.04, until: 0.1 },
          { joint: 'later', kind: 'stuck', at: 0.1, until: 0.2 },
          { joint: 'after', kind: 'limp', at: 0.2 },
        ],
      },
      { from: 4, to: 8 },
    );

    expect(cropped.faults).toEqual([
      { joint: 'active', kind: 'weak', at: 0, until: expect.closeTo(0.02) },
      { joint: 'later', kind: 'stuck', at: expect.closeTo(0.02), until: expect.closeTo(0.08) },
    ]);
  });

  it('retains a single-frame sample with the same exclusion used by export and training', async () => {
    const { dataset, ports, content } = await fixture();
    const snapshot = await resolveSnapshot({
      dataset: {
        ...dataset,
        samples: [{ tryId: 'try-a', from: 4, to: 5 }],
      },
      model,
      ports,
    });

    expect(snapshot.samples[0].excluded).toEqual(['recording:incompatible']);
    expect(await restoreSamples(snapshot, async (hash) => content.get(hash) ?? null)).toEqual([]);
  });
});

describe('grouped snapshot restoration', () => {
  it('loads each source once, preserves interleaved range order and omits excluded samples', async () => {
    const { dataset, stored, ports, content } = await fixture();
    const other: StoredTry = { ...stored, id: 'try-b' };
    const snapshot = await resolveSnapshot({
      dataset: {
        ...dataset,
        members: [stored.id, other.id],
        samples: [
          { tryId: stored.id, from: 4, to: 8 },
          { tryId: stored.id, from: 0, to: 2 },
          { tryId: other.id, from: 0, to: 4 },
          { tryId: stored.id, from: 8, to: 12 },
        ],
      },
      model,
      ports: {
        ...ports,
        manifests: async () => [stored, other],
        bytes: async (id) =>
          encodeRecording({ ...recording, ctrl: recording.ctrl.map((v) => (id === other.id ? v + 100 : v)) }),
      },
    });

    snapshot.samples[1].excluded = ['quality:effort'];

    const load = vi.fn(async (hash: string) => content.get(hash) ?? null);
    const restored = await restoreSamples(snapshot, load);

    expect(load).toHaveBeenCalledTimes(2);
    expect(restored.map(({ recording: restoredRecording }) => [...restoredRecording.ctrl])).toEqual([
      [4, 5, 6, 7],
      [100, 101, 102, 103],
      [8, 9, 10, 11],
    ]);
    expect(restored.map(({ sample }) => sample)).toEqual([
      snapshot.samples[0],
      snapshot.samples[2],
      snapshot.samples[3],
    ]);

    const sample = snapshot.samples[0];
    const packed = await snapshotJobs.restoreGroup({
      bytes: content.get(sample.recording)!,
      samples: [{ ...sample, from: 0, to: 12 }, sample],
    });

    expect(packed.result[0].jointQpos?.buffer).toBe(packed.result[1].jointQpos?.buffer);
    expect(new Set(packed.transfer).size).toBe(packed.transfer?.length);
  });
});

describe('snapshot metadata', () => {
  it('allows image-only snapshots without inventing a robot model', async () => {
    const { dataset, ports } = await fixture();
    const snapshot = await resolveSnapshot({ dataset: { ...dataset, members: [] }, ports });

    expect(snapshot.modelHash).toBe('');
    expect(readSnapshot(snapshot)).toEqual(snapshot);
    expect(readSnapshot({ ...snapshot, modelHash: 'wrong' })).toBeNull();
    await expect(resolveSnapshot({ dataset, ports })).rejects.toThrow(/robot model/i);
  });

  it('encodes context JSON canonically and restores it without caller-thread parsing', async () => {
    const value = { z: [1, 2], a: { model: 'robot' } };
    const bytes = await encodeJson(value);

    expect(new TextDecoder().decode(bytes)).toBe('{"a":{"model":"robot"},"z":[1,2]}');
    expect(await decodeJson(bytes)).toEqual(value);
    await expect(decodeJson(new Uint8Array([0]))).rejects.toThrow();
  });

  it('pins dataset metadata and refuses damaged frozen metadata', async () => {
    const { dataset, ports } = await fixture();
    const snapshot = await resolveSnapshot({ dataset, model, ports });

    dataset.name = 'New name';
    expect(snapshot.dataset?.name).toBe('Grasps');
    expect(readSnapshot(snapshot)).toEqual(snapshot);
    expect(readSnapshot({ ...snapshot, dataset: { ...snapshot.dataset, seed: -1 } })).toBeNull();
    expect(readSnapshot({ ...snapshot, dataset: { ...snapshot.dataset, sceneId: '../scene' } })).toBeNull();
    expect(readSnapshot({ ...snapshot, dataset: undefined })).not.toBeNull();
  });

  it('hashes desktop JSON and web structured clones identically without fabricating legacy snapshots', async () => {
    const { dataset, ports } = await fixture();
    const snapshot = await resolveSnapshot({ dataset, model, ports });

    expect(await snapshotHash(JSON.parse(JSON.stringify(snapshot)))).toBe(
      await snapshotHash(structuredClone(snapshot)),
    );

    const legacy = freezeVersion(dataset, 'old-hash', 'old');

    expect(readDataset(legacy.dataset)?.versions[0].snapshot).toBeUndefined();
  });
});

describe('source split assignments', () => {
  it('keeps independent manual recordings distinct despite their common zero seed', async () => {
    const { dataset, stored, ports } = await fixture();
    const manifests: StoredTry[] = Array.from({ length: 5 }, (_, i) => ({
      ...stored,
      id: `manual-${i}`,
      seed: 0,
      input: 'keys',
    }));
    const snapshot = await resolveSnapshot({
      dataset: { ...dataset, members: manifests.map((item) => item.id) },
      model,
      ports: {
        ...ports,
        manifests: async () => manifests,
        bytes: async (id) => encodeRecording({ ...recording, ctrl: recording.ctrl.map((v) => v + Number(id.at(-1))) }),
      },
    });

    expect(new Set(snapshot.samples.map((sample) => sample.source)).size).toBe(5);
    expect(snapshot.samples.map((sample) => sample.split)).toContain('train');
    expect(snapshot.samples.map((sample) => sample.split)).toContain('validation');
  });

  it('reports a missing source ancestor instead of losing its inherited split', async () => {
    const { dataset, stored, ports } = await fixture();

    stored.sourceTry = 'missing';
    stored.source = 'generated';

    await expect(
      resolveSnapshot({
        dataset,
        model,
        ports: {
          ...ports,
          manifests: async (ids) => (ids.includes(stored.id) ? [stored] : []),
        },
      }),
    ).rejects.toThrow(/missing.*source/i);
  });

  it('follows generated ancestry and retains an imported source split', async () => {
    const { dataset, stored, ports } = await fixture();
    const ancestor: StoredTry = { ...stored, id: 'ancestor', source: 'import', case: null, split: 'test' };

    stored.sourceTry = ancestor.id;
    stored.source = 'generated';

    const manifests = new Map([stored, ancestor].map((manifest) => [manifest.id, manifest]));
    const snapshot = await resolveSnapshot({
      dataset,
      model,
      ports: {
        ...ports,
        manifests: async (ids) => ids.flatMap((id) => (manifests.get(id) ? [manifests.get(id)!] : [])),
      },
    });

    expect(snapshot.samples[0].source).toBe('try:ancestor');
    expect(snapshot.samples[0].split).toBe('test');
    ancestor.sourceTry = stored.id;
    await expect(
      resolveSnapshot({
        dataset,
        model,
        ports: {
          ...ports,
          manifests: async (ids) => ids.flatMap((id) => (manifests.get(id) ? [manifests.get(id)!] : [])),
        },
      }),
    ).rejects.toThrow(/cycle/i);
  });

  it('keeps distinct imported episodes separate while preserving their provided splits', async () => {
    const { dataset, stored, ports } = await fixture();

    stored.source = 'import';
    stored.case = null;
    stored.seed = 0;
    stored.split = 'train';

    const other: StoredTry = { ...stored, id: 'try-b', split: 'validation' };
    const snapshot = await resolveSnapshot({
      dataset: { ...dataset, members: [stored.id, other.id] },
      model,
      ports: {
        ...ports,
        manifests: async () => [stored, other],
        bytes: async (id) =>
          encodeRecording({ ...recording, ctrl: recording.ctrl.map((v) => (id === other.id ? v + 1 : v)) }),
      },
    });

    expect(snapshot.samples.map((sample) => sample.source)).toEqual(['try:try-a', 'try:try-b']);
    expect(snapshot.samples.map((sample) => sample.split)).toEqual(['train', 'validation']);
    await expect(
      resolveSnapshot({
        dataset: { ...dataset, members: [stored.id, other.id] },
        model,
        ports: {
          ...ports,
          manifests: async () => [stored, other],
        },
      }),
    ).rejects.toThrow(/conflict/i);
  });
});

describe('shared source assignment', () => {
  it('keeps cameras, segments, multiplied tries and repeated identical imports in the source split', () => {
    const inputs = [
      { source: 'run-a', content: 'a' },
      { source: 'run-a', content: 'camera-b' },
      { source: 'run-a', content: 'variation' },
      { source: 'import-b', content: 'a' },
      ...Array.from({ length: 5 }, (_, i) => ({ source: `run-${i}`, content: `${i}` })),
    ];
    const splits = assignSources(inputs, 42);

    expect(new Set(splits.slice(0, 4)).size).toBe(1);
    expect(splits).toContain('validation');
    expect(assignSources([...inputs].reverse(), 42).reverse()).toEqual(splits);
  });

  it('preserves explicit assignments and reports conflicts for the same source or bytes', () => {
    expect(assignSources([{ source: 'one', content: 'a', explicit: 'test' }], 0)).toEqual(['test']);
    expect(() =>
      assignSources(
        [
          { source: 'one', content: 'a', explicit: 'train' },
          { source: 'two', content: 'a', explicit: 'validation' },
        ],
        0,
      ),
    ).toThrow(/conflict/i);
  });
});
