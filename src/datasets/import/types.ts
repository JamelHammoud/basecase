export const IMPORT_LIMITS = {
  fileBytes: 512 * 1024 * 1024,
  metaBytes: 8 * 1024 * 1024,
  chunkBytes: 64 * 1024 * 1024,
  episodes: 10_000,
  joints: 64,
  seconds: 600,
  textChars: 1000,
};

export interface SourceFile {
  path: string;
  size: number;
  read: () => Promise<Uint8Array>;
}

export interface SourceFolder {
  name: string;
  files: SourceFile[];
}

export interface SourceVideo {
  camera: string;
  path: string;
  from: number;
  to: number;
  frames?: number;
}

export interface SourceEpisode {
  index: number;
  task: string | null;
  t: Float64Array;
  state: Float64Array;
  action: Float64Array | null;
  videos: SourceVideo[];
}

export type SourceFormat = 'lerobot-v2.1' | 'lerobot-v3.0' | 'mcap';

export interface SourceData {
  format: SourceFormat;
  robotType: string | null;
  names: string[];
  episodes: SourceEpisode[];
}

export class DataImportError extends Error {}

export const finiteOrRefuse = (values: ArrayLike<number>, what: string) => {
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) throw new DataImportError(`${what} holds a value that isn’t a number.`);
  }
};
