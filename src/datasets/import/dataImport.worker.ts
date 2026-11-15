/// <reference lib="webworker" />
import { recordingTransfer } from '../../sim/recorder';
import { reply, serve } from '../../utils/workerRpc';
import { importHandlers, type BuildJob } from './dataImportJobs';
import type { ReplayJob } from './importedTries';
import type { ImportSource } from './readSource';

const handlers = importHandlers();

serve({
  read: async (source: ImportSource) => reply(await handlers.read(source)),
  build: async (job: BuildJob) => {
    const built = await handlers.build(job);

    return reply(built, [
      ...new Set(
        built.kept.flatMap((k) => [
          ...recordingTransfer(k.recording),
          ...(k.videos ?? []).map((v) => v.bytes.buffer as ArrayBuffer),
        ]),
      ),
    ]);
  },
  replay: async (job: ReplayJob) => {
    const recording = await handlers.replay(job);

    return reply(recording, recordingTransfer(recording));
  },
});
