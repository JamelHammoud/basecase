import type { Recording } from '../../sim/recorder';
import type { StoredTry, TrySummary } from '../tryFile';
import type { LabelPatch } from '../tryLabels';

export interface Relabel {
  id: string;
  patch: LabelPatch;
}

export interface TryBackend {
  list: () => Promise<TrySummary[]>;
  save: (stored: StoredTry, recording: Recording | null) => Promise<void>;
  recording: (id: string) => Promise<Recording | null>;
  manifest: (id: string) => Promise<StoredTry | null>;
  relabel: (changes: Relabel[]) => Promise<void>;
  strip: (id: string) => Promise<Blob | null>;
  saveStrip: (id: string, strip: Blob) => Promise<void>;
  delete: (ids: string[]) => Promise<void>;
}

export const TRIES_LABEL = 'tries';
