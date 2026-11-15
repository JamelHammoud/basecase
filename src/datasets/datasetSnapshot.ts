import { loadManifests, loadRecordingBytes } from '../cases/tryStore';
import type { StoredTry, TrySplit } from '../cases/tryFile';
import { sha256 } from '../cases/tries';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { Dataset } from './datasetFile';
import { loadDatasetContent, saveDatasetContent } from './datasetStore/content';
import { freezeImages } from './snapshotImages';
import { sampleSegments } from './snapshotRecording';
import { snapshotWorker } from './snapshotWorker';
import { assignSources, sourceRun, type SourceAssignment } from './snapshotSplits';
import type { DatasetSample, DatasetSnapshot, FrozenTrySample } from './snapshotTypes';

export interface SnapshotPorts {
  manifests: typeof loadManifests;
  bytes: typeof loadRecordingBytes;
  save: typeof saveDatasetContent;
}

interface ResolveInput {
  dataset: Dataset;
  model?: SimModel;
  ports?: SnapshotPorts;
  context?: string;
}

const defaultPorts: SnapshotPorts = { manifests: loadManifests, bytes: loadRecordingBytes, save: saveDatasetContent };

export const snapshotHash = (snapshot: DatasetSnapshot) => snapshotWorker.call('hash', snapshot);

async function manifestsFor(ids: string[], load: SnapshotPorts['manifests']) {
  const stored = new Map<string, StoredTry>();
  const requested = new Set<string>();
  let pending = [...new Set(ids)];

  for (let depth = 0; pending.length && depth < 100; depth++) {
    const found: StoredTry[] = [];

    for (let i = 0; i < pending.length; i += 500) {
      found.push(...(await load(pending.slice(i, i + 500))));
    }

    pending.forEach((id) => requested.add(id));
    found.forEach((manifest) => stored.set(manifest.id, structuredClone(manifest)));
    pending = [
      ...new Set(
        found.flatMap((manifest) =>
          manifest.sourceTry && !requested.has(manifest.sourceTry) ? [manifest.sourceTry] : [],
        ),
      ),
    ];
  }

  if (pending.length) throw new Error('The dataset source chain is too long.');

  return stored;
}

function sourceOf(stored: StoredTry, manifests: Map<string, StoredTry>) {
  const seen = new Set<string>();
  let at = stored;
  let explicit: TrySplit | undefined = stored.split;

  while (at.sourceTry) {
    if (seen.has(at.id)) throw new Error('The dataset source chain has a cycle.');

    seen.add(at.id);

    const parent = manifests.get(at.sourceTry);

    if (!parent) throw new Error('The dataset is missing a source try.');

    if (explicit && parent.split && parent.split !== explicit)
      throw new Error('The same source has conflicting dataset splits.');

    explicit ??= parent.split;
    at = parent;
  }

  const source =
    at.input === 'script' && (at.source === 'case' || at.source === 'generated')
      ? sourceRun(at.sceneId, at.case?.id ?? null, at.seed)
      : `try:${at.id}`;

  return { source, explicit };
}

export function sampleExclusions(stored: StoredTry, modelHash: string): string[] {
  return [
    ...(stored.outcome.verdict === 'failed' ? ['verdict:failed'] : []),
    ...(stored.robot.modelHash !== modelHash ? ['model:mismatch'] : []),
    ...(stored.labels?.flags ?? []).map((flag) => `quality:${flag.kind}`),
  ];
}

const selectionsOf = (dataset: Dataset): DatasetSample[] =>
  dataset.samples ?? dataset.members.map((tryId) => ({ tryId }));

async function freezeRecording(stored: StoredTry, model: SimModel | undefined, ports: SnapshotPorts) {
  if (!model) throw new Error('The dataset needs a robot model.');

  const bytes = await ports.bytes(stored.id);

  if (!bytes) throw new Error('The dataset is missing recording content.');

  const recording = await snapshotWorker.call('inspect', { bytes, model });

  if (recording.frames !== stored.frames) throw new Error('The dataset recording frame count changed.');

  return { hash: await ports.save(bytes), ...recording };
}

async function resolveTries(input: ResolveInput, ports: SnapshotPorts, modelHash: string) {
  const selections = selectionsOf(input.dataset);
  const manifests = await manifestsFor(
    selections.map((sample) => sample.tryId),
    ports.manifests,
  );
  const loaded = new Map<string, { hash: string; frames: number; exportable: boolean }>();
  const samples: FrozenTrySample[] = [];
  const assignments: SourceAssignment[] = [];

  for (const selected of selections) {
    const stored = manifests.get(selected.tryId);

    if (!stored) throw new Error('The dataset is missing a selected try.');

    const content = loaded.get(stored.id) ?? (await freezeRecording(stored, input.model, ports));
    const from = selected.from ?? 0;
    const to = selected.to ?? content.frames;

    loaded.set(stored.id, content);

    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || from >= to || to > content.frames)
      throw new Error('The selected dataset frames are missing.');

    const { source, explicit } = sourceOf(stored, manifests);
    const exportable = content.exportable && to - from > 1;

    assignments.push({ source, content: content.hash, explicit });
    samples.push({
      tryId: stored.id,
      from,
      to,
      recording: content.hash,
      source,
      split: 'train',
      stored: structuredClone(stored),
      excluded: [...sampleExclusions(stored, modelHash), ...(!exportable ? ['recording:incompatible'] : [])],
    });
  }

  return { samples, assignments };
}

export async function resolveSnapshot(input: ResolveInput): Promise<DatasetSnapshot> {
  const ports = input.ports ?? defaultPorts;
  const modelHash = input.model ? await sha256(input.model.xml) : '';
  const { samples, assignments } = await resolveTries(input, ports, modelHash);
  const images = await freezeImages(input.dataset.imageMembers ?? [], undefined, ports.save);
  const splits = assignSources(
    [
      ...assignments,
      ...images.map((image) => ({ source: image.source, content: image.hash, explicit: image.explicit })),
    ],
    input.dataset.seed,
  );

  return {
    task: input.dataset.task,
    modelHash,
    samples: samples.map((sample, i) => ({ ...sample, split: splits[i] })),
    images: images.map((image, i) => ({ ...image, split: splits[samples.length + i] })),
    ...(input.context ? { context: input.context } : {}),
    dataset: {
      id: input.dataset.id,
      name: input.dataset.name,
      createdAt: input.dataset.createdAt,
      caseId: input.dataset.caseId,
      sceneId: input.dataset.sceneId,
      seed: input.dataset.seed,
    },
  };
}

interface RestoredSample {
  sample: FrozenTrySample;
  recording: Recording;
  segments: ReturnType<typeof sampleSegments>;
}

function recordingGroups(samples: FrozenTrySample[]) {
  const groups = new Map<string, Array<{ sample: FrozenTrySample; index: number }>>();

  samples.forEach((sample, index) => {
    if (sample.excluded.length) return;

    const group = groups.get(sample.recording) ?? [];

    group.push({ sample, index });
    groups.set(sample.recording, group);
  });

  return groups;
}

export async function restoreSamples(snapshot: DatasetSnapshot, load = loadDatasetContent): Promise<RestoredSample[]> {
  const restored: RestoredSample[] = [];

  for (const [hash, group] of recordingGroups(snapshot.samples)) {
    const bytes = await load(hash);

    if (!bytes) throw new Error('The dataset is missing frozen recording content.');

    const recordings = await snapshotWorker.call('restoreGroup', { bytes, samples: group.map(({ sample }) => sample) });

    group.forEach(({ sample, index }, i) => {
      restored[index] = { sample, recording: recordings[i], segments: sampleSegments(sample) };
    });
  }

  return restored.filter(Boolean);
}
