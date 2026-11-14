import type { MainModule } from '@mujoco/mujoco';
import { TRY_FILE_VERSION, type StoredTry, type TryOrigin } from '../../cases/tryFile';
import { SimEngine } from '../../sim/engine';
import type { SimModel } from '../../sim/mjcfTypes';
import type { Recording } from '../../sim/recorder';
import { kinematicRecording, type ReplayPlan } from './kinematicRecording';
import type { SourceData, SourceEpisode } from './types';

export interface ImportTarget {
  sceneId: string;
  modelHash: string;
  origin: TryOrigin;
  startedAt: string;
}

export interface ImportedTry {
  stored: StoredTry;
  recording: Recording;
}

export interface BuiltTries {
  kept: ImportedTry[];
  refused: number;
}

const hex = (digest: ArrayBuffer) => [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function importedTryId(
  target: Pick<ImportTarget, 'sceneId' | 'modelHash'>,
  data: Pick<SourceData, 'names'>,
  episode: SourceEpisode,
): Promise<string> {
  const head = new TextEncoder().encode(
    JSON.stringify([target.sceneId, target.modelHash, data.names, episode.task, episode.t.length]),
  );
  const parts = [head, new Uint8Array(episode.t.buffer, episode.t.byteOffset, episode.t.byteLength)];
  const state = new Uint8Array(episode.state.buffer, episode.state.byteOffset, episode.state.byteLength);
  const whole = new Uint8Array(parts[0].length + parts[1].length + state.length);

  whole.set(parts[0]);
  whole.set(parts[1], parts[0].length);
  whole.set(state, parts[0].length + parts[1].length);

  return `import-${hex(await crypto.subtle.digest('SHA-256', whole)).slice(0, 32)}`;
}

interface StoredInput {
  id: string;
  model: SimModel;
  target: ImportTarget;
  episode: SourceEpisode;
}

function storedImport({ id, model, target, episode }: StoredInput, replayed: ReturnType<typeof kinematicRecording>) {
  const { recording, outOfRange } = replayed;
  const stored: StoredTry = {
    version: TRY_FILE_VERSION,
    id,
    sceneId: target.sceneId,
    robot: {
      name: model.robots.map((r) => r.name).join(', '),
      modelHash: target.modelHash,
      joints: model.joints.map((j) => j.id),
    },
    case: null,
    source: 'import',
    input: null,
    startedAt: target.startedAt,
    seconds: recording.frames * recording.dt,
    rate: recording.dt > 0 ? Math.round(1 / recording.dt) : 1,
    frames: recording.frames,
    outcome: { verdict: 'unjudged', margin: null },
    seed: 0,
    sourceTry: null,
    faults: [],
    origin: target.origin,
    task: episode.task,
    videos: episode.videos.map(({ camera, path, from, to }) => ({ camera, path, from, to })),
    ...(outOfRange ? { outOfRange } : {}),
  };

  return stored;
}

export interface BuildInput {
  model: SimModel;
  data: SourceData;
  plan: ReplayPlan;
  target: ImportTarget;
}

export async function importedTries(mj: MainModule, { model, data, plan, target }: BuildInput): Promise<BuiltTries> {
  const engine = new SimEngine(mj, model);
  const kept: ImportedTry[] = [];
  let refused = 0;

  try {
    for (const episode of data.episodes) {
      const replayed = kinematicRecording(engine, episode, plan);

      if (!episode.t.length || replayed.outOfRange === episode.t.length) {
        refused++;

        continue;
      }

      const id = await importedTryId(target, data, episode);

      kept.push({ stored: storedImport({ id, model, target, episode }, replayed), recording: replayed.recording });
    }
  } finally {
    engine.dispose();
  }

  return { kept, refused };
}
