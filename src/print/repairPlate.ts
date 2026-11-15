import type { PartPrint, ScenePart } from '../types/robotics';
import { isPrinted } from '../utils/bom';

export function repairPrintParts(parts: ScenePart[], id: string, patch: PartPrint = {}): ScenePart[] {
  return parts
    .filter((part) => part.id === id && isPrinted(part))
    .map((part) => ({
      ...part,
      print: { down: part.print?.down, noLabel: part.print?.noLabel, ...patch, copies: 1, skip: false, plate: 1 },
    }));
}

export function printScopeParts(
  parts: ScenePart[],
  remaining: ScenePart[],
  scope: { repairId: string | null; skipPrinted: boolean; repairPrint?: PartPrint },
) {
  if (scope.repairId) return repairPrintParts(parts, scope.repairId, scope.repairPrint);

  return scope.skipPrinted ? remaining : parts;
}
