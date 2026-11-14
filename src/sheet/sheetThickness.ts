import type { ScenePart } from '../types/robotics';
import { isPrinted } from '../utils/bom';
import { shapeKey } from '../utils/printReport';
import type { SheetProfile } from './detectSheet';
import { MAX_SHEET_MM, plateThickness, sheetOf } from './sheetStock';

export type SheetThicknessOf = (part: ScenePart) => Promise<number | null>;

type SheetProfiles = (ids: string[]) => Promise<Record<string, SheetProfile | null>>;

const MAX_CACHED = 256;
const found = new Map<string, number | null>();

export const mayBeSheet = (part: ScenePart) =>
  (isPrinted(part) || !!sheetOf(part)) && plateThickness(part) <= MAX_SHEET_MM + 1;

export async function sheetThickness(part: ScenePart, profiles: SheetProfiles): Promise<number | null> {
  if (!mayBeSheet(part)) return null;

  const key = shapeKey(part);

  if (found.has(key)) return found.get(key) ?? null;

  const thickness = (await profiles([part.id]))[part.id]?.thickness ?? null;

  if (found.size >= MAX_CACHED) found.clear();

  found.set(key, thickness);

  return thickness;
}
