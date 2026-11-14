import type { StoredTry } from '../../../cases/tryFile';
import { keepTries } from '../../../cases/tryStore';
import { feedFrames, searchTries } from '../../../cases/trySearch/trySearchClient';
import { hitPayload } from '../../agentTryRequests';

export default function trySearchStudio() {
  return {
    keepStoredTries: (tries: StoredTry[]) => keepTries(tries.map((stored) => ({ stored, recording: null }))),
    searchTries: async (query: string) => (await searchTries(query)).map(hitPayload),
    embedTryFrames: () => feedFrames(),
  };
}
