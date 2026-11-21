import { useState } from 'react';
import { Button, Select, confirmAction } from '../../design-system';
import type { BuildOwner, PrintedDemand } from '../../kit/allocationTypes';
import type { Purchases } from '../../types/robotics';
import { availablePrintCopies } from '../../../electron/backend/printAllocations.mjs';
import { allocatePurchase } from './usePurchases';
import { LegacyPrintQuantity } from './LegacyPrintQuantity';
import type { FrozenKit } from '../../kit/frozenKit';
import { clockTime, dayLabel } from '../../utils/timeAgo';

export function PrintedAllocation({
  demand,
  build,
  purchases,
  busy,
  run,
  kit,
}: {
  demand: PrintedDemand & { name: string; refusal?: string };
  build: BuildOwner;
  purchases: Purchases;
  busy: boolean;
  kit: FrozenKit;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [selected, setSelected] = useState('');
  const available = availablePrintCopies(purchases, demand);
  const choices = available.map((entry) => {
    const when = `${dayLabel(entry.record.sentAt)}, ${clockTime(new Date(entry.record.sentAt))}`;

    return {
      value: entry.copy.id,
      label: `Plate ${entry.record.plate}, copy ${entry.copy.index + 1}, ${when}`,
    };
  });
  const held = Object.entries(purchases).flatMap(([key, entry]) =>
    Object.entries(entry.printOutput?.assignments ?? {}).flatMap(([copy, history]) =>
      history
        .filter(
          (assignment) =>
            !assignment.returnedAt && assignment.build.id === build.id && assignment.demand.partId === demand.partId,
        )
        .map(() => ({
          key,
          copy,
          label: entry.printOutput?.record.copies?.find((item) => item.id === copy)?.index ?? 0,
        })),
    ),
  );
  const assign = () => {
    const first = available.find((entry) => entry.copy.id === selected) ?? available[0];

    if (!first) return;

    void run(() =>
      allocatePurchase({
        kind: 'assign',
        request: crypto.randomUUID(),
        key: first.key,
        copy: first.copy.id,
        build,
        demand,
      }),
    );
  };
  const giveBack = (key: string, copy: string) =>
    confirmAction({
      title: `Return ${demand.name}?`,
      body: 'Confirm the printed copy has been returned.',
      confirmLabel: 'Return',
      onConfirm: () => {
        void run(() =>
          allocatePurchase({ kind: 'return-copy', request: crypto.randomUUID(), key, copy, build, demand }),
        );
      },
    });

  return (
    <div className="py-2 space-y-2" data-allocation-part={demand.partId}>
      <div className="text-[13px] break-words">{demand.name}</div>
      <div className="text-[12px] text-white/60">{`Assigned ${held.length}/${demand.qty}, available ${available.length}`}</div>
      {demand.refusal && <div className="text-[12px] text-white/60">{demand.refusal}</div>}
      {available.length > 0 && (
        <Select
          aria-label="Printed copy"
          options={choices}
          value={selected || choices[0].value}
          onChange={(event) => setSelected(event.target.value)}
          disabled={busy}
        />
      )}
      <Button disabled={busy || !!demand.refusal || !available.length || held.length >= demand.qty} onClick={assign}>
        Assign Copy
      </Button>
      {held.map(({ key, copy, label }) => (
        <Button key={copy} disabled={busy} onClick={() => giveBack(key, copy)}>{`Return Copy ${label + 1}`}</Button>
      ))}
      <LegacyPrintQuantity
        kit={kit}
        purchases={purchases}
        demand={demand}
        run={run}
        disabled={busy || !!demand.refusal}
      />
    </div>
  );
}
