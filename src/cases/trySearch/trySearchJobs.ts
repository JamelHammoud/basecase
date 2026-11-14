import { reply } from '../../utils/workerRpc';
import type { StoredTry } from '../tryFile';
import { parseQuery } from './queryParser';
import { TrySearchIndex } from './searchIndex';
import type { TryHit } from './types';

export interface SyncPlan {
  wanted: string[];
  gone: string[];
}

export function trySearchJobs() {
  let index = new TrySearchIndex();

  return {
    load: ({ snapshot }: { snapshot: Uint8Array | null }) => {
      index = (snapshot && TrySearchIndex.fromSnapshot(snapshot)) || new TrySearchIndex();

      return reply(index.ids().length);
    },
    plan: ({ stamps }: { stamps: Record<string, number | null> }): ReturnType<typeof reply<SyncPlan>> => {
      const held = index.stamps();
      const wanted = Object.keys(stamps).filter(
        (id) => !(id in held) || (stamps[id] !== null && held[id] !== stamps[id]),
      );
      const gone = Object.keys(held).filter((id) => !(id in stamps));

      return reply({ wanted, gone });
    },
    put: ({ tries, stamps }: { tries: StoredTry[]; stamps: Record<string, number> }) => {
      index.put(tries, stamps);

      return reply(true);
    },
    remove: ({ ids }: { ids: string[] }) => {
      index.remove(ids);

      return reply(true);
    },
    search: ({ text, now, limit }: { text: string; now: number; limit: number }): ReturnType<typeof reply<TryHit[]>> =>
      reply(index.search(parseQuery(text, index.vocab(), new Date(now)), limit)),
    snapshot: () => {
      const bytes = index.snapshot();

      return reply(bytes, [bytes.buffer]);
    },
  };
}

export type TrySearchJobs = ReturnType<typeof trySearchJobs>;
