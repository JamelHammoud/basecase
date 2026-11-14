import React from 'react';
import { Select } from '../../design-system';
import type { SheetProfile } from '../../sheet/detect';
import { SHEET_MATERIAL_IDS, sheetLabel, sheetOf, snapThickness } from '../../sheet/materials';
import { sheetPatch, unsheetPatch } from '../../sheet/sheetPatch';
import type { SheetMaterial } from '../../types/print';
import type { PartSectionProps } from './partSections';
import { CUT_FROM_SHEET, MATERIALS, materialTag } from './types';

type MaterialFieldsProps = PartSectionProps & { sheetFit: SheetProfile | null };

const sheetOptions = (thicknessMm: number) =>
  SHEET_MATERIAL_IDS.map((material) => ({
    value: material,
    label: sheetLabel({ material, thicknessMm: snapThickness(material, thicknessMm) }),
  }));

export const MaterialFields: React.FC<MaterialFieldsProps> = ({ part, onUpdate, sheetFit }) => {
  const sheet = sheetOf(part);
  const cutSheet = (material: SheetMaterial) => onUpdate(sheetPatch(part, { material }, sheetFit));
  const choose = (value: string) =>
    value === CUT_FROM_SHEET.value ? cutSheet(sheet?.material ?? 'aluminum') : onUpdate(unsheetPatch(part, value));

  return (
    <>
      <Select
        aria-label="Material"
        value={materialTag(part)}
        onChange={(e) => choose(e.target.value)}
        options={sheet || sheetFit ? [...MATERIALS, CUT_FROM_SHEET] : MATERIALS}
      />
      {sheet && (
        <Select
          aria-label="Sheet"
          value={sheet.material}
          onChange={(e) => cutSheet(e.target.value as SheetMaterial)}
          options={sheetOptions(sheetFit?.thicknessMm ?? sheet.thicknessMm)}
        />
      )}
    </>
  );
};
