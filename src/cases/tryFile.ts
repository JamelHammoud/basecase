import { FAULT_KINDS, type RecordedFault } from '../sim/faults';
import { RECORD_HZ } from '../sim/recorder';
import { CASE_FORMAT_VERSION } from './schema';
import type { TryRecord } from './tries';

export const TRY_FILE_VERSION = 1;

export const TRY_SOURCES = ['case', 'generated', 'real', 'import'] as const;

export type TrySource = (typeof TRY_SOURCES)[number];

export const TRY_SOURCE_BADGE: Record<TrySource, string | null> = {
  case: null,
  generated: 'Variation',
  real: 'Real',
  import: null,
};

export type TryVerdict = 'passed' | 'failed' | 'unjudged';

export interface TryOutcome {
  verdict: TryVerdict;
  margin: number | null;
}

export type TryOrigin = { kind: 'hub'; repo: string; revision: string } | { kind: 'file'; name: string; hash: string };

export interface TryVideo {
  camera: string;
  path: string;
  from: number;
  to: number;
}

export const originLabel = (origin: TryOrigin | undefined) => {
  if (!origin) return null;

  return origin.kind === 'hub' ? origin.repo : origin.name;
};

export interface StoredTry {
  version: typeof TRY_FILE_VERSION;
  id: string;
  sceneId: string;
  robot: { name: string; modelHash: string; joints: string[] };
  case: { id: string; name: string; hash: string } | null;
  source: TrySource;
  input: string | null;
  startedAt: string;
  seconds: number;
  rate: number;
  frames: number;
  outcome: TryOutcome;
  seed: number;
  sourceTry: string | null;
  faults: RecordedFault[];
  commands?: number;
  world?: number;
  origin?: TryOrigin;
  task?: string | null;
  videos?: TryVideo[];
  outOfRange?: number;
}

export interface TrySummary {
  id: string;
  sceneId: string;
  robot: string;
  modelHash: string;
  caseId: string | null;
  caseName: string | null;
  source: TrySource;
  input: string | null;
  startedAt: string;
  seconds: number;
  frames: number;
  outcome: TryOutcome;
  seed: number;
  sourceTry: string | null;
  origin: string | null;
  task: string | null;
  recording: boolean;
  strip: boolean;
}

export interface TryContext {
  sceneId: string;
  caseName: string;
  joints: string[];
  input?: string | null;
}

const sourceOf = (record: TryRecord): TrySource => {
  if (record.generated) return 'generated';

  return record.real ? 'real' : 'case';
};

const inputOf = (record: TryRecord, context: TryContext) => {
  if (context.input !== undefined) return context.input;

  if (record.generated) return 'script';

  return record.real ? 'mat' : null;
};

export function storedTryOf(record: TryRecord, context: TryContext): StoredTry {
  const { manifest } = record;

  return {
    version: TRY_FILE_VERSION,
    id: record.id,
    sceneId: context.sceneId,
    robot: { name: record.robot, modelHash: manifest.modelHash, joints: context.joints },
    case: { id: record.caseId, name: context.caseName, hash: manifest.caseHash },
    source: sourceOf(record),
    input: inputOf(record, context),
    startedAt: record.at,
    seconds: record.seconds,
    rate: manifest.dt > 0 ? Math.round(1 / manifest.dt) : RECORD_HZ,
    frames: manifest.frames,
    outcome: { verdict: record.passed ? 'passed' : 'failed', margin: record.margin },
    seed: manifest.seed,
    sourceTry: manifest.source ?? null,
    faults: manifest.faults ?? [],
    ...(manifest.commands !== undefined ? { commands: manifest.commands } : {}),
    ...(manifest.world !== undefined ? { world: manifest.world } : {}),
  };
}

export function tryRecordOf(stored: StoredTry): TryRecord {
  return {
    id: stored.id,
    caseId: stored.case?.id ?? '',
    robot: stored.robot.name,
    at: stored.startedAt,
    passed: stored.outcome.verdict === 'passed',
    margin: stored.outcome.margin ?? 0,
    seconds: stored.seconds,
    manifest: {
      formatVersion: CASE_FORMAT_VERSION,
      caseHash: stored.case?.hash ?? '',
      modelHash: stored.robot.modelHash,
      seed: stored.seed,
      frames: stored.frames,
      dt: 1 / stored.rate,
      faults: stored.faults,
      ...(stored.commands !== undefined ? { commands: stored.commands } : {}),
      ...(stored.world !== undefined ? { world: stored.world } : {}),
      ...(stored.sourceTry ? { source: stored.sourceTry } : {}),
    },
    ...(stored.source === 'generated' ? { generated: true as const } : {}),
    ...(stored.source === 'real' ? { real: true as const } : {}),
  };
}

export const summaryRecord = (summary: TrySummary): TryRecord =>
  tryRecordOf({
    version: TRY_FILE_VERSION,
    id: summary.id,
    sceneId: summary.sceneId,
    robot: { name: summary.robot, modelHash: summary.modelHash, joints: [] },
    case: summary.caseId ? { id: summary.caseId, name: summary.caseName ?? '', hash: '' } : null,
    source: summary.source,
    input: summary.input,
    startedAt: summary.startedAt,
    seconds: summary.seconds,
    rate: summary.frames > 0 && summary.seconds > 0 ? Math.round(summary.frames / summary.seconds) : RECORD_HZ,
    frames: summary.frames,
    outcome: summary.outcome,
    seed: summary.seed,
    sourceTry: summary.sourceTry,
    faults: [],
  });

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = 512): v is string => typeof v === 'string' && v.length <= max;
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const SAFE_ID = /^[\w-]{1,128}$/;
const isId = (v: unknown): v is string => typeof v === 'string' && SAFE_ID.test(v);
const optionalCount = (v: unknown) => v === undefined || isCount(v);

function readOutcome(v: unknown): TryOutcome | null {
  if (!isObject(v) || !['passed', 'failed', 'unjudged'].includes(v.verdict as string)) return null;

  if (v.margin !== null && !isNum(v.margin)) return null;

  return { verdict: v.verdict as TryVerdict, margin: v.margin as number | null };
}

function readFault(v: unknown): RecordedFault | null {
  if (!isObject(v) || !isText(v.joint, 128) || !FAULT_KINDS.includes(v.kind as RecordedFault['kind'])) return null;

  if (!isNum(v.at) || (v.until !== undefined && !isNum(v.until))) return null;

  return {
    joint: v.joint,
    kind: v.kind as RecordedFault['kind'],
    at: v.at,
    ...(isNum(v.until) ? { until: v.until } : {}),
  };
}

function readRobot(v: unknown): StoredTry['robot'] | null {
  if (!isObject(v) || !isText(v.name) || !isText(v.modelHash, 128)) return null;

  if (!Array.isArray(v.joints) || !v.joints.every((j) => isText(j, 128))) return null;

  return { name: v.name, modelHash: v.modelHash, joints: v.joints as string[] };
}

function readCase(v: unknown): StoredTry['case'] | undefined {
  if (v === null) return null;

  if (!isObject(v) || !isText(v.id, 128) || !isText(v.name) || !isText(v.hash, 128)) return undefined;

  return { id: v.id, name: v.name, hash: v.hash };
}

const hasIds = (v: Raw) =>
  v.version === TRY_FILE_VERSION &&
  isId(v.id) &&
  isId(v.sceneId) &&
  TRY_SOURCES.includes(v.source as TrySource) &&
  (v.input === null || isText(v.input, 64)) &&
  (v.sourceTry === null || isId(v.sourceTry));

const hasNumbers = (v: Raw) =>
  isText(v.startedAt, 64) &&
  isNum(v.seconds) &&
  isNum(v.rate) &&
  (v.rate as number) > 0 &&
  isCount(v.frames) &&
  isCount(v.seed) &&
  Array.isArray(v.faults) &&
  optionalCount(v.commands) &&
  optionalCount(v.world);

const MAX_VIDEOS = 32;
const HASH = /^[0-9a-f]{64}$/;

function readOrigin(v: unknown): TryOrigin | null | undefined {
  if (v === undefined) return undefined;

  if (!isObject(v)) return null;

  if (v.kind === 'hub' && isText(v.repo, 256) && isText(v.revision, 128)) {
    return { kind: 'hub', repo: v.repo, revision: v.revision };
  }

  const isFile = v.kind === 'file' && isText(v.name, 256) && typeof v.hash === 'string' && HASH.test(v.hash);

  return isFile ? { kind: 'file', name: v.name as string, hash: v.hash as string } : null;
}

const isVideo = (v: unknown): v is TryVideo =>
  isObject(v) && isText(v.camera, 256) && isText(v.path, 512) && isNum(v.from) && isNum(v.to);

const hasImportFields = (v: Raw) =>
  (v.task === undefined || v.task === null || isText(v.task, 1000)) &&
  (v.videos === undefined || (Array.isArray(v.videos) && v.videos.length <= MAX_VIDEOS && v.videos.every(isVideo))) &&
  optionalCount(v.outOfRange) &&
  readOrigin(v.origin) !== null;

export function readStoredTry(value: unknown): StoredTry | null {
  if (!isObject(value) || !hasIds(value) || !hasNumbers(value) || !hasImportFields(value)) return null;

  const robot = readRobot(value.robot);
  const kase = readCase(value.case);
  const outcome = readOutcome(value.outcome);
  const faults = (value.faults as unknown[]).map(readFault);

  if (!robot || kase === undefined || !outcome || faults.some((f) => !f)) return null;

  return {
    ...(value as unknown as StoredTry),
    robot,
    case: kase,
    outcome,
    faults: faults as RecordedFault[],
  };
}

export const summaryOf = (stored: StoredTry, held: { recording: boolean; strip: boolean }): TrySummary => ({
  id: stored.id,
  sceneId: stored.sceneId,
  robot: stored.robot.name,
  modelHash: stored.robot.modelHash,
  caseId: stored.case?.id ?? null,
  caseName: stored.case?.name ?? null,
  source: stored.source,
  input: stored.input,
  startedAt: stored.startedAt,
  seconds: stored.seconds,
  frames: stored.frames,
  outcome: stored.outcome,
  seed: stored.seed,
  sourceTry: stored.sourceTry,
  origin: originLabel(stored.origin),
  task: stored.task ?? null,
  ...held,
});
