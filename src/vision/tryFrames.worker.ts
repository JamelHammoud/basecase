/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { TryFramesSession } from './tryFrames';
import type { TryFrameJob } from './tryFramesTypes';

const session = new TryFramesSession();

serve({
  load: async (job: TryFrameJob) => reply(await session.load(job)),
  next: async (_request: null) => {
    const frame = await session.next();

    return reply(frame, [frame.jpeg.buffer, frame.depth.buffer]);
  },
  close: (_request: null) => reply(session.close()),
});
