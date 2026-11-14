import type { MirrorLink } from '../types/ports';

export const SIDE_WORDS: Record<MirrorLink['axis'], [string, string][]> = {
  x: [['left', 'right']],
  y: [
    ['front', 'rear'],
    ['front', 'back'],
  ],
  z: [['top', 'bottom']],
};

function matchCase(m: string, out: string): string {
  if (m === m.toUpperCase()) return out.toUpperCase();

  return m[0] === m[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;
}

export function swapWords(s: string, pairs: [string, string][]) {
  return pairs.reduce((acc, [a, b]) => {
    const re = new RegExp(`(?<![A-Za-z])(${a}|${b})(?![a-z])`, 'gi');

    return acc.replace(re, (m) => matchCase(m, m.toLowerCase() === a ? b : a));
  }, s);
}

export function mirroredName(name: string, axis: MirrorLink['axis']): string {
  const swapped = swapWords(name, SIDE_WORDS[axis]);

  return swapped === name ? `${name} (Mirror)` : swapped;
}
