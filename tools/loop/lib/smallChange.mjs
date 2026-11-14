const MAX_LINES = 30;
const MAX_FILES = 5;
const SENSITIVE = /^(electron\/|tools\/loop\/|\.github\/|hw\/|forge\/|package\.json$|package-lock\.json$)/;

export function isSmall(pull) {
  if ((pull.labels ?? []).some((label) => label.name === 'loop:update')) return true;

  const files = (pull.files ?? []).map((file) => file.path);

  if (files.length === 0 || files.length > MAX_FILES || files.some((file) => SENSITIVE.test(file))) return false;

  return (pull.additions ?? Infinity) + (pull.deletions ?? Infinity) <= MAX_LINES;
}
