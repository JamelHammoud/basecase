import { FieldRow, Section, Select } from '../../design-system';
import type { PartSheet, SheetProfile } from '../../types/sheet';
import { applySheet, SHEET_MATERIALS, sheetOf } from '../../sheet/materials';
import type { PartSectionProps } from './partSections';

type ManufacturingProps = PartSectionProps & { profile: SheetProfile | null };

const METHODS = [
  { value: 'printed', label: '3D Print' },
  { value: 'sheet', label: 'Cut from Sheet' },
];

const MATERIAL_OPTIONS = Object.entries(SHEET_MATERIALS).map(([value, { label }]) => ({ value, label }));

export function ManufacturingSection({ part, onUpdate, profile }: ManufacturingProps) {
  const sheet = sheetOf(part, profile ?? undefined);

  if ((!profile && !part.sheet) || part.role !== 'solid') return null;

  const changeSheet = (setting: PartSheet) => {
    if (profile) onUpdate(applySheet(part, setting, profile));
  };
  const changeMethod = (value: string) => {
    if (value === 'printed') return onUpdate({ sheet: undefined, mechanicalTag: '3D Printed PLA/PETG' });

    if (profile) changeSheet({ material: 'aluminum-6061', thicknessMm: profile.thicknessMm });
  };
  const thicknesses = sheet
    ? [...new Set([sheet.thicknessMm, ...SHEET_MATERIALS[sheet.material].thicknessesMm])].sort((a, b) => a - b)
    : [];

  return (
    <Section title="Manufacturing">
      <Select
        aria-label="Manufacturing"
        options={METHODS}
        value={sheet ? 'sheet' : 'printed'}
        onChange={(event) => changeMethod(event.target.value)}
      />
      {sheet && (
        <>
          <FieldRow label="Material">
            <Select
              aria-label="Sheet material"
              value={sheet.material}
              disabled={!profile}
              options={MATERIAL_OPTIONS}
              onChange={(event) => changeSheet({ ...sheet, material: event.target.value as PartSheet['material'] })}
            />
          </FieldRow>
          <FieldRow label="Thickness">
            <Select
              aria-label="Sheet thickness"
              value={sheet.thicknessMm}
              disabled={!profile}
              options={thicknesses.map((thickness) => ({
                value: String(thickness),
                label: `${thickness} mm`,
              }))}
              onChange={(event) => changeSheet({ ...sheet, thicknessMm: Number(event.target.value) })}
            />
          </FieldRow>
        </>
      )}
    </Section>
  );
}
