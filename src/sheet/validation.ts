import type { PartSheet } from '../types/sheet';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function validPartSheet(value: unknown): value is PartSheet {
  if (!isRecord(value)) return false;

  const { material, thicknessMm } = value;
  const knownMaterial = material === 'aluminum-6061' || material === 'carbon-fiber' || material === 'acrylic';

  return knownMaterial && typeof thicknessMm === 'number' && Number.isFinite(thicknessMm) && thicknessMm > 0;
}

export function validSheetTransform(value: unknown): value is number[] {
  if (
    !Array.isArray(value) ||
    value.length !== 16 ||
    !value.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    return false;
  }

  if (value[3] !== 0 || value[7] !== 0 || value[11] !== 0 || value[15] !== 1) return false;

  const determinant =
    value[0] * (value[5] * value[10] - value[9] * value[6]) -
    value[4] * (value[1] * value[10] - value[9] * value[2]) +
    value[8] * (value[1] * value[6] - value[5] * value[2]);

  return Number.isFinite(determinant) && determinant > 0;
}

function validFields(part: Record<string, unknown>): boolean {
  return (
    (part.sheet === undefined || validPartSheet(part.sheet)) &&
    (part.sheetTransform === undefined || validSheetTransform(part.sheetTransform))
  );
}

export function validSheetFields(value: Record<string, unknown>): boolean {
  const pending: unknown[] = [value];
  const seen = new Set<unknown>();

  while (pending.length) {
    const part = pending.pop();

    if (!isRecord(part) || !validFields(part)) return false;

    if (seen.has(part)) continue;

    const operands = isRecord(part.boolean) && Array.isArray(part.boolean.operands) ? part.boolean.operands : [];
    const customParts = Array.isArray(part.customNodes)
      ? part.customNodes
          .filter(isRecord)
          .map((node) => node.part)
          .filter((node) => node !== undefined)
      : [];

    seen.add(part);

    for (const operand of operands) pending.push(operand);

    for (const customPart of customParts) pending.push(customPart);
  }

  return true;
}
