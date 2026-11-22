export interface Horn {
  offsetCounts: number;
  direction: 1 | -1;
  drives?: number;
}

export const MAX_HORN_OFFSET_COUNTS: number;

export function emulatedHorn(id: number): Horn;

export function linkRadians(counts: number, horn: Horn): number;

export function statusWithLinkAngles<T extends { joints?: unknown }>(status: T, hornFor: (id: number) => Horn): T;
