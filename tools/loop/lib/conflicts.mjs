import { store } from './store.mjs';

export const TOP_CONFLICTS = 5;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const conflictLog = store('conflicts', { resolutions: [] });

export const withConflict = (entry, { files, at }) => ({
  resolutions: [...(entry.resolutions ?? []), { at, files: [...new Set(files)].sort() }],
});

export function recordConflict(log, { pull, files, at = new Date().toISOString() }) {
  if (files.length === 0) return null;

  return log.update(pull, (entry) => withConflict(entry, { files, at }));
}

const within = (at, { from, to }) => Date.parse(at) >= Date.parse(from) && Date.parse(at) <= Date.parse(to);

const hitsIn = (entries, window) =>
  entries.flatMap((entry) =>
    (entry.resolutions ?? [])
      .filter((resolution) => within(resolution.at, window))
      .flatMap((resolution) => resolution.files.map((file) => ({ file, pull: Number(entry.key) }))),
  );

const byCountThenFile = (a, b) => b.count - a.count || b.pulls.length - a.pulls.length || a.file.localeCompare(b.file);

export function conflictsByFile(entries, window) {
  const files = new Map();

  for (const { file, pull } of hitsIn(entries, window)) {
    const tally = files.get(file) ?? { file, count: 0, pulls: new Set() };

    tally.count += 1;
    tally.pulls.add(pull);
    files.set(file, tally);
  }

  return [...files.values()]
    .map(({ file, count, pulls }) => ({ file, count, pulls: [...pulls].sort((a, b) => a - b) }))
    .sort(byCountThenFile);
}

export const conflictLine = ({ file, count, pulls }) =>
  `- \`${file}\`: ${count}, in ${pulls.map((pull) => `#${pull}`).join(', ')}`;

export const conflictsSection = (ranked) =>
  ranked.length > 0
    ? `Conflicts the rebase lane met, by file:\n\n${ranked.map(conflictLine).join('\n')}`
    : 'The rebase lane met no conflicts.';

export const topConflictsSection = (ranked) =>
  ranked.length > 0
    ? [
        `## Where this week's conflicts landed\n\n${ranked.slice(0, TOP_CONFLICTS).map(conflictLine).join('\n')}\n\nEvery conflict costs a rebase session and a fresh Check. A step that splits a file here, so features stop editing the same lines, moves it down.`,
      ]
    : [];

export function weekConflicts(now = Date.now(), log = conflictLog) {
  return conflictsByFile(log.all(), {
    from: new Date(now - WEEK_MS).toISOString(),
    to: new Date(now).toISOString(),
  });
}
