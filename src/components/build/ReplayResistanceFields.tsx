import { FieldRow, TextInput } from '../../design-system';
import type { ReplayResistance } from '../../wiring/powerReplayTypes';

export function ReplayResistanceFields({
  value,
  onChange,
}: {
  value: ReplayResistance;
  onChange: (patch: Partial<ReplayResistance>) => void;
}) {
  const number = (label: string, key: 'outgoingOhms' | 'returnOhms' | 'temperatureC') => (
    <FieldRow group label={label}>
      <TextInput
        aria-label={label}
        type="number"
        step="any"
        inputMode="decimal"
        value={Number.isFinite(value[key]) ? value[key] : ''}
        onChange={(e) => onChange({ [key]: e.target.value.trim() ? Number(e.target.value) : NaN })}
      />
    </FieldRow>
  );

  return (
    <div className="space-y-2">
      {number('Outgoing resistance (Ω)', 'outgoingOhms')}
      {number('Return resistance (Ω)', 'returnOhms')}
      {number('Temperature (°C)', 'temperatureC')}
      <FieldRow group label="Evidence">
        <TextInput
          aria-label="Evidence"
          value={value.evidence}
          onChange={(e) => onChange({ evidence: e.target.value })}
        />
      </FieldRow>
    </div>
  );
}
