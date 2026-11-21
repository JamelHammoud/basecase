import { negative } from '../../../electron/minus.mjs';
import type { ComparisonSample } from '../../cases/comparison/comparison';

const STATUS: Record<ComparisonSample['status'], string> = {
  sample: '',
  missing: 'Missing sample',
  outside: 'Outside range',
  stale: 'Stale sample',
  clipped: 'Clipped',
};

export const comparisonNumber = (value: number) => negative(value, (magnitude) => String(Number(magnitude.toFixed(4))));

export const comparisonText = (sample: ComparisonSample | undefined) => {
  if (!sample) return 'Missing sample';

  if (sample.status !== 'sample') return STATUS[sample.status];

  return typeof sample.value === 'number' ? comparisonNumber(sample.value) : sample.value;
};
