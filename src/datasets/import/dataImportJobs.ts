import { loadMujoco } from '../../sim/loadMujoco';
import type { SimModel } from '../../sim/mjcfTypes';
import { importedTries, replayedRecording, type BuiltTries, type ImportTarget, type ReplayJob } from './importedTries';
import type { ReplayPlan } from './kinematicRecording';
import { importVideoBytes } from './importVideoBytes';
import { readSource, type ReadSource, type ImportSource } from './readSource';
import { DataImportError, type SourceData, type SourceFormat } from './types';
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
  let read: ReadSource | null = null;

  return {
    read: async (source: ImportSource): Promise<SourceSummary | null> => {
      const found = await readSource(source);

      read = found;

      if (!found) return null;

      const { format, robotType, names, episodes } = found.data;

      return { format, robotType, names, spans: sourceSpans(found.data), episodes: episodes.length, hash: found.hash };
    },
    build: async (job: BuildJob): Promise<BuiltTries> => {
      if (!read) throw new DataImportError('Import the files again.');

      const { data, files } = read;

      read = null;

      const built = await importedTries(await loadMujoco(), {
        model: job.model,
        data,
        plan: job.plan,
        target: job.target,
      });

      return data.format === 'mcap' ? built : importVideoBytes(built, files);
    },
    replay: async (job: ReplayJob) => replayedRecording(await loadMujoco(), job),
  };
}
