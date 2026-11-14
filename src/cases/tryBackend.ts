import type { Recording } from '../sim/recorder';
import type { StoredTry } from './storedTry';

export interface TryEntry {
  manifest: StoredTry;
  recording?: Recording;
  film?: Blob;
}

export interface TryBackend {
  list: () => Promise<StoredTry[]>;
  save: (entry: TryEntry) => Promise<void>;
  recording: (id: string) => Promise<Recording | null>;
  film: (id: string) => Promise<Blob | null>;
  remove: (ids: string[]) => Promise<void>;
}
