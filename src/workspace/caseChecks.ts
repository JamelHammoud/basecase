import type { WalkPick, WireRobot } from '../cases/caseCheckJob';
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

export interface CaseRobotInput {
  parts: ScenePart[];
  project: ProjectSettings;
  measures: Record<string, MeshMeasure | undefined>;
  partTriangles: (id: string) => Float32Array | null;
}

export interface CaseChecksInput extends CaseRobotInput {
  turn: number;
}

interface ModelReading {
  geometry: string;
  walks: string;
  modelHash: string;
  walk: WalkPick | null;
}

interface RobotReading {
  modelHash: string;
  walk: VelocityDrive | null;
  walkHash: string;
}

const KEPT_VERDICTS = 64;
const KEPT_MODELS = 8;
const models = new Map<string, ModelReading>();
const verdicts = new Map<string, CaseRuns>();
const inFlight = new Map<string, Promise<CaseRuns>>();
const policies = new Map<string, Promise<PolicySpec | null>>();
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

function wireRobot(input: CaseRobotInput): WireRobot {
  const triangles: Record<string, Float32Array> = {};

  for (const p of input.parts) {
    const t = input.partTriangles(p.id);

    if (t) triangles[p.id] = t;
  }

  return { id: 'scene', parts: input.parts, joints: input.project.joints ?? [], measures: input.measures, triangles };
}

function keepModel(key: string, reading: ModelReading) {
  models.delete(key);
  models.set(key, reading);

  for (const old of models.keys()) {
    if (models.size <= KEPT_MODELS) break;

    models.delete(old);
  }
}

async function readModel(input: CaseRobotInput, robot: () => WireRobot, turn: number | null): Promise<ModelReading> {
  const records = walkRecords(input.project);
  const geometry = readinessFingerprint(input.parts, { joints: input.project.joints });
  const walks = hashOf(records);
  const key = `${geometry}|${walks}`;
  const known = models.get(key);

  if (known) return known;

  if (turn !== null && isNewest(turn)) caseCheckPool.keepOnly(new Set());

  const reply = await caseCheckPool.run(0, { type: 'model', robot: robot(), walks: records }, { first: true });
  const reading = { geometry, walks, modelHash: reply.modelHash, walk: reply.walk };

  keepModel(key, reading);

  return reading;
}

async function readRobot(input: CaseRobotInput, robot: () => WireRobot, turn: number | null): Promise<RobotReading> {
  const { modelHash, walk: pick } = await readModel(input, robot, turn);
  const policy = pick ? await policyOf(pick.hash).catch(() => null) : null;

  if (!pick || !policy) return { modelHash, walk: null, walkHash: '' };

  return { modelHash, walk: { policy, topSpeed: pick.topSpeed }, walkHash: pick.hash };
}

interface Judging {
  kase: Case;
  key: string;
  reading: RobotReading;
  robot: () => WireRobot;
  tag?: string;
}

async function judge({ kase, reading, robot, tag }: Judging): Promise<CaseRuns> {
  const wire = robot();
  const batches = seedBatches(CASE_RUNS, caseCheckPool.size);
  const job = { type: 'runs' as const, kase, modelHash: reading.modelHash, walk: reading.walk };
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
  const reading = await readRobot(input, robot, input.turn).catch(() => null);

  if (!reading) return cases.map(isNewest(input.turn) ? stoppedRow : replacedRow);

  const keyed = cases.map((kase) => ({ kase, key: verdictKey(kase, reading) }));

  if (!isNewest(input.turn)) return Promise.all(keyed.map(({ kase, key }) => sharedVerdict(kase, key)));

  caseCheckPool.keepOnly(new Set(keyed.map((k) => k.key)));

  return Promise.all(
    keyed.map(({ kase, key }) => rowOf(input, kase, verdictOf({ kase, key, reading, robot, tag: key }))),
  );
}

export async function caseRunsOf(input: CaseRobotInput, kase: Case): Promise<CaseRuns> {
  let wired: WireRobot | null = null;
  const robot = () => (wired ??= wireRobot(input));
  const reading = await readRobot(input, robot, null);

  return verdictOf({ kase, key: verdictKey(kase, reading), reading, robot });
}
