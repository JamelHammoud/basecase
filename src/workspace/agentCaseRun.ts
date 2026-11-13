import { CASE_RUNS, type CaseRuns } from '../cases/caseRuns';
import { filmImage } from '../cases/filmImage';
import { readCases, type Case } from '../cases/schema';
import { caseStatus, passesNeeded } from '../readiness/caseChecks';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { caseVerdict, type CaseVerdict } from './caseChecks';
import type { Cases } from './useCases';
import { plural } from '../../electron/plural.mjs';

type Payload = Record<string, unknown>;

const MAX_RUNS = 100;
const NAMED_FAILURES = 3;

export interface RunCaseContext {
  cases: Pick<Cases, 'active'>;
  parts: () => ScenePart[];
  project: () => ProjectSettings;
  viewport: () => Viewport3DHandle | null;
  setAction: (action: string) => void;
}

const runsOf = (payload: Payload) => {
  const n = Number(payload.runs);

  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_RUNS) : CASE_RUNS;
};

export function caseNamed(cases: Case[], wanted: string): Case | null {
  const key = wanted.trim().toLowerCase();

  return cases.find((c) => c.id === wanted) ?? cases.find((c) => c.name.toLowerCase() === key) ?? null;
}

function pickCase(cases: Case[], payload: Payload, active: Case | null): Case | string {
  const wanted = typeof payload.id === 'string' && payload.id.trim() ? payload.id : null;
  const known = cases.map((c) => `${c.name} (${c.id})`).join(', ');

  if (!cases.length) return 'This scene has no Cases. Make one with create_case first.';

  const kase = wanted ? caseNamed(cases, wanted) : (active ?? (cases.length === 1 ? cases[0] : null));

  if (kase) return kase;

  return wanted ? `No Case ${wanted} in this scene. Its Cases: ${known}.` : `Name the Case to run: ${known}.`;
}

const margin = (n: number) => (Math.round(n * 100) / 100).toString();

function failureLine(runs: CaseRuns): string {
  const named = runs.failures
    .slice(0, NAMED_FAILURES)
    .map((f) => `${f.label} (${f.runs} of ${plural(runs.runs, 'run')})`);

  return named.length ? ` Failed most: ${named.join(', ')}.` : '';
}

export function runCaseText(kase: Pick<Case, 'name'>, runs: CaseRuns, cached: boolean): string {
  if (runs.refusal) {
    const why = runs.misfit ? "can't enter it" : "can't run it";

    return `Case ${kase.name}: the robot ${why}. ${runs.refusal} Change the design so it does, then run_case again.`;
  }

  const needed = passesNeeded(runs.runs);
  const head = `Case ${kase.name}: passed ${runs.passes} of ${runs.runs} randomized runs (friction, mass, servo strength and delay varied); median margin ${margin(runs.medianMargin)}.`;
  const reuse = cached ? ' Same result as its Checks row: the robot hasn’t changed since it ran.' : '';
  const verdict =
    caseStatus(runs) === 'pass'
      ? ' It passes.'
      : ` It needs ${needed} of ${runs.runs}. Change the design for the failures above, then run_case again.`;

  return `${head}${failureLine(runs)}${verdict}${reuse}`;
}

async function worstFilm(verdict: CaseVerdict) {
  const { worstSeed, refusal } = verdict.runs;

  if (worstSeed === null || refusal) return [];

  const shot = await verdict.film(worstSeed).catch(() => null);
  const dataUrl = shot ? await filmImage(shot).catch(() => null) : null;

  return dataUrl ? [{ view: `The worst run (seed ${worstSeed}): start, middle and end.`, dataUrl }] : [];
}

export async function runCase(payload: Payload, ctx: RunCaseContext) {
  const kase = pickCase(readCases(ctx.project().cases), payload, ctx.cases.active);

  if (typeof kase === 'string') return { ok: false, problem: kase };

  const viewport = ctx.viewport();

  if (!viewport) return { ok: false, problem: 'The scene isn’t open, so the Case can’t run.' };

  ctx.setAction('Running the Case');

  const runs = runsOf(payload);
  const input = {
    parts: ctx.parts(),
    project: ctx.project(),
    measures: await viewport.measureParts(),
    partTriangles: viewport.partTriangles,
  };
  const verdict = await caseVerdict(input, kase, runs).catch((e: unknown) =>
    e instanceof Error ? e.message : String(e),
  );

  if (typeof verdict === 'string') return { ok: false, problem: `The runs stopped: ${verdict} Run it again.` };

  const { passes, medianMargin, failures, refusal } = verdict.runs;
  const data = {
    id: kase.id,
    name: kase.name,
    runs: verdict.runs.runs,
    passes,
    status: caseStatus(verdict.runs),
    medianMargin,
    failures: failures.slice(0, NAMED_FAILURES),
    refusal,
    cached: verdict.cached,
  };

  return { text: runCaseText(kase, verdict.runs, verdict.cached), images: await worstFilm(verdict), data };
}
