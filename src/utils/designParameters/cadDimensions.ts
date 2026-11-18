import { scadDimensions } from '../../../electron/cad-kernel/dimensions.mjs';
import type { ScenePart } from '../../types/robotics';

const parsed = new WeakMap<object, { code: string; rows: ReturnType<typeof scadDimensions> }>();

export function parameterCadDimensions(cad: NonNullable<ScenePart['cad']>) {
  const known = parsed.get(cad);

  if (known?.code === cad.code) return known.rows;

  const rows = scadDimensions(cad.code);

  parsed.set(cad, { code: cad.code, rows });

  return rows;
}
