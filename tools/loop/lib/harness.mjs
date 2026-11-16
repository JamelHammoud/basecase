import { servedMismatch } from '../../../bench/compare/models.mjs';
import { appendExperiment, readExperiments } from '../../../bench/experiments.mjs';
import { capacityHold } from './capacity.mjs';

export const EXPERIMENT_MS = 30 * 60_000;

export function experimentHold({ locks, quiet, sessions, loadPerCore }) {
  if (quiet) return 'a Gatekeeper timed check needs a quiet machine';

  const active = locks.filter((name) => !/^nightly-\d+$/.test(name));

  if (active.length) return `active loop work: ${active.join(', ')}`;

  if (sessions) return `${sessions} agent sessions are running`;

  return capacityHold({ lane: 'harness', sessions, loadPerCore });
}

const eligibleStop = (result) => ['winner', 'rounds', 'equivalent'].includes(result?.plan?.stop);

function completeRows({ results, labels, resolved, stats, plan, provider }) {
  if (resolved?.length !== 2 || resolved[0].id !== resolved[1].id) return false;

  const keys = new Set(results.map((run) => `${run.model}/${run.task}/${run.seed}`));
  const tasks = new Set(stats.paired.map((task) => task.task));

  return (
    keys.size === plan.tasks * plan.rounds * 2 &&
    results.every(
      (run) =>
        (!provider || run.provider === provider) &&
        tasks.has(run.task) &&
        labels.includes(run.model) &&
        Number.isInteger(run.seed) &&
        run.seed >= 1 &&
        run.seed <= plan.rounds &&
        ['pass', 'fail'].includes(run.status) &&
        !run.timedOut &&
        !!run.servedBy &&
        !servedMismatch(resolved[labels.indexOf(run.model)], run.servedBy),
    )
  );
}

export function completeComparison(result) {
  const { stats, plan, results, labels } = result ?? {};

  if (!eligibleStop(result) || labels?.[0] !== 'working tree' || labels.length !== 2) return false;

  if (!stats?.models || stats.models.length !== 2 || stats.models.some((model) => model.errors || model.unavailable))
    return false;

  if (stats.paired.length < 5 || stats.paired.length !== plan.tasks) return false;

  return results?.length === plan.tasks * plan.rounds * 2 && completeRows(result);
}

export const heldoutWin = (result) =>
  completeComparison(result) && result.plan.stop === 'winner' && result.stats.stopCi?.[0] > 0;

const tagsOf = (entry) => [`candidate:${entry.candidate}`, `fingerprint:${entry.fingerprint}`, entry.verdict];
const identityOf = (entry) => entry.tags?.find((tag) => tag.startsWith('fingerprint:'));

export function flushJournal(ledger, journal) {
  const recorded = new Set(readExperiments(ledger).map(identityOf));

  for (const entry of journal.filter((item) => item.lesson && item.evidence?.length)) {
    const key = `fingerprint:${entry.fingerprint}`;

    if (recorded.has(key)) continue;

    appendExperiment(ledger, { ...entry, date: entry.at.slice(0, 10), tags: tagsOf(entry) });
    recorded.add(key);
  }
}

function saveOutcome(context, fields) {
  const { candidate, release, deps, ledger, journal, now } = context;
  const entry = {
    selection: context.selection,
    candidate: candidate.key,
    title: fields.title ?? candidate.text,
    evidence: [candidate.ref],
    at: new Date(now()).toISOString(),
    ...fields,
    fingerprint: fields.fingerprint ?? `candidate-${candidate.key}`,
    lesson: `${fields.verdict}: ${fields.lesson}\nRelease: ${release}.`,
  };

  deps.record(entry);
  flushJournal(ledger, [...journal.filter((item) => item.candidate !== entry.candidate), entry]);

  return entry;
}

const seenPatch = (context, fingerprint) =>
  context.journal.some((entry) => entry.fingerprint === fingerprint) ||
  readExperiments(context.ledger).some((entry) => entry.tags.includes(`fingerprint:${fingerprint}`));

function failedMeasurement(result, remaining) {
  if (remaining <= 0 || ['deadline', 'budget'].includes(result?.plan?.stop)) return 'budget';

  if (result?.results?.some((run) => run.timedOut)) return 'timeout';

  if (result?.plan?.stop === 'served' || result?.results?.some((run) => run.status === 'error' || !run.servedBy))
    return 'error';

  return 'rejected';
}

function measured(context, change, fingerprint) {
  const { deps } = context;

  if (seenPatch(context, fingerprint))
    return { verdict: 'recorded', fingerprint, lesson: 'The ledger already records this change.' };

  const tune = deps.compare({ split: 'tune', milliseconds: Math.min(8 * 60_000, deps.remaining()) });

  if (deps.remaining() <= 0 || !completeComparison(tune))
    return {
      verdict: failedMeasurement(tune, deps.remaining()),
      title: change.title,
      fingerprint,
      evidence: [context.candidate.ref, tune.run].filter(Boolean),
      lesson: `Tune did not finish cleanly.\n${tune.report ?? ''}`,
    };

  const heldout = deps.compare({ split: 'heldout', milliseconds: deps.remaining() });
  const report = `Tune comparison\n\n${tune.report}\n\nHeld-out comparison\n\n${heldout.report}`;
  const win = deps.remaining() > 0 && heldoutWin(heldout);
  const verdict = win ? 'kept' : failedMeasurement(heldout, deps.remaining());
  const entry = saveOutcome(context, {
    verdict,
    fingerprint,
    title: change.title,
    evidence: [context.candidate.ref, tune.run, heldout.run].filter(Boolean),
    lesson: report,
  });

  if (!win) return entry;

  deps.publish({ ...change, kind: 'harness' }, { weakness: context.candidate.text, measured: report });

  return entry;
}

export function runExperiment(context) {
  const { deps } = context;
  let fingerprint;

  try {
    const proposal = deps.propose();

    if (!proposal.ok) throw new Error(String(proposal.error));

    if (proposal.output.changed) fingerprint = deps.fingerprint();

    if (deps.remaining() <= 0)
      return saveOutcome(context, {
        verdict: 'budget',
        fingerprint,
        lesson: 'The proposal used the experiment deadline.',
      });

    if (!proposal.output.changed)
      return saveOutcome(context, { verdict: 'rejected', lesson: proposal.output.notes || 'No change proposed.' });

    const result = measured(context, proposal.output, fingerprint);

    return result.at ? result : saveOutcome(context, result);
  } catch (error) {
    const verdict = error.code === 'budget' || deps.remaining() <= 0 ? 'budget' : 'error';

    return saveOutcome(context, { verdict, fingerprint, lesson: error.message });
  }
}
