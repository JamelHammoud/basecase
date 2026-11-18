import type { Recording } from '../../sim/recorder';
import { originLabel, type StoredTry } from '../../cases/tryFile';
import { importedTryId, type BuiltTries, type ImportTarget } from './importedTries';
import type { SourceData, SourceEpisode } from './types';

function topicRecording(episode: SourceEpisode): Recording {
  return {
    frames: episode.t.length,
    dt: 0.02,
    nq: 0,
    nv: 0,
    nu: 0,
    nbody: 0,
    t: Float32Array.from(episode.t),
    ctrl: new Float32Array(),
    qpos: new Float64Array(),
    qvel: new Float32Array(),
    poses: new Float32Array(),
    topics: episode.topics ?? undefined,
  };
}

export async function topicOnlyTries(data: SourceData, target: ImportTarget): Promise<BuiltTries> {
  const kept = await Promise.all(
    data.episodes.map(async (episode) => {
      const recording = topicRecording(episode);
      const stored: StoredTry = {
        version: 1,
        id: await importedTryId(target, data, episode),
        sceneId: target.sceneId,
        robot: { name: originLabel(target.origin) ?? '', modelHash: '', joints: [] },
        case: null,
        source: 'import',
        input: null,
        startedAt: target.startedAt,
        seconds: episode.t.at(-1) ?? 0,
        rate: 50,
        frames: recording.frames,
        outcome: { verdict: 'unjudged', margin: null },
        seed: 0,
        sourceTry: null,
        faults: [],
        origin: target.origin,
        task: episode.task,
        videos: episode.videos.map(({ camera, path, from, to }) => ({ camera, path, from, to })),
      };

      return { stored, recording };
    }),
  );

  return { kept, refused: 0 };
}
