import { FieldRow, NumberInput, Switch } from '../../design-system';

export function CaseGripForceField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Switch
        label="Limit grip force"
        aria-label="Limit grip force"
        checked={value > 0}
        onChange={(enabled) => onChange(enabled ? 20 : 0)}
      />
      {value > 0 && (
        <FieldRow label="Grip force ceiling" group>
          <NumberInput
            aria-label="Grip force ceiling"
            value={value}
            onChange={onChange}
            min={0.01}
            max={1000000}
            step={1}
            precision={2}
            unit="N"
          />
        </FieldRow>
      )}
    </div>
  );
}
