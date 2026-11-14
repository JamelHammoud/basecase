/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { segmentTry, type SegmentInput } from './segments';

serve({
  segment: (input: SegmentInput) => reply(segmentTry(input)),
});
