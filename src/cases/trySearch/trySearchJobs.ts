import type { StoredTry } from '../tryFile';
import { reply } from '../../utils/workerRpc';
import { parseQuery } from './queryParser';
import { TrySearchIndex } from './searchIndex';
import type { FrameVector, TryHit } from './types';

export interface SearchRequest {
  text: string;
  now: number;
  limit: number;
  textVector?: Float32Array | null;
}

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
    putFrames: ({ tryId, frames }: { tryId: string; frames: FrameVector[] }) => {
      index.putFrames(tryId, frames);

      return reply(true);
    },
    unframed: ({ ids }: { ids: string[] }) => reply(ids.filter((id) => !index.hasFrames(id))),
    framed: () => reply(index.ids().some((id) => index.hasFrames(id))),
    words: ({ text, now }: { text: string; now: number }) =>
      reply(parseQuery(text, index.vocab(), new Date(now)).words.join(' ')),
    search: ({ text, now, limit, textVector }: SearchRequest): ReturnType<typeof reply<TryHit[]>> =>
      reply(index.search(parseQuery(text, index.vocab(), new Date(now)), { limit, textVector })),
    snapshot: () => {
      const bytes = index.snapshot();

      return reply(bytes, [bytes.buffer]);
    },
  };
}

export type TrySearchJobs = ReturnType<typeof trySearchJobs>;
