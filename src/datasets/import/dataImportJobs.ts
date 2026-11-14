import { keepSharedVideoBlob } from '../../cameras/recorded/videoStore';
import { loadMujoco } from '../../sim/loadMujoco';
import type { SimModel } from '../../sim/mjcfTypes';
import { importedTries, replayedRecording, type BuiltTries, type ImportTarget, type ReplayJob } from './importedTries';
import type { ReplayPlan } from './kinematicRecording';
import { readSource, type ImportSource } from './readSource';
import { DataImportError, type SourceData, type SourceFormat, type SourceFile, IMPORT_LIMITS } from './types';
import { columnSpans, mergedSpans, type ColumnSpan } from './units';

export interface SourceSummary {
  format: SourceFormat;
  robotType: string | null;
  names: string[];
  spans: ColumnSpan[];
  episodes: number;
  hash: string;
}

export interface BuildJob {
  model: SimModel;
  plan: ReplayPlan;
  target: ImportTarget;
}

export const sourceSpans = (data: SourceData) =>
  mergedSpans(data.episodes.map((e) => columnSpans(e.state, data.names.length)));

export function importHandlers() {
  let read: SourceData | null = null;
  let videos: SourceFile[] = [];

  return {
    read: async (source: ImportSource): Promise<SourceSummary | null> => {
      const found = await readSource(source);

      read = found?.data ?? null;
      videos = found?.videos ?? [];

      if (!found) return null;

      const { format, robotType, names, episodes } = found.data;

      return { format, robotType, names, spans: sourceSpans(found.data), episodes: episodes.length, hash: found.hash };
    },
    build: async (job: BuildJob): Promise<BuiltTries> => {
      if (!read) throw new DataImportError('Import the files again.');

      const data = read;

      read = null;

      const built = await importedTries(await loadMujoco(), {
        model: job.model,
        data,
        plan: job.plan,
        target: job.target,
      });

      await keepImportedVideos(built, videos);
      videos = [];

      return built;
    },
    replay: async (job: ReplayJob) => replayedRecording(await loadMujoco(), job),
  };
}

async function keepImportedVideos(built: BuiltTries, files: SourceFile[]) {
  for (const file of files) {
    if (file.size > IMPORT_LIMITS.fileBytes) continue;

    const bytes = await file.read();
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>]);
    const tries = built.kept.filter(({ stored }) => stored.videos?.some((video) => video.path === file.path));

    const key = JSON.stringify([tries[0]?.stored.origin, file.path]);

    await keepSharedVideoBlob(
      key,
      blob,
      tries.map(({ stored }) => ({ id: stored.id, path: file.path })),
    );
  }
}
