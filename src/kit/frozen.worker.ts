import { frozenPartOutput } from './frozenPartOutput';
import { jsonHash } from '../utils/geometryHash';
import type { KitJob } from './types';
import { reply, serve } from '../utils/workerRpc';
import { freezeBuildKit, readFrozenKit, type PreparedFrozenKit } from './frozenKit';
import { copySourcesFromMeshes } from './frozenCopySources';

serve({
  partOutput: (input: Parameters<typeof frozenPartOutput>[0]) => {
    const output = frozenPartOutput(input);

    return reply(output, output ? [output.bytes.buffer as ArrayBuffer] : []);
  },
  copySources: (input: Parameters<typeof copySourcesFromMeshes>[0]) => reply(copySourcesFromMeshes(input)),
  source: (input: Pick<KitJob, 'parts' | 'project'>) => reply(jsonHash(input)),
  prepare: async (input: Parameters<typeof freezeBuildKit>[0]) => reply(await freezeBuildKit(input)),
  read: (input: PreparedFrozenKit) => reply(readFrozenKit(input)),
});
