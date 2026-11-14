import type { Recording } from '../../sim/recorder';
import type { StoredTry, TrySummary } from '../tryFile';

export interface TryBackend {
  list: () => Promise<TrySummary[]>;
  save: (stored: StoredTry, recording: Recording | null) => Promise<void>;
  recording: (id: string) => Promise<Recording | null>;
  strip: (id: string) => Promise<Blob | null>;
  saveStrip: (id: string, strip: Blob) => Promise<void>;
  delete: (ids: string[]) => Promise<void>;
}

export const TRIES_LABEL = 'tries';
