import { useState } from 'react';
import { Modal, Switch } from '../../design-system';
import { defaultCanaries } from '../../fleet/rollOut';
import type { FleetRollOut } from '../../workspace/useFleetRollOut';

type Choice = NonNullable<FleetRollOut['choice']>;

export function RollOutDialog({ choice }: { choice: Choice }) {
  const [canaries, setCanaries] = useState(() => defaultCanaries(choice.units));
  const chosen = canaries.filter((unit) => choice.units.includes(unit));
  const toggle = (unit: string, selected: boolean) =>
    setCanaries((current) => (selected ? [...current, unit] : current.filter((name) => name !== unit)));

  return (
    <Modal
      isOpen
      onClose={choice.close}
      title={`Roll Out ${choice.label}`}
      subtitle="Choose canaries"
      maxWidth="max-w-[400px]"
      action={{ label: 'Roll Out', disabled: !chosen.length, onClick: () => choice.confirm(chosen) }}
    >
      <div className="flex flex-col gap-1">
        {choice.units.map((unit) => (
          <Switch
            key={unit}
            label={unit}
            aria-label={unit}
            checked={chosen.includes(unit)}
            onChange={(selected) => toggle(unit, selected)}
          />
        ))}
      </div>
    </Modal>
  );
}
