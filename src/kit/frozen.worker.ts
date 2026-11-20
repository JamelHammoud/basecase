import { jsonHash } from '../utils/geometryHash';
import type { KitJob } from './types';
import { reply, serve } from '../utils/workerRpc';
import { freezeBuildKit, readFrozenKit, type PreparedFrozenKit } from './frozenKit';

serve({
  source: (input: Pick<KitJob, 'parts' | 'project'>) => reply(jsonHash(input)),
  prepare: async (input: Parameters<typeof freezeBuildKit>[0]) => reply(await freezeBuildKit(input)),
  read: (input: PreparedFrozenKit) => reply(readFrozenKit(input)),
});
