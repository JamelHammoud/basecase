import type { RecordedFault } from '../sim/faults';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { Case } from './schema';
import { tryJoints, tryRefs, TRY_VERSION, type JointNames, type TryRecord, type TryRef } from './tries';

export interface LegacyTry {
  id: string;
  caseId: string;
  robot: string;
  at: string;
  passed: boolean;
  margin: number;
  seconds: number;
  generated?: true;
  manifest: {
    caseHash: string;
    modelHash: string;
    seed: number;
    frames: number;
    dt: number;
    faults?: RecordedFault[];
    commands?: number;
    world?: number;
    source?: string;
  };
}

export interface LegacyScene {
  sceneId: string;
  cases: Case[];
  model: SimModel | null;
  modelHash: string | null;
  names?: JointNames;
}

export interface MigrationStores {
  legacy: { load: (id: string) => Promise<Recording | null>; remove: (id: string) => Promise<unknown> };
  has: (id: string) => boolean;
  save: (record: TryRecord, recording: Recording | null) => Promise<void>;
}

export const isLegacyTry = (entry: unknown): entry is LegacyTry =>
  typeof entry === 'object' && entry !== null && 'manifest' in entry && 'caseId' in entry;

export const hasLegacyTries = (entries: readonly unknown[] | undefined) => !!entries?.some(isLegacyTry);

export function fromLegacy(old: LegacyTry, scene: LegacyScene): TryRecord {
  const { manifest } = old;
  const fits = scene.model && scene.modelHash === manifest.modelHash;

  return {
    version: TRY_VERSION,
    id: old.id,
    sceneId: scene.sceneId,
    robot: {
      name: old.robot,
      modelHash: manifest.modelHash,
      ...(fits ? { joints: tryJoints(scene.model!, scene.names) } : {}),
    },
    case: {
      id: old.caseId,
      name: scene.cases.find((c) => c.id === old.caseId)?.name ?? old.caseId,
      hash: manifest.caseHash,
      contractHash: '',
    },
    source: old.generated ? 'generated' : 'case',
    input: null,
    at: old.at,
    seconds: old.seconds,
    rate: Math.round(1 / manifest.dt),
    outcome: { result: old.passed ? 'passed' : 'failed', margin: old.margin },
    seed: manifest.seed,
    sourceTry: manifest.source ?? null,
    frames: manifest.frames,
    faults: manifest.faults ?? [],
    ...(manifest.commands !== undefined ? { commands: manifest.commands } : {}),
    ...(manifest.world !== undefined ? { world: manifest.world } : {}),
  };
}

export async function migrateTries(
  entries: readonly unknown[],
  scene: LegacyScene,
  stores: MigrationStores,
): Promise<TryRef[]> {
  for (const entry of entries.filter(isLegacyTry)) {
    const recording = await stores.legacy.load(entry.id);

    if (recording || !stores.has(entry.id)) await stores.save(fromLegacy(entry, scene), recording);

    if (recording) await stores.legacy.remove(entry.id);
  }

  return tryRefs(entries as Array<{ id: string }>);
}
