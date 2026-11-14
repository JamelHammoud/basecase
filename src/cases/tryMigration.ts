import type { Recording } from '../sim/recorder';
import type { Case } from './schema';
import { contractHash, storedTry, type StoredTry, type TryJoint, type TryRef } from './storedTry';
import type { TryRecord } from './tries';

export interface LegacyRecordings {
  load: (id: string) => Promise<Recording | null>;
  drop: (id: string) => Promise<void>;
}

export interface MigrationTarget {
  sceneId: string;
  cases: readonly Case[];
  model: { hash: string; joints: TryJoint[] } | null;
  legacy: LegacyRecordings | null;
  keep: (manifest: StoredTry, recording?: Recording) => Promise<void>;
}

async function moveOne(record: TryRecord, target: MigrationTarget, hashes: Map<string, string>) {
  const kase = target.cases.find((c) => c.id === record.caseId);
  const sameModel = target.model?.hash === record.manifest.modelHash;
  const manifest = storedTry(record, {
    sceneId: target.sceneId,
    caseName: kase?.name ?? '',
    contractHash: hashes.get(record.caseId) ?? '',
    joints: sameModel ? (target.model?.joints ?? []) : [],
    input: null,
  });
  const recording = (await target.legacy?.load(record.id)) ?? undefined;

  await target.keep(manifest, recording);

  if (recording) await target.legacy?.drop(record.id);
}

export async function migrateTries(records: readonly TryRecord[], target: MigrationTarget): Promise<Set<string>> {
  const hashes = new Map(await Promise.all(target.cases.map(async (c) => [c.id, await contractHash(c)] as const)));
  const moved = new Set<string>();

  for (const record of records) {
    try {
      await moveOne(record, target, hashes);
      moved.add(record.id);
    } catch {
      continue;
    }
  }

  return moved;
}

export const migratedRefs = (refs: readonly TryRef[] | undefined, moved: ReadonlySet<string>): TryRef[] =>
  (refs ?? []).map((t) => (moved.has(t.id) ? { id: t.id } : t));
