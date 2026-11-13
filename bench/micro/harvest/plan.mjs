import { layoutNames } from '../bolted.mjs';
import { coverageKey, FAULT_KINDS, faultsIn } from './kinds.mjs';

export function coveredBy({ task, start, grade }) {
  const failing = new Set(grade.checks.filter((c) => c.pass === false).map((c) => c.name));

  return faultsIn(start)
    .map((f) => f.kind)
    .filter((kind) => failing.has(FAULT_KINDS[kind].graderName))
    .map((kind) => [coverageKey(kind), task.id]);
}

export function splitFor({ heldOut, total, last }) {
  if (3 * heldOut < total + 1) return 'heldout';

  return last === 'tune' ? 'heldout' : 'tune';
}

export function assignSplits(fresh, tasks) {
  const harvested = tasks.filter((t) => t.harvested);
  const state = {
    heldOut: tasks.filter((t) => t.heldOut).length,
    total: tasks.length,
    last: harvested.length ? (harvested.at(-1).heldOut && 'heldout') || 'tune' : null,
    next: Math.max(0, ...harvested.map((t) => Number(t.id.slice(1)))) + 1,
  };

  return fresh.map((entry) => {
    const split = splitFor(state);

    state.heldOut += split === 'heldout' ? 1 : 0;
    state.total += 1;
    state.last = split;

    return { ...entry, id: `H${state.next++}`, heldOut: split === 'heldout' };
  });
}

const sortIfGraded = (c) => (c.graded ? 0 : 1);

export function planHarvest({ candidates, covered, layoutOffset = 0 }) {
  const seen = new Map([...covered].reverse());
  const plan = { fresh: [], duplicates: [], noGrader: [], dropped: [] };

  for (const candidate of [...candidates].sort((a, b) => sortIfGraded(a) - sortIfGraded(b))) {
    const kind = FAULT_KINDS[candidate.kind];

    if (!candidate.graded || !kind) {
      plan.noGrader.push(candidate);

      continue;
    }

    const key = coverageKey(candidate.kind);

    if (seen.has(key)) {
      plan.duplicates.push({ candidate, of: seen.get(key) });

      continue;
    }

    if (!kind.plant) {
      plan.dropped.push({ candidate, reason: `${candidate.kind} has no planted fault to build a fixture from` });

      continue;
    }

    const layout = layoutNames[(layoutOffset + plan.fresh.length) % layoutNames.length];

    seen.set(key, `new ${candidate.kind} task`);
    plan.fresh.push({ candidate, kind: candidate.kind, layout });
  }

  return plan;
}

export const stubFor = ({ id, heldOut, kind, layout, candidate }) => ({
  id,
  category: 'assembly',
  heldOut,
  fault: { kind, layout },
  grader: FAULT_KINDS[kind].graderName,
  source: {
    kind: candidate.source,
    ref: candidate.ref,
    ...(candidate.at ? { at: candidate.at } : {}),
    ...(candidate.ids?.length ? { parts: candidate.ids.join(', ') } : {}),
    text: candidate.text,
  },
});

const cell = (text = '') => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const sourceOf = (c) => `${c.source} ${c.ref}`;
const table = (head, rows) =>
  rows.length
    ? [
        `| ${head.join(' | ')} |`,
        `|${head.map(() => '---').join('|')}|`,
        ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
      ].join('\n')
    : 'None.';

export function reportMarkdown({ since, counts, created, plan }) {
  const sources = Object.entries(counts)
    .map(([name, n]) => `${n} from ${name}`)
    .join(', ');

  return [
    `### Micro-eval harvest since ${since.slice(0, 10)}`,
    `${created.length} new task${created.length === 1 ? '' : 's'} from ${sources}.`,
    '#### New tasks',
    table(
      ['Task', 'Fault', 'Split', 'Source', 'What it said'],
      created.map((t) => [
        t.id,
        `${t.kind} (${t.layout})`,
        t.heldOut ? 'held out' : 'tune',
        sourceOf(t.candidate),
        t.candidate.text,
      ]),
    ),
    '#### No grader',
    'Faults no app check grades yet. Each is input for a new Check.',
    table(
      ['Fault', 'Source', 'What it said'],
      plan.noGrader.map((c) => [c.kind ?? 'unnamed', sourceOf(c), c.text]),
    ),
    '#### Duplicates',
    table(
      ['Fault', 'Covered by', 'Source'],
      plan.duplicates.map((d) => [d.candidate.kind, d.of, sourceOf(d.candidate)]),
    ),
    '#### Dropped',
    table(
      ['Fault', 'Why', 'Source'],
      plan.dropped.map((d) => [d.candidate.kind, d.reason, sourceOf(d.candidate)]),
    ),
  ].join('\n\n');
}
