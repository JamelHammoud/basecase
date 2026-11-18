import { loadMujoco } from '../../sim/loadMujoco';
import type { SimModel } from '../../sim/mjcfTypes';
import { importedTries, replayedRecording, type BuiltTries, type ImportTarget, type ReplayJob } from './importedTries';
import type { ReplayPlan } from './kinematicRecording';
import { readImportSource, type ReadSource, type ImportSource } from './readSource';
import { ImageImportSession, type ImageImportContext, type ImageImportSummary } from './imageImportSession';
import { importVideoBytes } from './importVideoBytes';
import { DataImportError, type SourceData, type SourceFormat } from './types';
import { columnSpans, mergedSpans, type ColumnSpan } from './units';
import { topicOnlyTries } from './topicOnlyTries';

export interface SourceSummary {
  format: SourceFormat | 'images';
  robotType: string | null;
  names: string[];
  spans: ColumnSpan[];
  episodes: number;
  hash: string;
  images?: ImageImportSummary;
}

export interface BuildJob {
  model: SimModel | null;
  plan: ReplayPlan;
  target: ImportTarget;
}

export const sourceSpans = (data: SourceData) =>
  mergedSpans(data.episodes.map((e) => columnSpans(e.state, data.names.length)));

export function importHandlers() {
  let read: ReadSource | null = null;
  const images = new ImageImportSession();

  return {
    read: async (source: ImportSource): Promise<SourceSummary | null> => {
      read = null;
      images.load(null);

      const found = await readImportSource(source);

      read = found && 'data' in found ? found : null;

      const imageManifest = images.load(found && 'images' in found ? (found.images ?? null) : null);

      if (!found) return null;

      if (!('data' in found))
        return {
          format: 'images',
          robotType: null,
          names: [],
          spans: [],
          episodes: 0,
          hash: found.hash,
          images: imageManifest,
        };

      const { format, robotType, names, episodes } = found.data;

      return {
        format,
        robotType,
        names,
        spans: sourceSpans(found.data),
        episodes: episodes.length,
        hash: found.hash,
        ...(imageManifest ? { images: imageManifest } : {}),
      };
    },
    prepareImages: (context: ImageImportContext) => images.prepare(context),
    nextImage: () => images.take(),
    build: async (job: BuildJob): Promise<BuiltTries> => {
      if (!read) throw new DataImportError('Import the files again.');

      const { data, files } = read;

      read = null;

      if (data.names.length === 0) return topicOnlyTries(data, job.target);

      if (!job.model) throw new DataImportError('Import the files again.');

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
