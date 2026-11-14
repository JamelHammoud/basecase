import { workerClient } from '../utils/workerRpc';
import type { Segment, SegmentInput } from './segments';

type SegmentHandlers = {
  segment: (input: SegmentInput) => { result: Segment[] };
};

const localHandlers = async (): Promise<SegmentHandlers> => {
  const { segmentTry } = await import('./segments');

  return { segment: (input) => ({ result: segmentTry(input) }) };
};

const client = workerClient<SegmentHandlers>(
  () => new Worker(new URL('./segments.worker.ts', import.meta.url), { type: 'module' }),
  localHandlers,
);

export const segmentInWorker = (input: SegmentInput): Promise<Segment[]> => client.call('segment', input);
