import { evaluateContract, type Contract, type Trace } from './contract';
import { reviseIntent, compileIntent, type IntentSession } from './anythingIntent';
import { TRACE_DT, type Poser } from './anythingPoser';
import { lowerSignal, lowerSpec, type LoweredContract } from './anythingSignals';
import type { Approval, IntentVerdict, Labelled, Proposal, SpecFormula, SpecState, TaskSpec } from './anythingTypes';

export const MAX_ROUNDS = 3;

const FIXES = 2;

export type ApprovalResult =
  | { kind: 'approved'; spec: TaskSpec; lowered: LoweredContract; rounds: number }
  | { kind: 'rejected'; reason: string }
  | { kind: 'deformable' | 'impossible'; reason: string };

interface Memory {
  verdict: IntentVerdict;
  known: Labelled[];
}

const memory = new Map<string, Memory>();

export interface ApprovalRun {
  session: IntentSession;
  poser: Poser;
  approve: (proposal: Proposal) => Promise<Approval>;
  key: string;
}

export function stateSignals(s: SpecState): string[] {
  if ('atom' in s) return [s.atom.sig];

  if ('within' in s) return [s.within.sig];

  if ('near' in s) return ['right', 'forward', 'up'].map((a) => `${s.near.part}.${a}`);

  if ('not' in s) return stateSignals(s.not);

  return ('all' in s ? s.all : s.any).flatMap(stateSignals);
}

function childFormulas(f: SpecFormula): SpecFormula[] {
  if ('sequence' in f) return f.sequence;

  if ('all' in f) return f.all;

  return 'any' in f ? f.any : [];
}

function formulaSignals(f: SpecFormula): string[] {
  if ('always' in f) return stateSignals(f.always.state);

  if ('eventually' in f) return stateSignals(f.eventually.state);

  if ('hold_for' in f) return stateSignals(f.hold_for.state);

  return childFormulas(f).flatMap(formulaSignals);
}

export function specSignals(spec: TaskSpec): string[] {
  return [...new Set([spec.success, ...spec.failures.map((f) => f.formula)].flatMap(formulaSignals))];
}

function virtualSeries(spec: TaskSpec, poser: Poser, trace: Trace): Array<{ sig: string; values: number[] }> {
  return specSignals(spec).map((sig) => {
    const l = lowerSignal(sig, poser.facts);
    const real = trace.signals[l.name] ?? [];
    const values = real.map((v) => (l.delta ? (v - real[0]) / l.gain : (v - l.offset) / l.gain));

    return { sig, values };
  });
}

export function rolloutTable(spec: TaskSpec, poser: Poser, trace: Trace): string {
  const every = Math.max(1, Math.round(0.5 / trace.dt));
  const series = virtualSeries(spec, poser, trace);
  const n = series[0]?.values.length ?? 0;
  const rows = Array.from({ length: n }, (_, i) => i).filter((i) => i % every === 0 || i === n - 1);
  const header = ['t', ...series.map((s) => s.sig)].join('\t');
  const lines = rows.map((i) => [(i * trace.dt).toFixed(2), ...series.map((s) => s.values[i].toFixed(3))].join('\t'));

  return [header, ...lines].join('\n');
}

async function judges(contract: Contract, trace: Trace) {
  try {
    return await evaluateContract(contract, trace);
  } catch {
    return null;
  }
}

function frameTrace(poser: Poser, lowered: LoweredContract, frames: ArrayLike<number>[]) {
  return poser.trace(frames, TRACE_DT, lowered.signals);
}

async function labelProblem(options: { spec: TaskSpec; poser: Poser; lowered: LoweredContract; rollout: Labelled }) {
  const { spec, poser, lowered, rollout } = options;
  const trace = frameTrace(poser, lowered, rollout.qpos);
  const result = await judges(lowered.contract, trace);

  if (result && result.passed === rollout.pass) return null;

  const said = result?.passed ? 'passes' : 'fails';
  const failed = result?.failed.length ? ` (failures fired: ${result.failed.join(', ')})` : '';

  return `${rollout.name} should ${rollout.pass ? 'pass' : 'fail'}, but your contract ${said} it${failed}. Its signals:\n${rolloutTable(spec, poser, trace)}`;
}

export async function selfProblems(spec: TaskSpec, poser: Poser, known: Labelled[]): Promise<string[]> {
  const lowered = lowerSpec(spec, poser.facts);
  const { frames, miss } = poser.frames(spec.intent, spec.seconds);
  const rest = [poser.facts.rest, ...frames.map(() => poser.facts.rest)].slice(0, frames.length);
  const own: Labelled[] = [
    { name: 'Your intent motion', dt: TRACE_DT, qpos: frames, pass: true },
    ...(spec.restIsGoal ? [] : [{ name: 'Staying at rest', dt: TRACE_DT, qpos: rest, pass: false }]),
  ];
  const problems: string[] =
    miss > 0.005
      ? [`Your intent asks for a part position the robot can't reach (off by ${(miss * 1000).toFixed(0)} mm).`]
      : [];

  for (const rollout of [...own, ...known]) {
    const problem = await labelProblem({ spec, poser, lowered, rollout });

    if (problem) problems.push(problem);
  }

  return problems;
}

async function consistent(run: ApprovalRun, spec: TaskSpec, known: Labelled[]): Promise<IntentVerdict> {
  let current: IntentVerdict = spec;

  for (let fix = 0; fix < FIXES && current.kind === 'task'; fix++) {
    const problems = await selfProblems(current, run.poser, known);

    if (!problems.length) return current;

    current = (await reviseIntent(run.session, { previous: current, feedback: problems.join('\n\n') })).verdict;
  }

  return current;
}

function rejectionFeedback(options: { spec: TaskSpec; poser: Poser; answer: Approval; rollout: Labelled }) {
  const { spec, poser, answer, rollout } = options;
  const lowered = lowerSpec(spec, poser.facts);
  const trace = frameTrace(poser, lowered, rollout.qpos);
  const note = answer.approved ? '' : answer.note;

  return `The person rejected your contract: "${note}" They showed this motion, which ${rollout.pass ? 'should pass' : 'should fail'} and your contract judges the other way. Its signals:\n${rolloutTable(spec, poser, trace)}`;
}

async function proposalRounds(run: ApprovalRun, first: TaskSpec, mem: Memory): Promise<ApprovalResult> {
  let spec: IntentVerdict = first;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    spec = await consistent(run, spec as TaskSpec, mem.known);

    if (spec.kind !== 'task') return spec;

    const lowered = lowerSpec(spec, run.poser.facts);
    const answer = await run.approve({ contract: lowered.contract, signals: lowered.signals });

    if (answer.approved) {
      mem.verdict = spec;

      return { kind: 'approved', spec, lowered, rounds: round };
    }

    if (!answer.rollout || round === MAX_ROUNDS || run.session.signal?.aborted)
      return { kind: 'rejected', reason: `The contract wasn't approved: ${answer.note}` };

    const rollout = { ...answer.rollout, pass: answer.shouldPass === true, name: `Example ${mem.known.length + 1}` };

    mem.known.push(rollout);

    const feedback = rejectionFeedback({ spec, poser: run.poser, answer, rollout });

    spec = (await reviseIntent(run.session, { previous: spec, feedback })).verdict;

    if (spec.kind !== 'task') return spec;
  }

  return { kind: 'rejected', reason: 'The contract wasn’t approved.' };
}

export async function approvedSpec(run: ApprovalRun): Promise<ApprovalResult> {
  const known = memory.get(run.key);
  const mem: Memory = known ?? { verdict: (await compileIntent(run.session)).verdict, known: [] };

  memory.set(run.key, mem);

  if (mem.verdict.kind !== 'task') return mem.verdict;

  return proposalRounds(run, mem.verdict, mem);
}
