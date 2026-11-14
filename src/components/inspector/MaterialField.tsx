import React from 'react';
import { Select } from '../../design-system';
import {
  SHEET_MATERIALS,
  SHEET_STOCK,
  isSheetMaterial,
  sheetOf,
  snapThickness,
  type PartSheet,
} from '../../sheet/sheetStock';
import type { PartSectionProps } from './partSections';
import { MATERIALS, SHEET_OPTION, materialPatch, materialTag } from './types';
import { useSheetThickness } from './useSheetThickness';

const MATERIAL_OPTIONS = SHEET_MATERIALS.map((m) => ({ value: m, label: SHEET_STOCK[m].label }));

const SheetFields: React.FC<{ sheet: PartSheet; onChange: (sheet: PartSheet) => void }> = ({ sheet, onChange }) => (
  <div className="grid grid-cols-[1fr_96px] gap-1.5">
    <Select
      aria-label="Sheet material"
      value={sheet.material}
      onChange={(e) =>
        isSheetMaterial(e.target.value) &&
        onChange({ material: e.target.value, thickness: snapThickness(e.target.value, sheet.thickness) })
      }
      options={MATERIAL_OPTIONS}
    />
    <Select
      aria-label="Sheet thickness"
      value={String(sheet.thickness)}
      onChange={(e) => onChange({ ...sheet, thickness: Number(e.target.value) })}
      options={SHEET_STOCK[sheet.material].thicknesses.map((t) => ({ value: String(t), label: `${t} mm` }))}
    />
  </div>
);

export const MaterialField: React.FC<PartSectionProps> = ({ part, onUpdate }) => {
  const thickness = useSheetThickness(part);
  const sheet = sheetOf(part);
  const options = sheet || thickness !== null ? [...MATERIALS, SHEET_OPTION] : MATERIALS;
  const choose = (value: string) => {
    if (value !== SHEET_OPTION.value) return onUpdate(materialPatch(value));

    onUpdate({ sheet: { material: 'aluminum', thickness: snapThickness('aluminum', thickness ?? 0) } });
  };

  return (
    <>
      <Select
        aria-label="Material"
        value={materialTag(part)}
        onChange={(e) => choose(e.target.value)}
        options={options}
      />
      {sheet && <SheetFields sheet={sheet} onChange={(next) => onUpdate({ sheet: next })} />}
    </>
  );
};
