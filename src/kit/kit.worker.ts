import { reply, serve } from '../utils/workerRpc';
import { buildKit } from './buildKit';
import type { KitJob } from './types';

serve({
  build: async (job: KitJob) => {
    const bytes = await buildKit(job);

    return reply(bytes, [bytes.buffer]);
  },
});
