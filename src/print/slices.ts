import type { SliceRecord } from './printBridge';

export const currentSlices = (slice: Pick<SliceRecord, 'labels' | 'plates'> | null, labels: string) =>
  (slice?.labels ?? '') === labels ? slice?.plates : undefined;
