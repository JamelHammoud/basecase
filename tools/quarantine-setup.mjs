import path from 'node:path';
import { beforeEach } from 'vitest';
import { ROOT, activeEntries, entryMatches, loadQuarantine, quarantineMode } from './quarantine.mjs';

const mode = quarantineMode();
const entries = mode === 'off' ? [] : activeEntries(loadQuarantine());

const relative = (filepath) => path.relative(ROOT, filepath).split(path.sep).join('/');

function isListed(task) {
  const test = { file: relative(task.file.filepath), name: task.name, fullName: task.fullTestName };

  return entries.some((entry) => entryMatches(entry, test));
}

const SKIPS = {
  skip: (task) => isListed(task),
  only: (task) => !isListed(task),
};

beforeEach(({ task, skip }) => {
  const shouldSkip = SKIPS[mode];

  if (shouldSkip?.(task)) skip(mode === 'skip' ? 'quarantined' : 'not quarantined');
});
