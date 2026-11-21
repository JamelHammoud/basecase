import { useState } from 'react';
import { Button, Modal, NumberInput } from '../../design-system';
import type { PrintedDemand } from '../../kit/allocationTypes';
import type { Purchases } from '../../types/robotics';
import { reconcileCopies } from '../../print/productionCopies';
import { allocatePurchase } from './usePurchases';
import type { FrozenKit } from '../../kit/frozenKit';

function legacySource(kit: FrozenKit, id: string, key: string) {
  const part = kit.parts.find((source) => source.id === id);

  return (
    !!part &&
    !part.mesh &&
    !part.cad &&
    !part.sculptMesh &&
    !part.customNodes &&
    !part.boolean &&
    !part.csg &&
    !!kit.productionKeys?.[id] &&
    kit.legacyKeys?.[id] === key
  );
}

export function LegacyPrintQuantity({
  purchases,
  demand,
  run,
  disabled,
  kit,
}: {
  purchases: Purchases;
  demand: PrintedDemand;
  run: (action: () => Promise<unknown>) => Promise<void>;
  disabled: boolean;
  kit: FrozenKit;
}) {
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const legacy = [
    ...Object.values(purchases).map((entry) => entry.printOutput?.record),
    ...(kit.project.prints ?? []).filter((record) => !purchases[`print:${record.id}`]?.printOutput),
  ].find(
    (record) =>
      record?.state === 'printed' &&
      !record.copies &&
      record.material === demand.material &&
      (record.revision ?? JSON.stringify([record.hash, ''])) === JSON.stringify([record.hash, demand.labels ?? '']) &&
      record.parts.every((part) => legacySource(kit, part.id, part.key)) &&
      record.parts.some((part) => part.id === demand.partId && part.key === demand.shape),
  );

  if (!legacy) return null;

  const save = async () => {
    const counts = Object.fromEntries(legacy.parts.map((part) => [part.id, quantities[part.id] ?? 1]));

    await run(() => allocatePurchase({ kind: 'print', record: reconcileCopies(legacy, counts, kit.productionKeys) }));
    setOpen(false);
  };

  return (
    <>
      <Button disabled={disabled} onClick={() => setOpen(true)}>
        Reconcile Quantity
      </Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Reconcile Quantity"
        action={{ label: 'Confirm', onClick: () => void save(), disabled }}
      >
        {legacy.parts.map((part) => (
          <NumberInput
            key={part.id}
            aria-label={part.id}
            title={part.id}
            value={quantities[part.id] ?? 1}
            min={1}
            max={50}
            precision={0}
            unit=""
            onChange={(quantity) => setQuantities({ ...quantities, [part.id]: quantity })}
          />
        ))}
      </Modal>
    </>
  );
}
