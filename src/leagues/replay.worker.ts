import { seedReplay, type SeedReplay } from '../cases/seedReplay';
import { loadMujoco } from '../sim/loadMujoco';
import { errorMessage } from '../utils/errorMessage';
import { replayLeagueSeed } from './replay';
import type { LeagueEntry, LeagueManifest } from './types';

export interface LeagueReplayJob {
  manifest: LeagueManifest;
  entry: LeagueEntry;
  bytes: Uint8Array;
  seed: number;
}

export type LeagueReplayReply = { replay: SeedReplay; failed: string[] } | { error: string };

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<LeagueReplayJob>) => void) | null;
  postMessage: (reply: LeagueReplayReply) => void;
};

worker.onmessage = async ({ data }) => {
  try {
    const mj = await loadMujoco();
    const { result, outcome } = await replayLeagueSeed(mj, data.manifest, data.entry, {
      bytes: data.bytes,
      seed: data.seed,
      record: true,
    });
    const replay = await seedReplay(mj, result, data.seed);

    worker.postMessage({ replay, failed: outcome.failed });
  } catch (error) {
    worker.postMessage({ error: errorMessage(error) });
  }
};
