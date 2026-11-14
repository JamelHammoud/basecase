export const DEFAULT_UNIT: 'robot';

export const MAX_UNITS: number;

export function isUnitName(name: unknown): name is string;

export function unitOf(ask: unknown): string | null;

export function nextUnitName(taken: Iterable<string>): string;

export function versionOf(ref: { kind: 'policy'; id: string } | { kind: 'skill'; hash: string } | null): string | null;
