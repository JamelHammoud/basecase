import type { MirrorLink } from '../types/ports';

function sideWords(a: string, b: string) {
  return { a, b, pattern: new RegExp(`(?<![A-Za-z])(${a}|${b})(?![a-z])`, 'gi') };
}

export const SIDE_WORDS = {
  x: [sideWords('left', 'right')],
  y: [sideWords('front', 'rear'), sideWords('front', 'back')],
  z: [sideWords('top', 'bottom')],
};

function matchCase(m: string, out: string): string {
  if (m === m.toUpperCase()) return out.toUpperCase();

  return m[0] === m[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;
}

export function swapWords(s: string, pairs: typeof SIDE_WORDS.x) {
  return pairs.reduce(
    (acc, { a, b, pattern }) => acc.replace(pattern, (m) => matchCase(m, m.toLowerCase() === a ? b : a)),
    s,
  );
}

export function mirroredName(name: string, axis: MirrorLink['axis']): string {
  const swapped = swapWords(name, SIDE_WORDS[axis]);

  return swapped === name ? `${name} (Mirror)` : swapped;
}
