import { protectedPath } from './protected.mjs';

const MAX_LINES = 30;
const MAX_FILES = 5;
const SENSITIVE = /^(electron\/|tools\/loop\/|\.github\/|hw\/|forge\/|package\.json$|package-lock\.json$)/;

export function isSmall(pull) {
  const files = (pull.files ?? []).map((file) => file.path);

  if (files.length === 0 || files.some((file) => file.startsWith('src/') || protectedPath(file))) return false;

  const update = (pull.labels ?? []).some((label) => label.name === 'loop:update');

  if (update && files.every((file) => file === 'package.json' || file === 'package-lock.json')) return true;

  if (files.length > MAX_FILES || files.some((file) => SENSITIVE.test(file))) return false;

  return (pull.additions ?? Infinity) + (pull.deletions ?? Infinity) <= MAX_LINES;
}
