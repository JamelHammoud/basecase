import { useState } from 'react';
import { Button, NumberInput, confirmAction } from '../../design-system';
import type { BuildOwner, ComponentDemand } from '../../kit/allocationTypes';
import type { Purchases } from '../../types/robotics';
import { onHandOf } from '../../utils/onHand';
import { allocatedCount } from '../../../electron/backend/buildAllocations.mjs';
import { allocatePurchase } from './usePurchases';

export function ComponentAllocation({
  demand,
  build,
  purchases,
  busy,
  run,
  returnOnly = false,
}: {
  demand: ComponentDemand;
  build: BuildOwner;
  purchases: Purchases;
  busy: boolean;
  returnOnly?: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(1);
  const stored = purchases[demand.key];
  const assigned = stored?.reservations?.find((entry) => entry.build.id === build.id)?.quantity ?? 0;
  const available = onHandOf(stored);
  const shortage = Math.max(0, allocatedCount(stored) - (stored?.onHand ?? 0));
  const change = (kind: 'reserve' | 'return') =>
    run(() =>
      allocatePurchase({
        kind,
        request: crypto.randomUUID(),
        build,
        demand,
        quantity,
      }),
    );

  return (
    <div className="py-2 space-y-2" data-allocation-key={demand.key}>
      <div className="text-[13px]">{demand.name}</div>
      <div className="text-[12px] text-white/60">{`Assigned ${assigned}/${demand.qty}, available ${available}`}</div>
      {shortage > 0 && <div className="text-[12px] text-white/60">{`Stock shortage: ${shortage}`}</div>}
      <div className="flex gap-2">
        <NumberInput
          aria-label="Quantity"
          value={quantity}
          min={1}
          max={demand.qty}
          precision={0}
          unit=""
          onChange={setQuantity}
          disabled={busy}
        />
        {!returnOnly && (
          <Button disabled={busy || assigned >= demand.qty} onClick={() => void change('reserve')}>
            Reserve
          </Button>
        )}
        <Button
          disabled={busy || quantity > assigned}
          onClick={() =>
            confirmAction({
              title: `Return ${demand.name}?`,
              body: `Confirm ${quantity} returned to stock.`,
              confirmLabel: 'Return',
              onConfirm: () => {
                void change('return');
              },
            })
          }
        >
          Return
        </Button>
      </div>
    </div>
  );
}
