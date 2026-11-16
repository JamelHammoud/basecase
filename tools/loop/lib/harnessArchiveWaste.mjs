import fs from 'node:fs';
import path from 'node:path';
import { lastCheck, missedFaults } from '../../../bench/micro/harvest/sources.mjs';
import { jsonLines } from './sessionJournal.mjs';
import { wastePatterns } from './harnessWaste.mjs';

export const WASTE_LIMITS = { entries: 128, fileBytes: 2 * 1024 * 1024, events: 4000, refs: 8 };

function boundedText(file) {
  try {
    if (fs.statSync(file).size > WASTE_LIMITS.fileBytes) return null;

    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function eventFiles(root, entry) {
  const run = path.resolve(root, entry.run);

  if (!run.startsWith(path.resolve(root) + path.sep)) return [];

  let arms = [];

  try {
    arms = fs
      .readdirSync(run, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .slice(0, 16)
      .map((item) => item.name);
  } catch {}

  return ['', ...arms].map((arm) => path.join(run, arm, 'micro', entry.task, `seed-${entry.seed ?? 1}`));
}

function missedChecks(dir, records, root) {
  const check = lastCheck(records);
  const scene = check && boundedText(path.join(dir, 'scene.json'));

  if (!scene) return [];

  try {
    return missedFaults(JSON.parse(scene), check).map((fault) => ({
      source: 'run',
      ref: path.relative(path.dirname(root), dir).split(path.sep).join('/'),
      kind: fault.kind,
      graded: true,
      ids: fault.ids,
      text: `Last ${check.tool}: ${check.text.split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 240)}`,
    }));
  } catch {
    return [];
  }
}

function replayEntry(root, entry) {
  if (typeof entry.run !== 'string' || ![entry.task, String(entry.seed ?? 1)].every((part) => /^[\w-]+$/.test(part)))
    return [];

  return eventFiles(root, entry).flatMap((dir) => {
    const summary = boundedText(path.join(dir, 'summary.json'));

    if (!summary) return [];

    let saved;

    try {
      saved = JSON.parse(summary);
    } catch {
      return [];
    }

    if (!matchingSummary(saved, entry)) return [];

    const events = boundedText(path.join(dir, 'events.jsonl'));

    if (!events) return [];

    const records = jsonLines(events).slice(0, WASTE_LIMITS.events);

    return [{ patterns: wastePatterns(records), faults: missedChecks(dir, records, root) }];
  });
}

function matchingSummary(saved, entry) {
  return (
    saved &&
    !saved.heldOut &&
    ['task', 'seed', 'harness', 'servedBy', 'model', 'effort'].every(
      (key) => (saved[key] ?? null) === (entry[key] ?? null),
    ) &&
    (saved.provider ?? 'claude') === (entry.provider ?? 'claude')
  );
}

function appendEvidence(groups, pattern, entry) {
  const ref = `${entry.run}/${entry.task}`;
  const key = `${pattern.kind}/${pattern.tools.join('/')}`;
  const candidate = groups.get(key) ?? {
    source: 'tune-waste',
    ref: `tune-waste/${key}`,
    kind: pattern.kind,
    text: `${pattern.kind}: ${pattern.tools.join(', ')}`,
    measured: { frequency: 0, milliseconds: 0, missingDurations: 0, supportingTokens: 0, missingTokens: 0 },
    evidence: [],
  };
  const measured = candidate.measured;
  const tokens = Number.isFinite(entry.tokens?.total) && entry.tokens.total >= 0 ? entry.tokens.total : null;

  measured.frequency += pattern.frequency;
  measured.milliseconds += pattern.milliseconds;
  measured.missingDurations += pattern.missingDurations;
  measured.supportingTokens += tokens ?? 0;
  measured.missingTokens += tokens === null ? 1 : 0;

  if (candidate.evidence.length < WASTE_LIMITS.refs && !candidate.evidence.includes(ref)) candidate.evidence.push(ref);

  groups.set(key, candidate);
}

export function archiveWaste(sources) {
  const groups = new Map();
  const attempts = new Map();
  const faults = [];
  const entries = sources
    .flatMap(({ root, entries }) => entries.map((entry) => ({ root, entry })))
    .sort(
      (a, b) => b.entry.at.localeCompare(a.entry.at) || JSON.stringify(a.entry).localeCompare(JSON.stringify(b.entry)),
    );

  for (const { root, entry } of entries) {
    const key = [entry.run, entry.task, entry.seed, entry.model, entry.harness, entry.provider ?? 'claude'].join('/');

    if (entry.kind !== 'micro' || !entry.servedBy) continue;

    if (!attempts.has(key) && attempts.size >= WASTE_LIMITS.entries) continue;

    attempts.set(key, [...(attempts.get(key) ?? []), { root, entry }]);
  }

  for (const copies of attempts.values()) {
    const replay = replayCopies(copies);

    for (const { result, entry } of replay) {
      faults.push(...result.faults);

      for (const pattern of result.patterns) appendEvidence(groups, pattern, entry);
    }
  }

  return [...groups.values(), ...faults];
}

function replayCopies(copies) {
  for (const { root, entry } of copies) {
    const replay = replayEntry(root, entry);

    if (replay.length) return replay.map((result) => ({ result, entry }));
  }

  return [];
}
