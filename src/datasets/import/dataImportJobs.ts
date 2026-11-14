import { loadMujoco } from '../../sim/loadMujoco';
import type { SimModel } from '../../sim/mjcfTypes';
import { importedTries, type BuiltTries, type ImportTarget } from './importedTries';
import type { ReplayPlan } from './kinematicRecording';
import { readSource, type ImportSource } from './readSource';
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
  let read: SourceData | null = null;

  return {
    read: async (source: ImportSource): Promise<SourceSummary | null> => {
      const found = await readSource(source);

      read = found?.data ?? null;

      if (!found) return null;

      const { format, robotType, names, episodes } = found.data;

      return { format, robotType, names, spans: sourceSpans(found.data), episodes: episodes.length, hash: found.hash };
    },
    build: async (job: BuildJob): Promise<BuiltTries> => {
      if (!read) throw new DataImportError('Import the files again.');

      const data = read;

      read = null;

      return importedTries(await loadMujoco(), { model: job.model, data, plan: job.plan, target: job.target });
    },
  };
}
