import { detectSheet, type SheetProfile } from '../sheet/detectSheet';
import { MAX_SHEET_MM, plateThickness, sheetOf } from '../sheet/sheetStock';
import type { ScenePart } from '../types/robotics';
import { isPrinted } from '../utils/bom';
import { buildPartGroup } from './buildPartMesh';
import { localTriangles } from './meshMeasure';
import { preparePart } from './partMesh/prepare';

export const mayBeSheet = (part: ScenePart) =>
  (isPrinted(part) || !!sheetOf(part)) && plateThickness(part) <= MAX_SHEET_MM + 1;

export async function sheetProfileOf(part: ScenePart): Promise<SheetProfile | null> {
  if (!mayBeSheet(part)) return null;

  await preparePart(part);

  return detectSheet(localTriangles(buildPartGroup(part, false, { shareGeometry: true, lateEdges: true })));
}
