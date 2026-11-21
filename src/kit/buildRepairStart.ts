import { hashOf } from '../skills/hash';
import { repairRefusalText } from './buildRepairRefusal';
import { prepareBuildRepair } from './buildRepairClient';
import { currentBuildRepair } from './buildRepairState';
import {
  assetKey,
  indexOf,
  recordKey,
  recordOf,
  storedBuildContent,
  summaryOf,
  type BuildStorage,
  type BuildRecord,
} from './buildPersistence';
import type { PreparedFrozenKit, FrozenAsset } from './frozenContent';
import type { BuildRepairRecord } from './buildRepairTypes';

export function buildRepairStarter(storage: BuildStorage, limits: { maxBytes: number }) {
  return async ({
    id,
    target,
    request,
    signal,
    guard,
  }: {
    id: string;
    target: PreparedFrozenKit;
    request: string;
    signal: AbortSignal;
    guard?: () => void;
  }) => {
    signal.throwIfAborted();

    const original = recordOf(await storage.get(recordKey(id)));
    const replay = checkedRepairStart(original, request, target.hash);

    if (replay) return original;

    const source = original.configuration ?? original.kit;
    const prepared = await prepareBuildRepair(await storedBuildContent(storage, source), target, signal);

    if (prepared.refusal) throw new Error(repairRefusalText(prepared.refusal));

    const affected = [
      ...new Set([
        ...prepared.comparison.replacements,
        ...prepared.phases.flatMap((phase) =>
          phase.plan.steps.filter((step) => step.kind === 'inserts').flatMap((step) => step.partIds),
        ),
      ]),
    ];
    const repair: BuildRepairRecord = {
      id: request,
      build: id,
      source,
      target: target.hash,
      affected,
      plan: prepared,
      createdAt: new Date().toISOString(),
      state: 'active',
      index: 0,
      completed: {},
      count: prepared.phases.reduce((sum, phase) => sum + phase.plan.steps.length, 0) + prepared.declarations.length,
    };
    const root = { hash: target.hash, bytes: target.bytes, text: target.text };
    const incoming = { ...target.assets, [root.hash]: root };
    const hashes = Object.keys(incoming);

    signal.throwIfAborted();

    return storage.update(
      ['index', recordKey(id), ...hashes.map(assetKey)],
      ([value, saved, ...existing]) => {
        signal.throwIfAborted();
        guard?.();

        const index = indexOf(value);
        const current = recordOf(saved);
        const committed = current.repairs?.find((item) => item.id === request);

        if (committed?.target === target.hash) return { puts: {}, result: current };

        if (
          (current.configuration ?? current.kit) !== source ||
          hashOf(current.repairs?.map((item) => [item.id, item.state])) !==
            hashOf(original.repairs?.map((item) => [item.id, item.state]))
        )
          throw new Error('The build changed. Prepare the repair again.');

        const assets = { ...index.assets, ...Object.fromEntries(hashes.map((hash) => [hash, incoming[hash].bytes])) };

        if (Object.values(assets).reduce((sum, bytes) => sum + bytes, 0) > limits.maxBytes)
          throw new Error('Build storage is full. Delete a build to make room.');

        const record = {
          ...current,
          retained: [...new Set([...(current.retained ?? [current.kit]), source, root.hash])],
          repairs: [...(current.repairs ?? []), repair],
        };
        const puts: Record<string, unknown> = {
          [recordKey(id)]: record,
          index: {
            ...index,
            assets,
            kits: { ...index.kits, [root.hash]: Object.keys(target.assets) },
            records: index.records.map((item) => (item.id === id ? summaryOf(record) : item)),
          },
        };

        hashes.forEach((hash, i) => {
          const savedAsset = existing[i] as FrozenAsset | undefined;

          if (savedAsset && savedAsset.text !== incoming[hash].text) throw new Error('The build kit is damaged.');

          if (!savedAsset) puts[assetKey(hash)] = incoming[hash];
        });

        return { puts, result: record };
      },
      signal,
    );
  };
}

function checkedRepairStart(record: BuildRecord, request: string, target: string) {
  const replay = record.repairs?.find((repair) => repair.id === request);
  const previous = currentBuildRepair(record);

  if (replay && replay.target !== target) throw new Error('This repair request has changed.');

  if (replay) return replay;

  if (previous && previous.state !== 'cancelled') throw new Error('Finish the current repair first.');

  if (previous && Object.keys(previous.completed).length) throw new Error('Resume the recorded repair work first.');

  if (!request || request.length > 200 || (record.repairs?.length ?? 0) >= 32)
    throw new Error('Repair history is full.');

  return undefined;
}
