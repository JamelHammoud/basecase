import type { WalkPick, WireRobot } from '../cases/caseCheckJob';
import type { FilmShot } from '../cases/filmstrip';
import { caseCheckPool } from '../cases/caseChecksClient';
import { faultKey, faultsOf, type CaseFault } from '../cases/caseFaults';
import { CASE_RUNS, seedBatches, summarizeRuns, type CaseRuns } from '../cases/caseRuns';
import { readCases, type Case } from '../cases/schema';
import { caseSensorKey } from '../cases/sensorIdentity';
import { readinessFingerprint } from '../readiness/readiness';
import { caseRow, faultRow, replacedRow, stoppedFault, stoppedRow } from '../readiness/caseChecks';
import type { VelocityDrive } from '../sim/driveAccess';
import type { Skill } from '../skills/artifacts';
import type { PolicySpec } from '../sim/policy';
import { hashOf } from '../skills/hash';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { SkillRecord } from '../skills/skillRecords';
import type { CaseFaultRow, CheckRow } from '../utils/engineeringTypes';
import { platformBridge } from '../utils/platformBridge';

export interface CaseRobotInput {
  parts: ScenePart[];
  project: ProjectSettings;
  measures: Record<string, MeshMeasure | undefined>;
  partTriangles: (id: string) => Float32Array | null;
  servoVolts?: number;
}

export interface CaseChecksInput extends CaseRobotInput {
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
const KEPT_MODELS = 8;
const models = new Map<string, ModelReading | Promise<ModelReading>>();
const verdicts = new Map<string, CaseRuns>();
const inFlight = new Map<string, Promise<CaseRuns>>();
const policies = new Map<string, Promise<PolicySpec | null>>();
let turns = 0;

export function nextCaseTurn(input?: Pick<CaseRobotInput, 'parts' | 'project'>) {
  turns += 1;

  if (input && !models.has(modelIdentity(input).key)) caseCheckPool.keepOnly(new Set());

  return turns;
}

export const forgetCaseModels = () => models.clear();

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

export function wireRobot(input: CaseRobotInput): WireRobot {
  const triangles: Record<string, Float32Array> = {};

  for (const p of input.parts) {
    const t = input.partTriangles(p.id);

    if (t) triangles[p.id] = t;
  }

  return {
    id: 'scene',
    selfContact: input.project.selfContact,
    parts: input.parts,
    joints: input.project.joints ?? [],
    measures: input.measures,
    triangles,
    servoVolts: input.servoVolts,
  };
}

function keepModel(key: string, reading: ModelReading | Promise<ModelReading>) {
  models.delete(key);
  models.set(key, reading);

  for (const old of models.keys()) {
    if (models.size <= KEPT_MODELS) break;

    models.delete(old);
  }
}

function modelIdentity(input: Pick<CaseRobotInput, 'parts' | 'project'>) {
  const geometry = readinessFingerprint(input.parts, {
    joints: input.project.joints,
    selfContact: input.project.selfContact,
    sensors: caseSensorKey(input.parts),
  });
  const walks = hashOf(walkRecords(input.project));
  const key = `${geometry}|${walks}`;

  return { geometry, walks, key };
}

async function readModel(input: CaseRobotInput, robot: () => WireRobot, turn: number | null): Promise<ModelReading> {
  const records = walkRecords(input.project);
  const { geometry, walks, key } = modelIdentity(input);
  const known = models.get(key);

  if (known) return known;

  if (turn !== null && isNewest(turn)) caseCheckPool.keepOnly(new Set());

  const loading = caseCheckPool.run(0, { type: 'model', robot: robot(), walks: records }, { first: true }).then(
    (reply) => {
      const reading = { geometry, walks, modelHash: reply.modelHash, walk: reply.walk, stop: reply.stop };

      if (models.get(key) === loading) keepModel(key, reading);

      return reading;
    },
    (error: unknown) => {
      if (models.get(key) === loading) models.delete(key);

      throw error;
    },
  );

  keepModel(key, loading);

  return loading;
}

async function readingOf({
  modelHash,
  walk: pick,
  stop,
}: Omit<ModelReading, 'geometry' | 'walks'>): Promise<RobotReading> {
  const policy = pick ? await policyOf(pick.hash).catch(() => null) : null;

  if (!pick || !policy) return { modelHash, walk: null, walkHash: '', stop };

  return { modelHash, walk: { policy, topSpeed: pick.topSpeed }, walkHash: pick.hash, stop };
}

async function readRobot(input: CaseRobotInput, robot: () => WireRobot, turn: number | null): Promise<RobotReading> {
  return readingOf(await readModel(input, robot, turn));
}

export interface CaseControl {
  policy: PolicySpec;
  jointNoiseDeg?: number;
}

interface Judging {
  kase: Case;
  key: string;
  reading: RobotReading;
  robot: () => WireRobot;
  runs?: number;
  tag?: string;
  control?: CaseControl | null;
  fault?: CaseFault;
}

async function judge(judging: Judging): Promise<CaseRuns> {
  const { kase, key, reading, robot, runs = CASE_RUNS, tag = key, control, fault } = judging;
  const wire = robot();
  const batches = seedBatches(runs, caseCheckPool.size);
  const job = {
    type: 'runs' as const,
    kase,
    modelHash: reading.modelHash,
    walk: reading.walk,
    stop: reading.stop,
    ...control,
    ...(fault ? { fault } : {}),
  };
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

const judged = (kase: Case) =>
  Object.fromEntries(Object.entries(kase).filter(([key]) => key !== 'console' && key !== 'faults'));

const verdictKey = (kase: Case, reading: RobotReading) =>
  `${hashOf(judged(kase))}|${reading.modelHash}|${reading.walkHash}`;

const controlKey = (control: CaseControl | null | undefined) =>
  control ? `|${hashOf(control.policy)}|${control.jointNoiseDeg ?? 0}` : '';

const faultedKey = (key: string, fault: CaseFault) => `${key}|fault:${faultKey(fault)}`;

const newestFirst = (a: SkillRecord, b: SkillRecord) => b.createdAt.localeCompare(a.createdAt);

export const caseSkillRecord = (project: ProjectSettings, caseId: string, modelHash: string) =>
  (project.skills ?? [])
    .filter((r) => r.case?.id === caseId && r.case.model === modelHash && r.evidence?.passed)
    .sort(newestFirst)[0] ?? null;

async function caseSkillControl(project: ProjectSettings, kase: Case, reading: RobotReading) {
  const record = caseSkillRecord(project, kase.id, reading.modelHash);
  const policy = record ? await policyOf(record.hash).catch(() => null) : null;

  return policy ? { policy } : null;
}

const isNewest = (turn: number) => turn === turns;

function sharedVerdict(key: string): Promise<CaseRuns | null> {
  const shared = verdicts.get(key) ?? inFlight.get(key);

  return shared ? Promise.resolve(shared).catch(() => null) : Promise.resolve(null);
}

const jointNameOf = (input: CaseChecksInput, fault: CaseFault) =>
  input.project.joints?.find((j) => j.id === fault.joint)?.name ?? fault.joint;

interface Keyed {
  kase: Case;
  key: string;
  control: CaseControl | null;
}

async function faultRows(input: CaseChecksInput, keyed: Keyed, reading: RobotReading, robot: () => WireRobot) {
  const { kase, key, control } = keyed;
  const newest = isNewest(input.turn);

  return Promise.all(
    faultsOf(kase).map(async (fault): Promise<CaseFaultRow> => {
      const name = jointNameOf(input, fault);
      const at = faultedKey(key, fault);
      const runs = newest
        ? await verdictOf({ kase, key: at, reading, robot, control, fault }).catch(() => null)
        : await sharedVerdict(at);

      return runs ? faultRow(fault, name, runs) : stoppedFault(fault, name, !isNewest(input.turn));
    }),
  );
}

async function rowOf(input: CaseChecksInput, keyed: Keyed, reading: RobotReading, robot: () => WireRobot) {
  const { kase, key, control } = keyed;
  const newest = isNewest(input.turn);
  const runs = newest ? verdictOf({ kase, key, reading, robot, control }) : sharedVerdict(key);
  const [base, faults] = await Promise.all([
    Promise.resolve(runs).then(
      (verdict) => (verdict ? caseRow(kase, verdict) : replacedRow(kase)),
      () => (isNewest(input.turn) ? stoppedRow(kase) : replacedRow(kase)),
    ),
    faultRows(input, keyed, reading, robot),
  ]);

  return faults.length ? { ...base, faults } : base;
}

export async function caseCheckRows(input: CaseChecksInput): Promise<CheckRow[]> {
  const cases = readCases(input.project.cases);

  if (!cases.length && isNewest(input.turn)) caseCheckPool.keepOnly(new Set());

  if (!cases.length) return [];

  let wired: WireRobot | null = null;
  const robot = () => (wired ??= wireRobot(input));
  const reading = await readRobot(input, robot, input.turn).catch(() => null);

  if (!reading) return cases.map(isNewest(input.turn) ? stoppedRow : replacedRow);

  const keyed = await Promise.all(
    cases.map(async (kase): Promise<Keyed> => {
      const control = await caseSkillControl(input.project, kase, reading);

      return { kase, control, key: `${verdictKey(kase, reading)}${controlKey(control)}` };
    }),
  );

  if (isNewest(input.turn))
    caseCheckPool.keepOnly(
      new Set(keyed.flatMap((k) => [k.key, ...faultsOf(k.kase).map((f) => faultedKey(k.key, f))])),
    );

  return Promise.all(keyed.map((k) => rowOf(input, k, reading, robot)));
}

export interface CaseVerdict {
  runs: CaseRuns;
  cached: boolean;
  modelHash: string;
  film: (seed: number) => Promise<FilmShot | null>;
  record: (seed: number) => Promise<import('../cases/seedReplay').SeedReplay>;
}

interface VerdictRequest {
  runs: number;
  given?: CaseControl;
  fault?: CaseFault;
}

async function verdictFor(input: CaseRobotInput, kase: Case, request: VerdictRequest): Promise<CaseVerdict> {
  const { runs, given, fault } = request;
  let wired: WireRobot | null = null;
  const robot = () => (wired ??= wireRobot(input));
  const reading = await readRobot(input, robot, null);
  const control = given ?? (await caseSkillControl(input.project, kase, reading));
  const own = `${verdictKey(kase, reading)}${controlKey(control)}`;
  const base = fault ? faultedKey(own, fault) : own;
  const key = runs === CASE_RUNS ? base : `${base}|${runs}`;
  const cached = verdicts.has(key) || inFlight.has(key);
  const judged = await verdictOf({ kase, key, reading, robot, runs, tag: '', control, fault });
  const job = { kase, modelHash: reading.modelHash, walk: reading.walk, ...control, ...(fault ? { fault } : {}) };
  const film = async (seed: number) => (await caseCheckPool.run(0, { type: 'replay', seed, ...job }, { robot })).film;
  const record = async (seed: number) =>
    (await caseCheckPool.run(0, { type: 'record', seed, ...job }, { robot })).replay;

  return { runs: judged, cached, modelHash: reading.modelHash, film, record };
}

export const caseVerdict = (input: CaseRobotInput, kase: Case, runs = CASE_RUNS, given?: CaseControl) =>
  verdictFor(input, kase, { runs, given });

export const caseFaultVerdict = (input: CaseRobotInput, kase: Case, fault: CaseFault) =>
  verdictFor(input, kase, { runs: CASE_RUNS, fault });

export async function exploreVerdict(input: CaseRobotInput, kase: Case, runs: number): Promise<CaseRuns> {
  const wire = wireRobot(input);
  const robot = () => wire;
  const model = await caseCheckPool.run(0, { type: 'model', robot: wire, walks: walkRecords(input.project) });
  const reading = await readingOf(model);

  return judge({ kase, key: '', reading, robot, runs, tag: '' });
}
