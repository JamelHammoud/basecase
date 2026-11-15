import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeRecording } from '../cases/recordingFile';
import { summaryOf, type StoredTry } from '../cases/tryFile';
import { emptyLabels } from '../cases/tryLabels';
import { sha256 } from '../cases/tries';
import { datasetContentHash } from '../datasets/contentHash';
import { freezeVersion, newDataset, type Dataset } from '../datasets/datasetFile';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { DatasetScene } from './datasetJob';
import { selectedDataset } from './datasetVersionView';
import type { DatasetRecords } from './useDatasetRecords';

const state = vi.hoisted(() => ({
  datasets: new Map<string, Dataset>(),
  manifests: new Map<string, StoredTry>(),
  recordings: new Map<string, Uint8Array>(),
  content: new Map<string, Uint8Array>(),
  manifestReads: vi.fn(),
  saves: vi.fn(),
}));

vi.mock('../cases/tryStore', () => ({
  useTries: () => [...state.manifests.values()].map((stored) => summaryOf(stored, { recording: true, strip: false })),
  loadManifests: async (ids: string[]) => {
    state.manifestReads(ids);

    return ids.flatMap((id) => (state.manifests.has(id) ? [structuredClone(state.manifests.get(id)!)] : []));
  },
  loadRecordingBytes: async (id: string) => state.recordings.get(id)?.slice() ?? null,
}));
vi.mock('../datasets/datasetStore', () => ({
  loadDatasets: async () => structuredClone([...state.datasets.values()]),
  saveDataset: async (dataset: Dataset) => {
    state.saves(dataset);
    state.datasets.set(dataset.id, structuredClone(dataset));
  },
}));
vi.mock('../datasets/datasetStore/content', () => ({
  saveDatasetContent: async (bytes: Uint8Array) => {
    const hash = await datasetContentHash(bytes);

    state.content.set(hash, bytes.slice());

    return hash;
  },
  loadDatasetContent: async (hash: string) => state.content.get(hash)?.slice() ?? null,
}));

const { useDatasetRecords } = await import('./useDatasetRecords');
const model = { xml: '<robot/>', joints: [{ actuator: 0 }], bodies: [{}] } as unknown as SimModel;
const context: DatasetScene = { model, robotName: 'Arm', parts: [], world: [], guests: [] };
const recording: Recording = {
  dt: 0.02,
  frames: 8,
  nq: 1,
  nv: 1,
  nu: 1,
  nbody: 1,
  t: Float32Array.from({ length: 8 }, (_, i) => i * 0.02),
  ctrl: Float32Array.from({ length: 8 }, (_, i) => i),
  qpos: Float64Array.from({ length: 8 }, (_, i) => i),
  qvel: new Float32Array(8),
  poses: new Float32Array(56),
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
    seconds: 0.16,
    rate: 50,
    frames: 8,
    outcome: { verdict: 'passed', margin: 1 },
    seed: 1,
    sourceTry: null,
    faults: [],
    labels: {
      ...emptyLabels(),
      instruction: 'Pick the red block',
      segments: [
        { from: 0, to: 4, label: 'reach' },
        { from: 4, to: 8, label: 'grasp' },
      ],
    },
  };
  const dataset = newDataset({ id: 'grasps', name: 'Grasps', task: 'Pick', members: [stored.id], at: 'now' });

  state.manifests.set(stored.id, stored);
  state.recordings.set(stored.id, encodeRecording(recording));
  state.datasets.set(dataset.id, structuredClone(dataset));

  return { dataset, stored };
}

function records(): DatasetRecords {
  const result: { current?: DatasetRecords } = {};

  function Harness() {
    result.current = useDatasetRecords([]);

    return null;
  }

  renderToString(createElement(Harness));

  return result.current!;
}

const persisted = (id: string) => structuredClone(state.datasets.get(id)!);

beforeEach(() => {
  state.datasets.clear();
  state.manifests.clear();
  state.recordings.clear();
  state.content.clear();
  vi.clearAllMocks();
});

describe('dataset records lifecycle', () => {
  it('counts selected ranges consistently before and after freezing', async () => {
    const { dataset, stored } = await fixture();

    dataset.samples = [
      { tryId: stored.id, from: 0, to: 3 },
      { tryId: stored.id, from: 3, to: 6 },
    ];

    const api = records();
    const working = api.of(dataset);
    const frozen = await api.resolve(dataset, model, context);
    const selected = selectedDataset(persisted(dataset.id), frozen.n)!;

    expect(working.map((record) => record.id)).toEqual(['try-a', 'try-a']);
    expect(working.filter((record) => record.passed)).toHaveLength(2);
    expect(api.of(selected).map((record) => record.id)).toEqual(working.map((record) => record.id));
    expect(api.of({ ...dataset, samples: undefined })).toHaveLength(1);
  });

  it('resolves and freezes exact labels, versioning instruction and boundary edits from a stale dataset', async () => {
    const { dataset, stored } = await fixture();
    const api = records();
    const first = await api.resolve(dataset, model, context);
    const repeated = await api.resolve(dataset, model, context);

    expect(repeated.n).toBe(first.n);
    expect(repeated.hash).toBe(first.hash);
    stored.labels!.instruction = 'Pick the blue block';

    const instructed = await api.resolve(dataset, model, context);

    stored.labels!.segments[0].to = 3;
    stored.labels!.segments[1].from = 3;

    const bounded = await api.resolve(dataset, model, context);
    const saved = persisted(dataset.id);

    expect(new Set([first.hash, instructed.hash, bounded.hash]).size).toBe(3);
    expect(saved.versions.map((version) => version.n)).toEqual([1, 2, 3]);
    expect(saved.versions[0].snapshot?.samples[0].stored.labels?.instruction).toBe('Pick the red block');
    expect(saved.versions[0].snapshot?.samples[0].stored.labels?.segments[0].to).toBe(4);
    expect(saved.versions[2].snapshot?.samples[0].stored.labels?.segments[0].to).toBe(3);
    expect(await api.scene(first)).toEqual(context);
    expect(dataset.versions).toEqual([]);
  });

  it('persists an older version archive without mutating the caller or dropping newer history', async () => {
    const { dataset, stored } = await fixture();
    const api = records();
    const first = await api.resolve(dataset, model, context);

    stored.labels!.instruction = 'Pick the blue block';

    const second = await api.resolve(dataset, model, context);
    const archive = new Uint8Array([80, 75, 3, 4]);
    const hash = await datasetContentHash(archive);

    Object.freeze(first);
    await api.archive(dataset, first, archive);

    const saved = persisted(dataset.id);

    expect(saved.versions.map((version) => version.hash)).toEqual([first.hash, second.hash]);
    expect(saved.versions[0].archive).toBe(hash);
    expect(saved.versions[1].archive).toBeUndefined();
    expect(state.content.get(hash)).toEqual(archive);
    expect(first.archive).toBeUndefined();
    expect(await api.archive(dataset, first, new Uint8Array([9]))).toEqual(archive);
    expect(persisted(dataset.id).versions[0].archive).toBe(hash);
  });

  it('returns a selected saved version without reading changed live labels or saving view state', async () => {
    const { dataset, stored } = await fixture();
    const api = records();
    const first = await api.resolve(dataset, model, context);
    const selected = selectedDataset(persisted(dataset.id), first.n)!;

    stored.labels!.instruction = 'Changed live labels';
    state.manifests.clear();
    state.recordings.clear();
    state.manifestReads.mockClear();
    state.saves.mockClear();

    expect(await api.resolve(selected)).toEqual(first);
    expect(api.of(selected).map((record) => record.id)).toEqual(['try-a']);
    expect(state.manifestReads).not.toHaveBeenCalled();
    expect(state.saves).not.toHaveBeenCalled();
    expect(persisted(dataset.id).selectedVersion).toBeUndefined();

    const changed = structuredClone(selected);

    changed.versions[0].snapshot!.samples[0].stored.labels!.instruction = 'Changed frozen labels';
    await expect(api.resolve(changed)).rejects.toThrow('saved dataset samples changed');
  });

  it('refuses a selected legacy version without fabricating saved labels or reading live content', async () => {
    const { dataset } = await fixture();
    const legacy = freezeVersion(dataset, 'legacy-hash', 'old').dataset;
    const selected = selectedDataset(legacy, 1)!;
    const api = records();

    await expect(api.resolve(selected, model, context)).rejects.toThrow('no saved samples');
    expect(selected.versions[0].snapshot).toBeUndefined();
    expect(state.manifestReads).not.toHaveBeenCalled();
    expect(state.saves).not.toHaveBeenCalled();
    expect(state.content.size).toBe(0);
  });

  it('reports missing or damaged saved scene content and refuses missing live recording context', async () => {
    const { dataset } = await fixture();
    const api = records();
    const version = await api.resolve(dataset, model, context);

    state.content.delete(version.snapshot!.context!);
    await expect(api.scene(version)).rejects.toThrow('missing its saved scene');
    state.content.set(version.snapshot!.context!, new TextEncoder().encode('{"model":{},"parts":[]}'));
    await expect(api.scene(version)).rejects.toThrow('damaged');
    await expect(api.resolve(dataset)).rejects.toThrow('robot model');
    state.recordings.clear();
    await expect(api.resolve(dataset, model, context)).rejects.toThrow('missing recording');
    expect(persisted(dataset.id).versions).toHaveLength(1);
  });

  it('serializes stale concurrent freezes and archive writes so neither loses a saved version', async () => {
    const { dataset } = await fixture();
    const api = records();
    const first = await api.resolve(dataset, model, context);
    const snapshot = structuredClone(first.snapshot!);

    snapshot.task = 'A newer dataset task';

    const [second] = await Promise.all([
      api.freeze(dataset, snapshot.modelHash, snapshot),
      api.archive(dataset, first, new Uint8Array([1, 2, 3])),
    ]);
    const saved = persisted(dataset.id);

    expect(saved.versions.map((version) => version.n)).toEqual([1, 2]);
    expect(saved.versions.map((version) => version.hash)).toEqual([first.hash, second.hash]);
    expect(saved.versions[0].archive).toBe(await datasetContentHash(new Uint8Array([1, 2, 3])));
    expect(saved.versions[1].snapshot?.task).toBe('A newer dataset task');
  });
});
