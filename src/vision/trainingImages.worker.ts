/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { TrainingImageSession, type LoadedTrainingJob } from './trainingImages';

const session = new TrainingImageSession();

serve({
  load: async (job: LoadedTrainingJob) => reply(await session.load(job)),
  next: async (_request: null) => {
    const frame = await session.next();

    return reply(frame, [frame.jpeg.buffer, frame.depth.buffer]);
  },
});
