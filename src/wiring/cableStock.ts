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

function selectedStock(supply: SupplyInfo | undefined, lengthMm: number | null, fits: boolean): CableSelection {
  if (!supply) return { cableSupplyId: null, lengthMm: null, status: 'unsupported' };

  if (lengthMm === null) return { cableSupplyId: supply.id, lengthMm, status: 'unknown-length' };

  return { cableSupplyId: supply.id, lengthMm, status: fits ? 'fits' : 'too-short' };
}

export function selectCableStock(
  from: ConnectorType,
  to: ConnectorType,
  requiredMm: number,
  stock: readonly SupplyInfo[] = SUPPLIES,
): CableSelection {
  if (!Number.isFinite(requiredMm) || requiredMm < 0)
    throw new RangeError('Cable length must be finite and nonnegative');

  let compatible: SupplyInfo | undefined;
  let fit: SupplyInfo | undefined;
  let longest: SupplyInfo | undefined;
  let fitLength = Infinity;
  let longestLength = 0;

  for (const supply of stock) {
    if (!hasEnds(supply, from, to)) continue;

    compatible ??= supply;

    const lengthMm = lengthOf(supply);

    if (lengthMm === null) continue;

    if (lengthMm >= longestLength) {
      longest = supply;
      longestLength = lengthMm;
    }

    if (lengthMm >= requiredMm && lengthMm < fitLength) {
      fit = supply;
      fitLength = lengthMm;
    }
  }

  return selectedStock(fit ?? longest ?? compatible, (fit ? fitLength : longestLength) || null, !!fit);
}
