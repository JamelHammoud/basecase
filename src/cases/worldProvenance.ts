import { asBoolean, asNumber, asRecord, asString, listOf, oneOf, refuse, vector } from './validate';

export const MAX_SCAN_CELLS = 250_000;
export const MAX_SCAN_ORIGINS = 4096;

export interface ScanWorldProvenance {
  version: 1;
  sourceTry: string;
  frame: string | null;
  matching: boolean;
  resolutionM: number;
  method: 'occupied-voxels';
  unknown: 'unobserved';
  occupied: number[][];
  free: number[][];
  origins: number[][];
  estimates: { floor: boolean; obstacleHeightM: number | null };
}

function cells(value: unknown, name: string): number[][] {
  return listOf((entry, label) => {
    const cell = vector(3)(entry, label);

    if (!cell.every((n) => Number.isSafeInteger(n) && Math.abs(n) <= 10_000))
      refuse(label, 'needs bounded whole cell coordinates');

    return cell;
  }, MAX_SCAN_CELLS)(value, name);
}

export function readWorldProvenance(value: unknown): ScanWorldProvenance | undefined {
  if (value === undefined) return undefined;

  const data = asRecord(value, 'Scan reconstruction');
  const estimates = asRecord(data.estimates, 'Scan estimates');
  const resolutionM = asNumber(data.resolutionM, 'Scan resolution');
  const version = asNumber(data.version, 'Scan reconstruction version');
  const obstacleHeightM =
    estimates.obstacleHeightM === null ? null : asNumber(estimates.obstacleHeightM, 'Scan obstacle height');

  if (version !== 1 || Math.abs(resolutionM - 0.1) > 1e-12 || (obstacleHeightM !== null && obstacleHeightM !== 1))
    refuse('Scan reconstruction', 'has unsupported settings');

  const origins = listOf(vector(3), MAX_SCAN_ORIGINS)(data.origins, 'Scan ray origins');

  if (origins.some((p) => p.some((n) => Math.abs(n) > 500))) refuse('Scan ray origins', 'extend beyond 500 m');

  return {
    version: 1,
    sourceTry: asString(data.sourceTry, 'Scan source try'),
    frame: data.frame === null ? null : asString(data.frame, 'Scan frame'),
    matching: asBoolean(data.matching, 'Scan matching'),
    resolutionM,
    method: oneOf(['occupied-voxels'] as const)(data.method, 'Scan reconstruction method'),
    unknown: oneOf(['unobserved'] as const)(data.unknown, 'Scan unknown space'),
    occupied: cells(data.occupied, 'Scan occupied cells'),
    free: cells(data.free, 'Scan free cells'),
    origins,
    estimates: { floor: asBoolean(estimates.floor, 'Scan estimated floor'), obstacleHeightM },
  };
}
