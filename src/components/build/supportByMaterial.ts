import type { PrintMaterial } from '../../types/robotics';
import type { PrintReport } from '../../utils/printReport';

export function supportByMaterial(print: PrintReport | null) {
  const out: Partial<Record<PrintMaterial, number>> = {};

  for (const r of print?.parts ?? []) out[r.material] = (out[r.material] ?? 0) + r.supportG;

  return out;
}
