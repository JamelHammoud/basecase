import type { TrySegment } from '../cases/tryLabels';
import { reply, workerClient, type Reply } from '../utils/workerRpc';
import type { SegmentInput } from './segments';

type SegmentHandlers = {
  segment: (input: SegmentInput) => Reply<TrySegment[]>;
};

const localHandlers = async (): Promise<SegmentHandlers> => {
  const { segmentTry } = await import('./segments');

  return { segment: (input) => reply(segmentTry(input)) };
};

const client = workerClient<SegmentHandlers>(
  () => new Worker(new URL('./segments.worker.ts', import.meta.url), { type: 'module' }),
  localHandlers,
);

export const segmentInWorker = (input: SegmentInput): Promise<TrySegment[]> => client.call('segment', input);
