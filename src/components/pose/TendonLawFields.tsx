import { FieldRow, NumberInput, Select } from '../../design-system';
import type { TendonLaw } from '../../types/tendon';

export function TendonLawFields({ law, onChange }: { law: TendonLaw; onChange: (law: TendonLaw) => void }) {
  return (
    <>
      <FieldRow label="Law">
        <Select
          aria-label="Tendon law"
          value={law.kind}
          options={[
            { value: 'fixed', label: 'Fixed length' },
            { value: 'elastic', label: 'Elastic' },
          ]}
          onChange={(e) =>
            onChange(
              e.target.value === 'fixed'
                ? { kind: 'fixed', lengthMm: 0 }
                : { kind: 'elastic', restLengthMm: 0, stiffnessNPerMm: 1, dampingNsPerMm: 0.01 },
            )
          }
        />
      </FieldRow>
      {law.kind === 'fixed' && (
        <FieldRow label="Length">
          <NumberInput
            aria-label="Length"
            unit="mm"
            value={law.lengthMm}
            precision={6}
            onChange={(lengthMm) => onChange({ kind: 'fixed', lengthMm })}
          />
        </FieldRow>
      )}
      {law.kind === 'elastic' &&
        (['restLengthMm', 'stiffnessNPerMm', 'dampingNsPerMm'] as const).map((key, i) => {
          const label = ['Rest length', 'Stiffness', 'Damping'][i];

          return (
            <FieldRow key={key} label={label}>
              <NumberInput
                aria-label={label}
                value={law[key]}
                precision={6}
                unit={['mm', 'N/mm', 'N s/mm'][i]}
                onChange={(value) => onChange({ ...law, [key]: value })}
              />
            </FieldRow>
          );
        })}
    </>
  );
}
