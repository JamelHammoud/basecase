import React from 'react';
import { Select } from '../../design-system';
import { SHEET_MATERIAL_IDS, partSheet, sheetFor, sheetText, type SheetMaterial } from '../../sheet/materials';
import type { PartSectionProps } from './partSections';
import { SHEET_VALUE, madeWith, materialOptions, materialTag } from './types';

interface MaterialFieldsProps extends PartSectionProps {
  sheetMm?: number | null;
}

export const MaterialFields: React.FC<MaterialFieldsProps> = ({ part, sheetMm, onUpdate }) => {
  const sheet = partSheet(part);
  const measured = sheetMm ?? sheet?.thicknessMm;
  const cutFrom = (material: SheetMaterial) =>
    onUpdate({ sheet: sheetFor(material, measured), mechanicalTag: undefined });

  return (
    <>
      <Select
        aria-label="Material"
        value={materialTag(part)}
        onChange={(e) => (e.target.value === SHEET_VALUE ? cutFrom('aluminum') : onUpdate(madeWith(e.target.value)))}
        options={materialOptions(!!sheet || !!sheetMm)}
      />
      {sheet && (
        <Select
          aria-label="Sheet"
          value={sheet.material}
          onChange={(e) => cutFrom(e.target.value as SheetMaterial)}
          options={SHEET_MATERIAL_IDS.map((m) => ({ value: m, label: sheetText(sheetFor(m, measured)) }))}
        />
      )}
    </>
  );
};
