import { SUPPLIES, type SupplyInfo } from '../data/supplies';
import type { ConnectorType } from '../types/ports';

export interface CableSelection {
  cableSupplyId: string | null;
  lengthMm: number | null;
  status: 'fits' | 'too-short' | 'unknown-length' | 'unsupported';
}

const hasEnds = (supply: SupplyInfo, from: ConnectorType, to: ConnectorType) => {
  const ends = supply.cable?.connectors;

  return !!ends && ((ends[0] === from && ends[1] === to) || (ends[0] === to && ends[1] === from));
};

const lengthOf = (supply: SupplyInfo): number | null => {
  const cable = supply.cable;

  return cable?.source && Number.isFinite(cable.lengthMm) && cable.lengthMm! > 0 ? cable.lengthMm! : null;
};

export function selectCableStock(
  from: ConnectorType,
  to: ConnectorType,
  requiredMm: number,
  stock: readonly SupplyInfo[] = SUPPLIES,
): CableSelection {
  if (!Number.isFinite(requiredMm) || requiredMm < 0)
    throw new RangeError('Cable length must be finite and nonnegative');

  const compatible = stock.filter((supply) => hasEnds(supply, from, to));
  const known = compatible.filter((supply) => lengthOf(supply) !== null).sort((a, b) => lengthOf(a)! - lengthOf(b)!);
  const fit = known.find((supply) => lengthOf(supply)! >= requiredMm);
  const supply = fit ?? known.at(-1) ?? compatible[0];

  if (!supply) return { cableSupplyId: null, lengthMm: null, status: 'unsupported' };

  const lengthMm = lengthOf(supply);

  if (lengthMm === null) return { cableSupplyId: supply.id, lengthMm, status: 'unknown-length' };

  return { cableSupplyId: supply.id, lengthMm, status: fit ? 'fits' : 'too-short' };
}
