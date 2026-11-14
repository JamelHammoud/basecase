/// <reference lib="webworker" />
import { recordingTransfer } from '../../sim/recorder';
import { reply, serve } from '../../utils/workerRpc';
import { importHandlers, type BuildJob } from './dataImportJobs';
import type { ImportSource } from './readSource';

const handlers = importHandlers();

serve({
  read: async (source: ImportSource) => reply(await handlers.read(source)),
  build: async (job: BuildJob) => {
    const built = await handlers.build(job);

    return reply(
      built,
      built.kept.flatMap((k) => recordingTransfer(k.recording)),
    );
  },
});
