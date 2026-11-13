import type { WalkPick, WireRobot } from '../cases/caseCheckJob';
import type { FilmShot } from '../cases/filmstrip';
import { caseCheckPool } from '../cases/caseChecksClient';
import { CASE_RUNS, seedBatches, summarizeRuns, type CaseRuns } from '../cases/caseRuns';
import { readCases, type Case } from '../cases/schema';
import { readinessFingerprint } from '../readiness/readiness';
import { caseRow, replacedRow, stoppedRow } from '../readiness/caseChecks';
import type { VelocityDrive } from '../sim/driveAccess';
import type { Skill } from '../skills/artifacts';
import type { PolicySpec } from '../sim/policy';
import { hashOf } from '../skills/hash';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { CheckRow } from '../utils/engineeringTypes';
import { platformBridge } from '../utils/platformBridge';

export interface CaseChecksInput {
  parts: ScenePart[];
  project: ProjectSettings;
  measures: Record<string, MeshMeasure | undefined>;
  partTriangles: (id: string) => Float32Array | null;
  turn: number;
}

interface ModelReading {
  geometry: string;
  walks: string;
  modelHash: string;
  walk: WalkPick | null;
  stop: string | null;
}

interface RobotReading {
  modelHash: string;
  walk: VelocityDrive | null;
  walkHash: string;
  stop: string | null;
}

const KEPT_VERDICTS = 64;
const verdicts = new Map<string, CaseRuns>();
const inFlight = new Map<string, Promise<CaseRuns>>();
const policies = new Map<string, Promise<PolicySpec | null>>();
let lastModel: ModelReading | null = null;
let turns = 0;

export const nextCaseTurn = () => ++turns;

const isSkill = (value: unknown): value is Skill =>
  typeof value === 'object' && value !== null && (value as { format?: unknown }).format === 'basecase-skill';

const walkRecords = (project: ProjectSettings) => (project.skills ?? []).filter((r) => r.kit === 'velocity-tracking');

function policyOf(hash: string): Promise<PolicySpec | null> {
  const known = policies.get(hash);

  if (known) return known;

  const loading = platformBridge
    .getSkill(hash)
    .then((skill) => (isSkill(skill) && skill.controller.kind === 'policy' ? skill.controller.policy : null));

  loading.catch(() => policies.delete(hash));
  policies.set(hash, loading);

  return loading;
}

function wireRobot(input: CaseChecksInput): WireRobot {
  const triangles: Record<string, Float32Array> = {};

  for (const p of input.parts) {
    const t = input.partTriangles(p.id);

    if (t) triangles[p.id] = t;
  }

  return { id: 'scene', parts: input.parts, joints: input.project.joints ?? [], measures: input.measures, triangles };
}

async function readModel(input: CaseChecksInput, robot: () => WireRobot): Promise<ModelReading> {
  const records = walkRecords(input.project);
  const geometry = readinessFingerprint(input.parts, { joints: input.project.joints });
  const walks = hashOf(records);

  if (lastModel?.geometry === geometry && lastModel.walks === walks) return lastModel;

  if (isNewest(input.turn)) caseCheckPool.keepOnly(new Set());

  const reply = await caseCheckPool.run(0, { type: 'model', robot: robot(), walks: records }, { first: true });

  lastModel = { geometry, walks, modelHash: reply.modelHash, walk: reply.walk, stop: reply.stop };

  return lastModel;
}

async function readRobot(input: CaseChecksInput, robot: () => WireRobot): Promise<RobotReading> {
  const { modelHash, walk: pick, stop } = await readModel(input, robot);
  const policy = pick ? await policyOf(pick.hash).catch(() => null) : null;

  if (!pick || !policy) return { modelHash, walk: null, walkHash: '', stop };

  return { modelHash, walk: { policy, topSpeed: pick.topSpeed }, walkHash: pick.hash, stop };
}

interface Judging {
  kase: Case;
  key: string;
  reading: RobotReading;
  robot: () => WireRobot;
  runs?: number;
  tag?: string;
}

async function judge({ kase, key, reading, robot, runs = CASE_RUNS, tag = key }: Judging): Promise<CaseRuns> {
  const wire = robot();
  const batches = seedBatches(runs, caseCheckPool.size);
  const job = { type: 'runs' as const, kase, modelHash: reading.modelHash, walk: reading.walk, stop: reading.stop };
  const replies = await Promise.all(
    batches.map((seeds, i) => caseCheckPool.run(i, { ...job, seeds }, { tag, robot: () => wire })),
  );

  return summarizeRuns(replies.map((r) => r.result));
}

function remember(key: string, runs: CaseRuns) {
  verdicts.delete(key);
  verdicts.set(key, runs);

  for (const old of verdicts.keys()) {
    if (verdicts.size <= KEPT_VERDICTS) break;

    verdicts.delete(old);
  }
}

function verdictOf(judging: Judging): Promise<CaseRuns> {
  const { key } = judging;
  const known = verdicts.get(key);

  if (known) {
    remember(key, known);

    return Promise.resolve(known);
  }

  const running =
    inFlight.get(key) ??
    judge(judging)
      .then((runs) => {
        remember(key, runs);

        return runs;
      })
      .finally(() => inFlight.delete(key));

  inFlight.set(key, running);

  return running;
}

const verdictKey = (kase: Case, reading: RobotReading) => `${hashOf(kase)}|${reading.modelHash}|${reading.walkHash}`;

const isNewest = (turn: number) => turn === turns;

function sharedVerdict(kase: Case, key: string): Promise<CheckRow> {
  const shared = verdicts.get(key) ?? inFlight.get(key);

  if (!shared) return Promise.resolve(replacedRow(kase));

  return Promise.resolve(shared).then(
    (runs) => caseRow(kase, runs),
    () => replacedRow(kase),
  );
}

function rowOf(input: CaseChecksInput, kase: Case, verdict: Promise<CaseRuns>): Promise<CheckRow> {
  return verdict.then(
    (runs) => caseRow(kase, runs),
    () => (isNewest(input.turn) ? stoppedRow(kase) : replacedRow(kase)),
  );
}

export async function caseCheckRows(input: CaseChecksInput): Promise<CheckRow[]> {
  const cases = readCases(input.project.cases);

  if (!cases.length && isNewest(input.turn)) caseCheckPool.keepOnly(new Set());

  if (!cases.length) return [];

  let wired: WireRobot | null = null;
  const robot = () => (wired ??= wireRobot(input));
  const reading = await readRobot(input, robot).catch(() => null);

  if (!reading) return cases.map(isNewest(input.turn) ? stoppedRow : replacedRow);

  const keyed = cases.map((kase) => ({ kase, key: verdictKey(kase, reading) }));

  if (!isNewest(input.turn)) return Promise.all(keyed.map(({ kase, key }) => sharedVerdict(kase, key)));

  caseCheckPool.keepOnly(new Set(keyed.map((k) => k.key)));

  return Promise.all(keyed.map(({ kase, key }) => rowOf(input, kase, verdictOf({ kase, key, reading, robot }))));
}

export interface CaseVerdict {
  runs: CaseRuns;
  cached: boolean;
  film: (seed: number) => Promise<FilmShot | null>;
}

const NEVER_NEWEST = -1;

export async function caseVerdict(
  input: Omit<CaseChecksInput, 'turn'>,
  kase: Case,
  runs = CASE_RUNS,
): Promise<CaseVerdict> {
  let wired: WireRobot | null = null;
  const robot = () => (wired ??= wireRobot({ ...input, turn: NEVER_NEWEST }));
  const reading = await readRobot({ ...input, turn: NEVER_NEWEST }, robot);
  const key = runs === CASE_RUNS ? verdictKey(kase, reading) : `${verdictKey(kase, reading)}|${runs}`;
  const cached = verdicts.has(key) || inFlight.has(key);
  const judged = await verdictOf({ kase, key, reading, robot, runs, tag: '' });
  const film = async (seed: number) => {
    const job = { type: 'replay' as const, kase, modelHash: reading.modelHash, seed, walk: reading.walk };

    return (await caseCheckPool.run(0, job, { robot })).film;
  };

  return { runs: judged, cached, film };
}
