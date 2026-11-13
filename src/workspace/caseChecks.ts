import type { WalkOffer, WireRobot } from '../cases/caseCheckJob';
import { caseCheckPool } from '../cases/caseChecksClient';
import { CASE_RUNS, seedBatches, summarizeRuns, type CaseRuns } from '../cases/caseRuns';
import { readCases, type Case } from '../cases/schema';
import { readinessFingerprint } from '../readiness/readiness';
import { caseRow, stoppedRow } from '../readiness/caseChecks';
import type { VelocityDrive } from '../sim/driveAccess';
import type { Skill } from '../skills/artifacts';
import type { SkillRecord } from '../skills/skillRecords';
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

interface RobotReading {
  geometry: string;
  offer: string;
  modelHash: string;
  walk: VelocityDrive | null;
}

const KEPT_VERDICTS = 64;
const verdicts = new Map<string, CaseRuns>();
const inFlight = new Map<string, Promise<CaseRuns>>();
let lastRobot: RobotReading | null = null;
let turns = 0;

export const nextCaseTurn = () => ++turns;

const isSkill = (value: unknown): value is Skill =>
  typeof value === 'object' && value !== null && (value as { format?: unknown }).format === 'basecase-skill';

const offers = new Map<string, Promise<WalkOffer | null>>();

async function loadOffer(record: SkillRecord): Promise<WalkOffer | null> {
  const skill = await platformBridge.getSkill(record.hash).catch(() => null);

  return isSkill(skill) && skill.controller.kind === 'policy' ? { record, policy: skill.controller.policy } : null;
}

function walkOffer(project: ProjectSettings): Promise<WalkOffer | null> {
  const record = (project.skills ?? [])
    .filter((r) => r.kit === 'velocity-tracking' && r.evidence?.passed)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (!record) return Promise.resolve(null);

  const known = offers.get(record.hash) ?? loadOffer(record);

  offers.set(record.hash, known);

  return known;
}

function wireRobot(input: CaseChecksInput): WireRobot {
  const triangles: Record<string, Float32Array> = {};

  for (const p of input.parts) {
    const t = input.partTriangles(p.id);

    if (t) triangles[p.id] = t;
  }

  return { id: 'scene', parts: input.parts, joints: input.project.joints ?? [], measures: input.measures, triangles };
}

async function readRobot(input: CaseChecksInput, robot: () => WireRobot): Promise<RobotReading> {
  const offer = await walkOffer(input.project);
  const geometry = readinessFingerprint(input.parts, { joints: input.project.joints });
  const offerKey = offer?.record.hash ?? '';

  if (lastRobot?.geometry === geometry && lastRobot.offer === offerKey) return lastRobot;

  const reply = await caseCheckPool.run(0, { type: 'model', robot: robot(), walk: offer }, { first: true });

  lastRobot = { geometry, offer: offerKey, modelHash: reply.modelHash, walk: reply.walk };

  return lastRobot;
}

async function judge(kase: Case, key: string, reading: RobotReading, robot: () => WireRobot): Promise<CaseRuns> {
  const wire = robot();
  const batches = seedBatches(CASE_RUNS, caseCheckPool.size);
  const job = { type: 'runs' as const, kase, modelHash: reading.modelHash, walk: reading.walk };
  const replies = await Promise.all(
    batches.map((seeds, i) => caseCheckPool.run(i, { ...job, seeds }, { tag: key, robot: () => wire })),
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

function verdictOf(kase: Case, key: string, reading: RobotReading, robot: () => WireRobot): Promise<CaseRuns> {
  const known = verdicts.get(key);

  if (known) {
    remember(key, known);

    return Promise.resolve(known);
  }

  const running =
    inFlight.get(key) ??
    judge(kase, key, reading, robot)
      .then((runs) => {
        remember(key, runs);

        return runs;
      })
      .finally(() => inFlight.delete(key));

  inFlight.set(key, running);

  return running;
}

const verdictKey = (kase: Case, reading: RobotReading) =>
  `${hashOf(kase)}|${reading.modelHash}|${reading.walk ? reading.offer : ''}`;

function supersedes(turn: number, keys: string[]): boolean {
  if (turn !== turns) return false;

  caseCheckPool.keepOnly(new Set(keys));

  return true;
}

export async function caseCheckRows(input: CaseChecksInput): Promise<CheckRow[]> {
  const cases = readCases(input.project.cases);

  if (!cases.length) {
    supersedes(input.turn, []);

    return [];
  }

  let wired: WireRobot | null = null;
  const robot = () => (wired ??= wireRobot(input));
  const reading = await readRobot(input, robot).catch(() => null);
  const keyed = reading ? cases.map((kase) => ({ kase, key: verdictKey(kase, reading) })) : [];

  if (
    !reading ||
    !supersedes(
      input.turn,
      keyed.map((k) => k.key),
    )
  )
    return cases.map(stoppedRow);

  return Promise.all(
    keyed.map(({ kase, key }) =>
      verdictOf(kase, key, reading, robot).then(
        (runs) => caseRow(kase, runs),
        () => stoppedRow(kase),
      ),
    ),
  );
}
