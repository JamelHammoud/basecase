import { plural } from './plural.mjs';

export const KB = 1024;
export const MB = 1024 * KB;
export const GB = 1024 * MB;

const UNITS = [
  ['GB', GB],
  ['MB', MB],
  ['KB', KB],
];

const figures = (value) => (value < 9.95 ? Math.round(value * 10) / 10 : Math.round(value));

export function fileSize(bytes) {
  const n = Math.max(0, Math.round(bytes));
  const unit = UNITS.find(([, size]) => n >= size * 0.9995);

  return unit ? `${figures(n / unit[1])} ${unit[0]}` : plural(n, 'byte');
}
