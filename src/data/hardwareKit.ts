import type { HardwareSpec } from './hardware';

export interface HoleRow {
  label: string;
  value: string;
  unit: string;
}

export interface Fact {
  label: string;
  value: string;
  unit?: string;
}

export type Box = { width: number; height: number; depth: number };

export interface MotionHardware {
  name: (spec: HardwareSpec) => string;
  dimensions: (spec: HardwareSpec) => Box;
  facts: (spec: HardwareSpec) => Fact[];
  holes: (spec: HardwareSpec) => HoleRow[];
  note: (spec: HardwareSpec) => string;
  shop: (spec: HardwareSpec) => string;
  sizeLabel?: (size: string) => string;
  sizeColumns?: number;
  massG?: (spec: HardwareSpec) => number;
  seat?: (spec: HardwareSpec) => { name: string; diameter: number };
  cutToLength?: boolean;
}

export const round2 = (v: number) => Math.round(v * 100) / 100;
export const box = (w: number, h: number, d = w): Box => ({ width: round2(w), height: round2(h), depth: round2(d) });
export const holeRow = (label: string, value: string, unit = 'mm'): HoleRow => ({ label, value, unit });

export const r2 = (v: number) => `${round2(v)}`;

export const boreFacts = (d: number, D: number, B: number, widthLabel = 'Width'): Fact[] => [
  { label: 'Bore', value: `${d}`, unit: 'mm' },
  { label: 'OD', value: `${D}`, unit: 'mm' },
  { label: widthLabel, value: `${B}`, unit: 'mm' },
];

export const seatHoles = (D: number, d: number) => [
  holeRow('Housing, press fit', `Ø${r2(D + 0.1)}`),
  holeRow('Shaft', `Ø${d}`),
];
