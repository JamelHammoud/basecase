import { FieldRow, NumberInput, Switch, TextInput } from '../../design-system';
import type { Study } from '../../workspace/useStudy';

export function StudySourcingField({ study }: { study: Study }) {
  const { sourcing, running, setSourcing } = study;

  return (
    <div className="flex flex-col gap-2" data-testid="study-sourcing">
      <Switch
        label="Purchasing"
        checked={!!sourcing}
        disabled={running}
        onChange={(on) => setSourcing(on ? { destination: '', requiredBy: '', quantity: 1 } : null)}
      />
      {sourcing && (
        <>
          <FieldRow label="Destination" group>
            <TextInput
              aria-label="Destination"
              disabled={running}
              value={sourcing.destination}
              onChange={(event) => setSourcing({ ...sourcing, destination: event.target.value })}
            />
          </FieldRow>
          <FieldRow label="Required arrival date" group>
            <TextInput
              aria-label="Required arrival date"
              type="date"
              disabled={running}
              value={sourcing.requiredBy}
              onChange={(event) => setSourcing({ ...sourcing, requiredBy: event.target.value })}
            />
          </FieldRow>
          <FieldRow label="Quantity">
            <NumberInput
              aria-label="Quantity"
              disabled={running}
              min={1}
              max={100000}
              precision={0}
              unit=""
              value={sourcing.quantity}
              onChange={(quantity) => setSourcing({ ...sourcing, quantity })}
            />
          </FieldRow>
        </>
      )}
    </div>
  );
}
