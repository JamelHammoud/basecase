import type { Recording } from '../../sim/recorder';
import type { StoredTry, TrySummary } from '../tryFile';

export interface TryBackend {
  list: () => Promise<TrySummary[]>;
  save: (stored: StoredTry, recording: Recording | null) => Promise<void>;
  update: (stored: StoredTry) => Promise<boolean>;
  recording: (id: string) => Promise<Recording | null>;
  recordingBytes: (id: string) => Promise<Uint8Array | null>;
  strip: (id: string) => Promise<Blob | null>;
  saveStrip: (id: string, strip: Blob) => Promise<void>;
  delete: (ids: string[]) => Promise<void>;
  manifests: (ids: string[]) => Promise<StoredTry[]>;
  index: () => Promise<Uint8Array | null>;
  saveIndex: (bytes: Uint8Array) => Promise<void>;
  session: (id: string) => Promise<string | null>;
  saveSession: (stored: StoredTry, session: string) => Promise<void>;
  saveVideo: (id: string, bytes: Uint8Array) => Promise<void>;
}

export const TRIES_LABEL = 'tries';
