import { useEffect, useEffectEvent, useState } from 'react';
import { Section } from '../../design-system';
import { localBuilds, type BuildRecord } from '../../kit/buildRecords';
import type { FrozenKit } from '../../kit/frozenKit';
import { buildDemand } from '../../kit/buildDemand';
import { repairDemand, repairOwner } from '../../kit/buildRepairDemand';
import { usePurchases, refreshPurchases } from './usePurchases';
import { ComponentAllocation } from './ComponentAllocation';
import { PrintedAllocation } from './PrintedAllocation';
import { useAllocationAction } from './useAllocationAction';
import { RetainedAllocations } from './RetainedAllocations';

export function BuildAllocations({ frozen, onError }: {
  frozen: { record: BuildRecord; kit: FrozenKit }; onError: (error: unknown) => void;
}) {
  const [purchases] = usePurchases();
  const { busy, run } = useAllocationAction(onError);
  const [kits, setKits] = useState<{ id: string; original: FrozenKit; target: FrozenKit; targetHash: string } | null>(null);
  const { record } = frozen;
  const latest = record.repairs?.at(-1);
  const load = useEffectEvent(async () => {
    await refreshPurchases();

    if (!latest) return null;

    const [original, target] = await Promise.all([
      localBuilds.openRevision(record.id, record.kit), localBuilds.openRevision(record.id, latest.target),
    ]);

    return { id: record.id, original, target, targetHash: latest.target };
  });
  const fail = useEffectEvent(onError);

  useEffect(() => {
    let active = true;

    void load().then((value) => { if (active) setKits(value); }).catch(fail);

    return () => { active = false; };
  }, [record.id, record.kit, latest?.target]);

  if (latest && (!kits || kits.id !== record.id || kits.targetHash !== latest.target)) return null;

  const original = kits?.original ?? frozen.kit;
  const demand = buildDemand(original);
  const build = { id: record.id, name: record.name, kit: record.kit };
  const affected = new Set(record.repairs?.filter((repair) => repair.state !== 'cancelled').flatMap((repair) => repair.affected));
  const replacement = replacementFor(record, kits);
  const returning = latest?.state === 'cancelled';

  return <Section title="Allocations" className="!px-0 !py-0 !border-b-0">
    {demand.components.map((item) => <ComponentAllocation key={`${build.id}:${item.key}`} demand={item} build={build} purchases={purchases} busy={busy} run={run} returnOnly={item.partIds.some((id) => affected.has(id))} />)}
    {demand.printed.map((item) => <PrintedAllocation kit={original} key={item.partId} demand={item} build={build} purchases={purchases} busy={busy} run={run} returnOnly={affected.has(item.partId)} />)}
    {replacement && <div data-repair-allocations><Section title="Replacement parts" className="!px-0 !border-b-0">
      {replacement.demand.components.map((item) => <ComponentAllocation key={`${replacement.owner.repair}:${item.key}`} demand={item} build={replacement.owner} purchases={purchases} busy={busy} run={run} returnOnly={returning} />)}
      {replacement.demand.printed.map((item) => <PrintedAllocation kit={replacement.kit} key={`${replacement.owner.repair}:${item.partId}`} demand={item} build={replacement.owner} purchases={purchases} busy={busy} run={run} returnOnly={returning} />)}
    </Section></div>}
    <RetainedAllocations builds={[]} buildId={record.id} exceptRepair={latest?.id} onError={onError} />
  </Section>;
}

function replacementFor(record: BuildRecord, kits: { target: FrozenKit } | null) {
  const repair = record.repairs?.at(-1);

  if (!repair || !kits) return null;

  return { demand: repairDemand(kits.target, repair), owner: repairOwner(record, repair), kit: kits.target };
}
