import type { RecordedFault } from '../sim/faults';
import type { SimJoint, SimModel } from '../sim/mjcfTypes';
import { CASE_FORMAT_VERSION, type Case } from './schema';
import { sha256, type TryRecord } from './tries';

export const STORED_TRY_VERSION = 1;

export type TrySource = 'case' | 'generated' | 'real';

export type TryResult = 'passed' | 'failed' | 'unjudged';

export type TryJoint = Pick<SimJoint, 'id' | 'name' | 'type' | 'drive' | 'actuator' | 'effort'>;

export interface StoredTry {
  version: typeof STORED_TRY_VERSION;
  id: string;
  sceneId: string;
  robot: { name: string; modelHash: string; joints: TryJoint[] };
  case: { id: string; name: string; hash: string; contractHash: string } | null;
  source: TrySource;
  input: string | null;
  at: string;
  seconds: number;
  rate: number;
  frames: number;
  outcome: { result: TryResult; margin: number };
  seed: number;
  sourceTry: string | null;
  faults: RecordedFault[];
  commands?: number;
  world?: number;
}

export interface TryRef {
  id: string;
}

export interface TryContext {
  sceneId: string;
  caseName: string;
  contractHash: string;
  joints: TryJoint[];
  input: string | null;
}

export const tryJoints = (model: SimModel | null): TryJoint[] =>
  (model?.joints ?? []).map(({ id, name, type, drive, actuator, effort }) => ({
    id,
    name,
    type,
    drive,
    actuator,
    effort,
  }));

export const contractHash = (kase: Case) => sha256(JSON.stringify(kase.task.contract));

const sourceOf = (record: TryRecord): TrySource => {
  if (record.real) return 'real';

  return record.generated ? 'generated' : 'case';
};

export function storedTry(record: TryRecord, context: TryContext): StoredTry {
  const { manifest } = record;

  return {
    version: STORED_TRY_VERSION,
    id: record.id,
    sceneId: context.sceneId,
    robot: { name: record.robot, modelHash: manifest.modelHash, joints: context.joints },
    case: { id: record.caseId, name: context.caseName, hash: manifest.caseHash, contractHash: context.contractHash },
    source: sourceOf(record),
    input: context.input,
    at: record.at,
    seconds: record.seconds,
    rate: 1 / manifest.dt,
    frames: manifest.frames,
    outcome: { result: record.passed ? 'passed' : 'failed', margin: record.margin },
    seed: manifest.seed,
    sourceTry: manifest.source ?? null,
    faults: manifest.faults ?? [],
    ...(manifest.commands === undefined ? {} : { commands: manifest.commands }),
    ...(manifest.world === undefined ? {} : { world: manifest.world }),
  };
}

export function recordOf(stored: StoredTry): TryRecord {
  return {
    id: stored.id,
    caseId: stored.case?.id ?? '',
    robot: stored.robot.name,
    at: stored.at,
    passed: stored.outcome.result === 'passed',
    margin: stored.outcome.margin,
    seconds: stored.seconds,
    manifest: {
      formatVersion: CASE_FORMAT_VERSION,
      caseHash: stored.case?.hash ?? '',
      modelHash: stored.robot.modelHash,
      seed: stored.seed,
      frames: stored.frames,
      dt: 1 / stored.rate,
      faults: stored.faults,
      ...(stored.commands === undefined ? {} : { commands: stored.commands }),
      ...(stored.world === undefined ? {} : { world: stored.world }),
      ...(stored.sourceTry === null ? {} : { source: stored.sourceTry }),
    },
    ...(stored.source === 'generated' ? { generated: true as const } : {}),
    ...(stored.source === 'real' ? { real: true as const } : {}),
  };
}

const isRecord = (ref: TryRef): ref is TryRecord => 'caseId' in ref && 'manifest' in ref;

export const legacyRecords = (refs: readonly TryRef[] | undefined): TryRecord[] => (refs ?? []).filter(isRecord);

export const refsOf = (refs: readonly TryRef[] | undefined): TryRef[] => (refs ?? []).map(({ id }) => ({ id }));

const records = new WeakMap<StoredTry, TryRecord>();

const cachedRecord = (stored: StoredTry) => {
  const known = records.get(stored);

  if (known) return known;

  const made = recordOf(stored);

  records.set(stored, made);

  return made;
};

const indexes = new WeakMap<readonly StoredTry[], Map<string, StoredTry>>();

const indexOf = (stored: readonly StoredTry[]) => {
  const known = indexes.get(stored);

  if (known) return known;

  const made = new Map(stored.map((t) => [t.id, t]));

  indexes.set(stored, made);

  return made;
};

export function sceneTries(refs: readonly TryRef[] | undefined, stored: readonly StoredTry[] | null): TryRecord[] {
  const byId = stored ? indexOf(stored) : new Map<string, StoredTry>();

  return (refs ?? []).flatMap((ref) => {
    if (isRecord(ref)) return [ref];

    const found = byId.get(ref.id);

    return found ? [cachedRecord(found)] : [];
  });
}

export const withGenerated = (all: readonly StoredTry[], ids: readonly string[]): string[] => {
  const picked = new Set(ids);

  return [...picked, ...all.filter((t) => t.sourceTry !== null && picked.has(t.sourceTry)).map((t) => t.id)].filter(
    (id, i, list) => list.indexOf(id) === i,
  );
};
