import { FieldRow, NumberInput } from '../../design-system';

interface NumberFieldProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  precision: number;
  onCommit: (value: number) => void;
}

export function NumberField({ label, value, unit, min, max, step, precision, onCommit }: NumberFieldProps) {
  return (
    <FieldRow label={label}>
      <NumberInput
        value={value}
        unit={unit}
        min={min}
        max={max}
        step={step}
        precision={precision}
        onChange={(v, live) => {
          if (!live && v !== value) onCommit(v);
        }}
      />
    </FieldRow>
  );
}
