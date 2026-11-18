import type { StoredTry } from '../tryFile';
import type { ComparisonConsumer } from './comparisonClient';
import type { SourceInfo } from './comparisonJobs';

export interface ComparisonReads {
  manifests: (ids: string[]) => Promise<StoredTry[]>;
  recording: (id: string) => Promise<Uint8Array | null>;
}

export interface OpenedComparison {
  consumers: readonly ComparisonConsumer[];
  sources: readonly SourceInfo[];
}

export function comparisonSession(reads: ComparisonReads, create: () => ComparisonConsumer) {
  let generation = 0;
  let consumers: ComparisonConsumer[] = [];
  let ids: string[] = [];

  const close = () => {
    generation++;
    consumers.forEach((consumer) => consumer.dispose());
    consumers = [];
    ids = [];
  };

  const open = async (selected: readonly string[]): Promise<OpenedComparison | null> => {
    close();

    if (selected.length < 1 || selected.length > 2 || new Set(selected).size !== selected.length) return null;

    const ticket = generation;
    const current = () => ticket === generation;

    ids = [...selected];

    try {
      const [manifests, recordings] = await Promise.all([
        reads.manifests([...selected]),
        Promise.all(selected.map((id) => reads.recording(id))),
      ]);

      if (!current()) return null;

      const stored = selected.map((id) => manifests.find((manifest) => manifest.id === id));

      if (stored.some((manifest) => !manifest) || recordings.some((bytes) => !bytes)) {
        close();

        return null;
      }

      for (const id of selected) {
        if (!id) return null;

        consumers.push(create());
      }

      const pair = [...consumers];
      const sources = await Promise.all(
        pair.map((consumer, i) => consumer.call('open', { stored: stored[i]!, bytes: recordings[i]! })),
      );

      if (!current()) return null;

      return { consumers: pair, sources };
    } catch (error) {
      if (!current()) return null;

      close();

      throw error;
    }
  };

  return {
    open,
    close,
    version: () => generation,
    includes: (id: string) => ids.includes(id),
    deleted: (gone: readonly string[]) => {
      const removed = gone.some((id) => ids.includes(id));

      if (removed) close();

      return removed;
    },
  };
}

export type ComparisonSession = ReturnType<typeof comparisonSession>;
