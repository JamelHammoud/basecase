import React from 'react';
import { Select } from '../../design-system';
import {
  SHEET_MATERIAL_IDS,
  partSheet,
  sheetFor,
  sheetFromKey,
  sheetKey,
  sheetText,
  type PartSheet,
} from '../../sheet/materials';
import type { PartSectionProps } from './partSections';
import { SHEET_VALUE, madeWith, materialOptions, materialTag } from './types';

interface MaterialFieldsProps extends PartSectionProps {
  sheetMm?: number | null;
}

const sheetOption = (sheet: PartSheet) => ({ value: sheetKey(sheet), label: sheetText(sheet) });

function sheetOptions(stored: PartSheet, measuredMm: number | undefined) {
  return SHEET_MATERIAL_IDS.flatMap((m) => {
    const fresh = sheetOption(sheetFor(m, measuredMm));

    if (m !== stored.material || fresh.value === sheetKey(stored)) return [fresh];

    return [sheetOption(stored), fresh];
  });
}

export const MaterialFields: React.FC<MaterialFieldsProps> = ({ part, sheetMm, onUpdate }) => {
  const sheet = partSheet(part);
  const measured = sheetMm ?? sheet?.thicknessMm;
  const cutFrom = (next: PartSheet | null) => next && onUpdate({ sheet: next, mechanicalTag: undefined });

  return (
    <>
      <Select
        aria-label="Material"
        value={materialTag(part)}
        onChange={(e) =>
          e.target.value === SHEET_VALUE ? cutFrom(sheetFor('aluminum', measured)) : onUpdate(madeWith(e.target.value))
        }
        options={materialOptions(!!sheet || !!sheetMm)}
      />
      {sheet && (
        <Select
          aria-label="Sheet"
          value={sheetKey(sheet)}
          onChange={(e) => cutFrom(sheetFromKey(e.target.value))}
          options={sheetOptions(sheet, measured)}
        />
      )}
    </>
  );
};
