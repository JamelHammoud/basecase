import { useEffect, useEffectEvent } from 'react';
import { Section } from '../../design-system';
import type { BuildRecord } from '../../kit/buildRecords';
import type { FrozenKit } from '../../kit/frozenKit';
import { buildDemand } from '../../kit/buildDemand';
import { usePurchases, refreshPurchases } from './usePurchases';
import { ComponentAllocation } from './ComponentAllocation';
import { PrintedAllocation } from './PrintedAllocation';
import { useAllocationAction } from './useAllocationAction';

export function BuildAllocations({
  frozen,
  onError,
}: {
  frozen: { record: BuildRecord; kit: FrozenKit };
  onError: (error: unknown) => void;
}) {
  const [purchases] = usePurchases();
  const { busy, run } = useAllocationAction(onError);
  const demand = buildDemand(frozen.kit);
  const build = { id: frozen.record.id, name: frozen.record.name, kit: frozen.record.kit };
  const load = useEffectEvent(() => refreshPurchases().catch(onError));

  useEffect(() => {
    void load();
  }, [frozen.record.id]);

  return (
    <Section title="Allocations" className="!px-0 !py-0 !border-b-0">
      {demand.components.map((item) => (
        <ComponentAllocation
          key={`${build.id}:${item.key}`}
          demand={item}
          build={build}
          purchases={purchases}
          busy={busy}
          run={run}
        />
      ))}
      {demand.printed.map((item) => (
        <PrintedAllocation
          kit={frozen.kit}
          key={item.partId}
          demand={item}
          build={build}
          purchases={purchases}
          busy={busy}
          run={run}
        />
      ))}
    </Section>
  );
}
