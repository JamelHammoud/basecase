import { Section, Button, confirmAction } from '../../design-system';
import type { BuildSummary } from '../../kit/buildRecords';
import type { AllocationRequest } from '../../kit/allocationTypes';
import { usePurchases, allocatePurchase } from './usePurchases';
import { ComponentAllocation } from './ComponentAllocation';
import { useAllocationAction } from './useAllocationAction';

export function RetainedAllocations({
  builds,
  onError,
}: {
  builds: BuildSummary[];
  onError: (error: unknown) => void;
}) {
  const [purchases] = usePurchases();
  const { busy, run } = useAllocationAction(onError);
  const known = new Set(builds.map((build) => build.id));
  const components = Object.values(purchases)
    .flatMap((entry) => entry.reservations ?? [])
    .filter((entry) => entry.quantity > 0 && !known.has(entry.build.id));
  const copies = Object.entries(purchases).flatMap(([key, entry]) =>
    Object.entries(entry.printOutput?.assignments ?? {}).flatMap(([copy, history]) =>
      history
        .filter((assignment) => !assignment.returnedAt && !known.has(assignment.build.id))
        .map((assignment) => ({ key, copy, assignment })),
    ),
  );
  const giveBack = (name: string, request: AllocationRequest) =>
    confirmAction({
      title: `Return ${name}?`,
      body: 'Confirm the physical quantity has been returned.',
      confirmLabel: 'Return',
      onConfirm: () => {
        void run(() => allocatePurchase(request));
      },
    });

  if (!components.length && !copies.length) return null;

  return (
    <Section title="Retained allocations">
      {components.map((entry) => (
        <div key={`${entry.build.id}:${entry.demand.key}`} className="py-2 text-[13px]">
          <div>{entry.build.name}</div>
          <ComponentAllocation
            returnOnly
            build={entry.build}
            demand={entry.demand}
            purchases={purchases}
            busy={busy}
            run={run}
          />
        </div>
      ))}
      {copies.map(({ key, copy, assignment }) => (
        <div key={copy} className="py-2 text-[13px]">
          <div>{`${assignment.build.name}: ${copy}`}</div>
          <Button
            disabled={busy}
            onClick={() =>
              giveBack(copy, {
                kind: 'return-copy',
                request: crypto.randomUUID(),
                key,
                copy,
                build: assignment.build,
                demand: assignment.demand,
              })
            }
          >
            Return
          </Button>
        </div>
      ))}
    </Section>
  );
}
