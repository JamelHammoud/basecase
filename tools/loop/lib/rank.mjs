import { hasLabel } from './github.mjs';

export const isRepair = (pull) => pull.headRefName.startsWith('loop/repair/');

const rank = (pull) => {
  if (isRepair(pull)) return 0;

  if (pull.headRefName.startsWith('loop/loop/') || hasLabel(pull, 'loop:loop')) return 1;

  return hasLabel(pull, 'loop:priority') ? 2 : 3;
};

export const byRank = (a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt);
