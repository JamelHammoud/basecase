import crypto from 'node:crypto';
import path from 'node:path';
import { readIndex } from '../../../bench/archive.mjs';
import { evidenceSources, githubCandidates } from '../../../bench/micro/harvest/github.mjs';
import { ALL_TASKS } from '../../../bench/micro/tasks/index.mjs';
import { readStubs } from '../../../bench/micro/stubs.mjs';
import { windowStart } from './history.mjs';
import { archiveWaste } from './harnessArchiveWaste.mjs';
import { HOME_CHECKOUT, LOOP_DIR } from './paths.mjs';
import { run } from './sh.mjs';

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const normalized = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const candidateKey = (candidate) =>
  digest([candidate.source, candidate.ref, candidate.kind, candidate.text].map(normalized).join('\n'));

const heldOutIds = new Set(ALL_TASKS.filter((task) => task.heldOut).map((task) => task.id));
const tuneEntry = (entry, since) => entry.at >= since && !entry.heldOut && !heldOutIds.has(entry.task);

const runFailure = (entry) =>
  entry.grade === 'fail' || (typeof entry.score === 'number' && entry.score < 60) || entry.critique?.length;

export function indexedCandidates(entries, since) {
  return entries
    .filter((entry) => tuneEntry(entry, since) && runFailure(entry))
    .filter((entry) => entry.kind !== 'micro' || !!entry.servedBy)
    .map((entry) => ({
      source: entry.kind ?? 'bench',
      ref: `${entry.run}/${entry.task}`,
      text: JSON.stringify({ task: entry.task, grade: entry.grade, score: entry.score, critique: entry.critique }),
    }));
}

const candidateRank = (candidate) => [
  candidate.measured?.milliseconds ?? 0,
  candidate.measured?.frequency ?? 0,
  candidate.measured?.supportingTokens ?? 0,
];
const compareCandidates = (a, b) => {
  const left = candidateRank(a);
  const right = candidateRank(b);

  return right[0] - left[0] || right[1] - left[1] || right[2] - left[2] || a.key.localeCompare(b.key);
};

export function chooseCandidate({ candidates, journal, experiments }) {
  const seen = new Set([
    ...journal.map((entry) => entry.candidate),
    ...experiments.flatMap((entry) =>
      entry.tags.filter((tag) => tag.startsWith('candidate:')).map((tag) => tag.slice(10)),
    ),
  ]);

  return (
    candidates
      .map((candidate) => ({ ...candidate, key: candidateKey(candidate) }))
      .filter((candidate) => !seen.has(candidate.key))
      .sort(compareCandidates)[0] ?? null
  );
}

export function archiveCandidates(roots, since) {
  const sources = [...new Set(roots)].map((root) => ({
    root,
    entries: readIndex(root).filter((entry) => tuneEntry(entry, since)),
  }));
  const candidates = sources.flatMap(({ entries }) => indexedCandidates(entries, since));
  const unique = new Map(candidates.map((candidate) => [candidateKey(candidate), candidate]));

  return [...unique.values(), ...archiveWaste(sources)];
}

export function weekCandidates(now = Date.now()) {
  const since = windowStart(7, now);
  const roots = [path.join(HOME_CHECKOUT, 'bench', 'runs'), path.join(LOOP_DIR, 'state', 'harness', 'runs')];
  const github = githubCandidates(evidenceSources(since));
  const harvested = readStubs(path.join(HOME_CHECKOUT, 'bench', 'micro', 'tasks', 'harvested'))
    .filter(
      ({ dir }) =>
        run('git', ['log', '-1', '--format=%cI', '--', path.relative(HOME_CHECKOUT, path.join(dir, 'task.json'))], {
          cwd: HOME_CHECKOUT,
          timeout: 5000,
        }).out >= since,
    )
    .filter(({ stub }) => !stub.heldOut)
    .map(({ stub }) => ({ source: 'harvest', ref: stub.source.ref, text: stub.source.text, kind: stub.fault?.kind }));

  return [...archiveCandidates(roots, since), ...github.review, ...github.comment, ...harvested];
}
