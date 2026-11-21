import { isPrinted } from '../utils/bom';
import type { ScenePart } from '../types/robotics';

export function drawingQuantity(part: ScenePart) {
  const quantity = isPrinted(part) ? (part.print?.copies ?? 1) : 1;

  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000)
    throw new Error(`${part.name}: choose a quantity from 1 to 10,000.`);

  return quantity;
}
