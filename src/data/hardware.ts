export type HardwareType =
  | 'socket_head'
  | 'button_head'
  | 'countersunk'
  | 'pan_head'
  | 'hex_bolt'
  | 'set_screw'
  | 'hex_nut'
  | 'lock_nut'
  | 'square_nut'
  | 'washer'
  | 'large_washer'
  | 'heat_insert'
  | 'standoff_mf'
  | 'standoff_ff'
  | 'dowel_pin'
  | 'bearing';

export interface HardwareSpec {
  type: HardwareType;
  size: string;
  length?: number;
  finish?: HardwareFinish;
  drive?: ScrewDrive;
}

export type ScrewDrive = 'hex' | 'torx' | 'phillips' | 'pozidriv' | 'slotted';

export const DRIVES: Record<ScrewDrive, { label: string }> = {
  hex: { label: 'Hex' },
  torx: { label: 'Torx' },
  phillips: { label: 'Phillips' },
  pozidriv: { label: 'Pozidriv' },
  slotted: { label: 'Slotted' },
};

export type HardwareFinish = 'black' | 'stainless' | 'zinc' | 'brass' | 'nylon' | 'steel';

export const FINISHES: Record<HardwareFinish, { label: string; color: string; shop: string }> = {
  black: { label: 'Black', color: '#2b2b30', shop: 'black oxide alloy steel' },
  stainless: { label: 'Stainless', color: '#c7c9cf', shop: 'stainless steel' },
  zinc: { label: 'Zinc', color: '#d4d8df', shop: 'zinc plated steel' },
  brass: { label: 'Brass', color: '#c9a14a', shop: 'brass' },
  nylon: { label: 'Nylon', color: '#e6e2d6', shop: 'nylon' },
  steel: { label: 'Steel', color: '#b9bcc2', shop: 'hardened steel' },
};

export const METRIC_SIZES = ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12'] as const;
export type MetricSize = (typeof METRIC_SIZES)[number];

export const THREAD: Record<MetricSize, { d: number; pitch: number }> = {
  M2: { d: 2, pitch: 0.4 },
  'M2.5': { d: 2.5, pitch: 0.45 },
  M3: { d: 3, pitch: 0.5 },
  M4: { d: 4, pitch: 0.7 },
  M5: { d: 5, pitch: 0.8 },
  M6: { d: 6, pitch: 1.0 },
  M8: { d: 8, pitch: 1.25 },
  M10: { d: 10, pitch: 1.5 },
  M12: { d: 12, pitch: 1.75 },
};

export const HOLES: Record<MetricSize, { clearance: number; close: number; tap: number }> = {
  M2: { clearance: 2.4, close: 2.2, tap: 1.6 },
  'M2.5': { clearance: 2.9, close: 2.7, tap: 2.05 },
  M3: { clearance: 3.4, close: 3.2, tap: 2.5 },
  M4: { clearance: 4.5, close: 4.3, tap: 3.3 },
  M5: { clearance: 5.5, close: 5.3, tap: 4.2 },
  M6: { clearance: 6.6, close: 6.4, tap: 5.0 },
  M8: { clearance: 9, close: 8.4, tap: 6.8 },
  M10: { clearance: 11, close: 10.5, tap: 8.5 },
  M12: { clearance: 13.5, close: 13, tap: 10.2 },
};

type Table<T> = Partial<Record<MetricSize, T>>;

export const SOCKET_HEAD: Table<{ dk: number; k: number; s: number }> = {
  M2: { dk: 3.8, k: 2, s: 1.5 },
  'M2.5': { dk: 4.5, k: 2.5, s: 2 },
  M3: { dk: 5.5, k: 3, s: 2.5 },
  M4: { dk: 7, k: 4, s: 3 },
  M5: { dk: 8.5, k: 5, s: 4 },
  M6: { dk: 10, k: 6, s: 5 },
  M8: { dk: 13, k: 8, s: 6 },
  M10: { dk: 16, k: 10, s: 8 },
  M12: { dk: 18, k: 12, s: 10 },
};

export const BUTTON_HEAD: Table<{ dk: number; k: number; s: number }> = {
  M2: { dk: 3.5, k: 1.3, s: 1.3 },
  'M2.5': { dk: 4.6, k: 1.5, s: 1.5 },
  M3: { dk: 5.7, k: 1.65, s: 2 },
  M4: { dk: 7.6, k: 2.2, s: 2.5 },
  M5: { dk: 9.5, k: 2.75, s: 3 },
  M6: { dk: 10.5, k: 3.3, s: 4 },
  M8: { dk: 14, k: 4.4, s: 5 },
  M10: { dk: 17.5, k: 5.5, s: 6 },
  M12: { dk: 21, k: 6.6, s: 8 },
};

export const COUNTERSUNK: Table<{ dk: number; k: number; s: number }> = {
  M2: { dk: 4.4, k: 1.2, s: 1.3 },
  'M2.5': { dk: 5.1, k: 1.55, s: 1.5 },
  M3: { dk: 6.72, k: 1.86, s: 2 },
  M4: { dk: 8.96, k: 2.48, s: 2.5 },
  M5: { dk: 11.2, k: 3.1, s: 3 },
  M6: { dk: 13.44, k: 3.72, s: 4 },
  M8: { dk: 17.92, k: 4.96, s: 5 },
  M10: { dk: 22.4, k: 6.2, s: 6 },
  M12: { dk: 26.88, k: 7.44, s: 8 },
};

type DriveHead = { dk: number; k: number; recess: string };

type CrossDrive = 'torx' | 'phillips' | 'pozidriv' | 'slotted';

const pozidrivOf = (t: Table<DriveHead>): Table<DriveHead> =>
  Object.fromEntries(Object.entries(t).map(([s, h]) => [s, { ...h, recess: h.recess.replace('PH', 'PZ') }]));

const COUNTERSUNK_CROSS: Table<DriveHead> = {
  M2: { dk: 3.8, k: 1.2, recess: 'PH0' },
  'M2.5': { dk: 4.7, k: 1.5, recess: 'PH1' },
  M3: { dk: 5.6, k: 1.65, recess: 'PH1' },
  M4: { dk: 7.5, k: 2.2, recess: 'PH2' },
  M5: { dk: 9.2, k: 2.5, recess: 'PH2' },
  M6: { dk: 11, k: 3, recess: 'PH3' },
  M8: { dk: 14.5, k: 4, recess: 'PH4' },
  M10: { dk: 18, k: 5, recess: 'PH4' },
};

export const COUNTERSUNK_BY_DRIVE: Record<CrossDrive, Table<DriveHead>> = {
  torx: {
    M2: { dk: 4.4, k: 1.2, recess: 'T6' },
    'M2.5': { dk: 5.5, k: 1.5, recess: 'T8' },
    M3: { dk: 6.3, k: 1.65, recess: 'T10' },
    M4: { dk: 9.4, k: 2.7, recess: 'T20' },
    M5: { dk: 10.4, k: 2.7, recess: 'T25' },
    M6: { dk: 12.6, k: 3.3, recess: 'T30' },
    M8: { dk: 17.3, k: 4.65, recess: 'T45' },
    M10: { dk: 20, k: 5, recess: 'T50' },
  },
  phillips: COUNTERSUNK_CROSS,
  pozidriv: pozidrivOf(COUNTERSUNK_CROSS),
  slotted: {
    M2: { dk: 3.8, k: 1.2, recess: '0.56' },
    'M2.5': { dk: 4.7, k: 1.5, recess: '0.66' },
    M3: { dk: 5.6, k: 1.65, recess: '0.86' },
    M4: { dk: 7.5, k: 2.2, recess: '1.06' },
    M5: { dk: 9.2, k: 2.5, recess: '1.26' },
    M6: { dk: 11, k: 3, recess: '1.66' },
    M8: { dk: 14.5, k: 4, recess: '2.06' },
    M10: { dk: 18, k: 5, recess: '2.56' },
    M12: { dk: 22, k: 6, recess: '3.06' },
  },
};

const PAN_CROSS: Table<DriveHead> = {
  M2: { dk: 4, k: 1.6, recess: 'PH0' },
  'M2.5': { dk: 5, k: 2.1, recess: 'PH1' },
  M3: { dk: 5.6, k: 2.4, recess: 'PH1' },
  M4: { dk: 8, k: 3.1, recess: 'PH2' },
  M5: { dk: 9.5, k: 3.7, recess: 'PH2' },
  M6: { dk: 12, k: 4.6, recess: 'PH3' },
  M8: { dk: 16, k: 6, recess: 'PH4' },
  M10: { dk: 20, k: 7.5, recess: 'PH4' },
};

export const PAN_HEAD: Record<CrossDrive, Table<DriveHead>> = {
  phillips: PAN_CROSS,
  pozidriv: pozidrivOf(PAN_CROSS),
  torx: {
    M2: { dk: 4, k: 1.6, recess: 'T6' },
    'M2.5': { dk: 5, k: 2.1, recess: 'T8' },
    M3: { dk: 5.6, k: 2.4, recess: 'T10' },
    M4: { dk: 8, k: 3.1, recess: 'T20' },
    M5: { dk: 9.5, k: 3.7, recess: 'T25' },
    M6: { dk: 12, k: 4.6, recess: 'T30' },
    M8: { dk: 16, k: 6, recess: 'T45' },
    M10: { dk: 20, k: 7.5, recess: 'T50' },
  },
  slotted: {
    M2: { dk: 4, k: 1.3, recess: '0.7' },
    'M2.5': { dk: 5, k: 1.5, recess: '0.8' },
    M3: { dk: 5.6, k: 1.8, recess: '1' },
    M4: { dk: 8, k: 2.4, recess: '1.51' },
    M5: { dk: 9.5, k: 3, recess: '1.51' },
    M6: { dk: 12, k: 3.6, recess: '1.91' },
    M8: { dk: 16, k: 4.8, recess: '2.31' },
    M10: { dk: 20, k: 6, recess: '2.81' },
  },
};

export const SOCKET_HEAD_TORX: Table<string> = {
  M2: 'T6',
  'M2.5': 'T8',
  M3: 'T10',
  M4: 'T20',
  M5: 'T25',
  M6: 'T30',
  M8: 'T45',
  M10: 'T50',
  M12: 'T55',
};

export const BUTTON_HEAD_TORX: Table<string> = {
  M2: 'T6',
  'M2.5': 'T8',
  M3: 'T10',
  M4: 'T20',
  M5: 'T25',
  M6: 'T30',
  M8: 'T40',
  M10: 'T50',
  M12: 'T55',
};

export const TORX_RECESS: Record<string, { A: number; B: number }> = {
  T5: { A: 1.42, B: 1.03 },
  T6: { A: 1.75, B: 1.27 },
  T8: { A: 2.4, B: 1.75 },
  T10: { A: 2.8, B: 2.05 },
  T15: { A: 3.35, B: 2.4 },
  T20: { A: 3.95, B: 2.85 },
  T25: { A: 4.5, B: 3.25 },
  T30: { A: 5.6, B: 4.05 },
  T40: { A: 6.75, B: 4.85 },
  T45: { A: 7.93, B: 5.64 },
  T50: { A: 8.95, B: 6.45 },
  T55: { A: 11.35, B: 8.05 },
};

export const CROSS_RECESS: Record<string, { m: number; depth: number }> = {
  PH0: { m: 1.9, depth: 1.1 },
  PH1: { m: 3.1, depth: 2 },
  PH2: { m: 5.3, depth: 3.27 },
  PH3: { m: 6.8, depth: 3.53 },
  PH4: { m: 10, depth: 5.88 },
  PZ0: { m: 1.95, depth: 1.1 },
  PZ1: { m: 3.0, depth: 1.9 },
  PZ2: { m: 5.2, depth: 3.1 },
  PZ3: { m: 6.6, depth: 3.4 },
  PZ4: { m: 9.8, depth: 5.7 },
};

export const HEX_BOLT: Table<{ s: number; k: number }> = {
  M2: { s: 4, k: 1.4 },
  'M2.5': { s: 5, k: 1.7 },
  M3: { s: 5.5, k: 2 },
  M4: { s: 7, k: 2.8 },
  M5: { s: 8, k: 3.5 },
  M6: { s: 10, k: 4 },
  M8: { s: 13, k: 5.3 },
  M10: { s: 16, k: 6.4 },
  M12: { s: 18, k: 7.5 },
};

export const SET_SCREW_SLOT: Table<{ n: number; t: number }> = {
  M2: { n: 0.25, t: 0.64 },
  'M2.5': { n: 0.4, t: 0.72 },
  M3: { n: 0.4, t: 0.8 },
  M4: { n: 0.6, t: 1.12 },
  M5: { n: 0.8, t: 1.28 },
  M6: { n: 1, t: 1.6 },
  M8: { n: 1.2, t: 2 },
  M10: { n: 1.6, t: 2.4 },
  M12: { n: 2, t: 2.8 },
};

export const SET_SCREW: Table<{ s: number }> = {
  M2: { s: 0.9 },
  'M2.5': { s: 1.3 },
  M3: { s: 1.5 },
  M4: { s: 2 },
  M5: { s: 2.5 },
  M6: { s: 3 },
  M8: { s: 4 },
  M10: { s: 5 },
  M12: { s: 6 },
};

export const HEX_NUT: Table<{ s: number; m: number }> = {
  M2: { s: 4, m: 1.6 },
  'M2.5': { s: 5, m: 2 },
  M3: { s: 5.5, m: 2.4 },
  M4: { s: 7, m: 3.2 },
  M5: { s: 8, m: 4.7 },
  M6: { s: 10, m: 5.2 },
  M8: { s: 13, m: 6.8 },
  M10: { s: 16, m: 8.4 },
  M12: { s: 18, m: 10.8 },
};

export const LOCK_NUT: Table<{ s: number; h: number }> = {
  M2: { s: 4, h: 2.9 },
  'M2.5': { s: 5, h: 3.1 },
  M3: { s: 5.5, h: 4 },
  M4: { s: 7, h: 5 },
  M5: { s: 8, h: 5 },
  M6: { s: 10, h: 6 },
  M8: { s: 13, h: 8 },
  M10: { s: 16, h: 10 },
  M12: { s: 18, h: 12 },
};

export const SQUARE_NUT: Table<{ s: number; m: number }> = {
  M2: { s: 4, m: 1.2 },
  'M2.5': { s: 5, m: 1.6 },
  M3: { s: 5.5, m: 1.8 },
  M4: { s: 7, m: 2.2 },
  M5: { s: 8, m: 2.7 },
  M6: { s: 10, m: 3.2 },
  M8: { s: 13, m: 4 },
};

export const WASHER: Table<{ d1: number; d2: number; h: number }> = {
  M2: { d1: 2.2, d2: 5, h: 0.3 },
  'M2.5': { d1: 2.7, d2: 6, h: 0.5 },
  M3: { d1: 3.2, d2: 7, h: 0.5 },
  M4: { d1: 4.3, d2: 9, h: 0.8 },
  M5: { d1: 5.3, d2: 10, h: 1 },
  M6: { d1: 6.4, d2: 12, h: 1.6 },
  M8: { d1: 8.4, d2: 16, h: 1.6 },
  M10: { d1: 10.5, d2: 20, h: 2 },
  M12: { d1: 13, d2: 24, h: 2.5 },
};

export const LARGE_WASHER: Table<{ d1: number; d2: number; h: number }> = {
  M3: { d1: 3.2, d2: 9, h: 0.8 },
  M4: { d1: 4.3, d2: 12, h: 1 },
  M5: { d1: 5.3, d2: 15, h: 1 },
  M6: { d1: 6.4, d2: 18, h: 1.6 },
  M8: { d1: 8.4, d2: 24, h: 2 },
  M10: { d1: 10.5, d2: 30, h: 2.5 },
  M12: { d1: 13, d2: 37, h: 3 },
};

export const HEAT_INSERT: Table<{ od: number; l: number; hole: number }> = {
  M2: { od: 3.6, l: 3, hole: 3.2 },
  'M2.5': { od: 4.6, l: 4, hole: 4 },
  M3: { od: 4.6, l: 5.7, hole: 4 },
  M4: { od: 6.3, l: 8.1, hole: 5.6 },
  M5: { od: 7.1, l: 9.5, hole: 6.4 },
  M6: { od: 8.7, l: 12.7, hole: 8 },
};

export const STANDOFF: Table<{ s: number; male: number }> = {
  M2: { s: 4, male: 4 },
  'M2.5': { s: 5, male: 6 },
  M3: { s: 5, male: 6 },
};

export const BEARINGS: Record<string, { d: number; D: number; B: number }> = {
  MR63: { d: 3, D: 6, B: 2.5 },
  MR85: { d: 5, D: 8, B: 2.5 },
  MR105: { d: 5, D: 10, B: 4 },
  MR115: { d: 5, D: 11, B: 4 },
  '603': { d: 3, D: 9, B: 5 },
  '604': { d: 4, D: 12, B: 4 },
  '605': { d: 5, D: 14, B: 5 },
  '623': { d: 3, D: 10, B: 4 },
  '624': { d: 4, D: 13, B: 5 },
  '625': { d: 5, D: 16, B: 5 },
  '626': { d: 6, D: 19, B: 6 },
  '608': { d: 8, D: 22, B: 7 },
  '688': { d: 8, D: 16, B: 5 },
  '6700': { d: 10, D: 15, B: 4 },
  '6800': { d: 10, D: 19, B: 5 },
  '6000': { d: 10, D: 26, B: 8 },
  '6001': { d: 12, D: 28, B: 8 },
  '6200': { d: 10, D: 30, B: 9 },
};

export const DOWEL_LENGTHS: Record<string, number[]> = {
  '2': [4, 5, 6, 8, 10, 12, 14, 16, 18, 20],
  '3': [4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24, 25, 30],
  '4': [6, 8, 10, 12, 14, 16, 18, 20, 24, 25, 30, 35, 40],
  '5': [8, 10, 12, 14, 16, 18, 20, 24, 25, 30, 35, 40, 45, 50],
  '6': [10, 12, 14, 16, 18, 20, 24, 25, 30, 35, 40, 45, 50, 55, 60],
  '8': [12, 16, 20, 24, 25, 30, 35, 40, 45, 50, 60, 70, 80],
};

const PREFERRED_LENGTHS = [
  2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 25, 28, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75,
  80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200,
];
const between = (min: number, max: number) => PREFERRED_LENGTHS.filter((l) => l >= min && l <= max);

const SCREW_LENGTHS: Record<MetricSize, number[]> = {
  M2: between(3, 25),
  'M2.5': between(3, 30),
  M3: between(3, 60),
  M4: between(4, 80),
  M5: between(5, 100),
  M6: between(6, 120),
  M8: between(8, 150),
  M10: between(10, 200),
  M12: between(12, 200),
};

const SET_SCREW_LENGTHS: Record<MetricSize, number[]> = {
  M2: between(2, 10),
  'M2.5': between(2, 12),
  M3: between(2, 20),
  M4: between(3, 25),
  M5: between(4, 30),
  M6: between(5, 40),
  M8: between(6, 50),
  M10: between(8, 60),
  M12: between(10, 60),
};

const STANDOFF_LENGTHS = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 25, 28, 30, 35, 40, 45, 50, 60,
];

export const MAX_CUSTOM_LENGTH = 300;
export const LENGTH_STEP = 0.5;

export interface HardwareTypeInfo {
  type: HardwareType;
  name: string;
  description: string;
  group: 'Screws' | 'Nuts & Washers' | 'Inserts & Standoffs' | 'Pins & Bearings';
  color: string;
  finishes: HardwareFinish[];
  sizes: string[];
  defaultSize: string;
  lengths?: (size: string) => number[];
  defaultLength?: (size: string) => number;
}

const sizesOf = (t: Table<unknown>) => METRIC_SIZES.filter((s) => t[s]);
const pickLength = (list: number[], ideal: number) =>
  list.reduce((best, l) => (Math.abs(l - ideal) < Math.abs(best - ideal) ? l : best), list[0]);
const screwLengths = (size: string) => SCREW_LENGTHS[size as MetricSize] ?? [];
const defaultScrewLength = (size: string) => pickLength(screwLengths(size), (THREAD[size as MetricSize]?.d ?? 3) * 3.4);

export const HARDWARE_TYPES: HardwareTypeInfo[] = [
  {
    type: 'socket_head',
    name: 'Socket Head Screw',
    description: 'Cap screw with a tall round head',
    group: 'Screws',
    color: '#2b2b30',
    finishes: ['black', 'stainless', 'zinc'],
    sizes: sizesOf(SOCKET_HEAD),
    defaultSize: 'M3',
    lengths: screwLengths,
    defaultLength: defaultScrewLength,
  },
  {
    type: 'button_head',
    name: 'Button Head Screw',
    description: 'Low dome head',
    group: 'Screws',
    color: '#c7c9cf',
    finishes: ['stainless', 'black', 'zinc'],
    sizes: sizesOf(BUTTON_HEAD),
    defaultSize: 'M3',
    lengths: screwLengths,
    defaultLength: defaultScrewLength,
  },
  {
    type: 'countersunk',
    name: 'Countersunk Screw',
    description: '90° flat head, sits flush',
    group: 'Screws',
    color: '#c7c9cf',
    finishes: ['stainless', 'black', 'zinc'],
    sizes: sizesOf(COUNTERSUNK),
    defaultSize: 'M3',
    lengths: screwLengths,
    defaultLength: defaultScrewLength,
  },
  {
    type: 'pan_head',
    name: 'Pan Head Screw',
    description: 'Low rounded head, common on electronics and servos',
    group: 'Screws',
    color: '#c7c9cf',
    finishes: ['zinc', 'stainless', 'black'],
    sizes: sizesOf(PAN_HEAD.phillips),
    defaultSize: 'M3',
    lengths: screwLengths,
    defaultLength: defaultScrewLength,
  },
  {
    type: 'hex_bolt',
    name: 'Hex Bolt',
    description: 'ISO 4017 hex head',
    group: 'Screws',
    color: '#b9bcc2',
    finishes: ['zinc', 'stainless', 'black'],
    sizes: sizesOf(HEX_BOLT),
    defaultSize: 'M4',
    lengths: screwLengths,
    defaultLength: defaultScrewLength,
  },
  {
    type: 'set_screw',
    name: 'Set Screw',
    description: 'Grub screw, flat point',
    group: 'Screws',
    color: '#2b2b30',
    finishes: ['black', 'stainless'],
    sizes: sizesOf(SET_SCREW),
    defaultSize: 'M3',
    lengths: (s) => SET_SCREW_LENGTHS[s as MetricSize] ?? [],
    defaultLength: (s) =>
      pickLength(SET_SCREW_LENGTHS[s as MetricSize] ?? [4], (THREAD[s as MetricSize]?.d ?? 3) * 1.4),
  },
  {
    type: 'hex_nut',
    name: 'Hex Nut',
    description: 'ISO 4032 regular nut',
    group: 'Nuts & Washers',
    color: '#c7c9cf',
    finishes: ['stainless', 'zinc', 'black'],
    sizes: sizesOf(HEX_NUT),
    defaultSize: 'M3',
  },
  {
    type: 'lock_nut',
    name: 'Lock Nut',
    description: 'DIN 985 nylon insert',
    group: 'Nuts & Washers',
    color: '#c7c9cf',
    finishes: ['stainless', 'zinc', 'black'],
    sizes: sizesOf(LOCK_NUT),
    defaultSize: 'M3',
  },
  {
    type: 'square_nut',
    name: 'Square Nut',
    description: 'DIN 562 thin, for printed slots',
    group: 'Nuts & Washers',
    color: '#c7c9cf',
    finishes: ['stainless', 'zinc'],
    sizes: sizesOf(SQUARE_NUT),
    defaultSize: 'M3',
  },
  {
    type: 'washer',
    name: 'Washer',
    description: 'ISO 7089 flat washer',
    group: 'Nuts & Washers',
    color: '#c7c9cf',
    finishes: ['stainless', 'zinc', 'black'],
    sizes: sizesOf(WASHER),
    defaultSize: 'M3',
  },
  {
    type: 'large_washer',
    name: 'Large Washer',
    description: 'ISO 7093 wide washer',
    group: 'Nuts & Washers',
    color: '#c7c9cf',
    finishes: ['stainless', 'zinc', 'black'],
    sizes: sizesOf(LARGE_WASHER),
    defaultSize: 'M3',
  },
  {
    type: 'heat_insert',
    name: 'Heat-Set Insert',
    description: 'Brass insert melted into printed parts',
    group: 'Inserts & Standoffs',
    color: '#c9a14a',
    finishes: ['brass'],
    sizes: sizesOf(HEAT_INSERT),
    defaultSize: 'M3',
  },
  {
    type: 'standoff_mf',
    name: 'Standoff M–F',
    description: 'Brass hex spacer, male to female',
    group: 'Inserts & Standoffs',
    color: '#c9a14a',
    finishes: ['brass', 'stainless', 'nylon'],
    sizes: sizesOf(STANDOFF),
    defaultSize: 'M3',
    lengths: () => STANDOFF_LENGTHS,
    defaultLength: () => 10,
  },
  {
    type: 'standoff_ff',
    name: 'Standoff F–F',
    description: 'Brass hex spacer, female both ends',
    group: 'Inserts & Standoffs',
    color: '#c9a14a',
    finishes: ['brass', 'stainless', 'nylon'],
    sizes: sizesOf(STANDOFF),
    defaultSize: 'M3',
    lengths: () => STANDOFF_LENGTHS,
    defaultLength: () => 10,
  },
  {
    type: 'dowel_pin',
    name: 'Dowel Pin',
    description: 'ISO 8734 hardened pin, Ø in mm',
    group: 'Pins & Bearings',
    color: '#b9bcc2',
    finishes: ['steel', 'stainless'],
    sizes: Object.keys(DOWEL_LENGTHS),
    defaultSize: '3',
    lengths: (s) => DOWEL_LENGTHS[s] ?? [],
    defaultLength: (s) => (DOWEL_LENGTHS[s] ?? [10])[2] ?? 10,
  },
  {
    type: 'bearing',
    name: 'Ball Bearing',
    description: 'Deep groove, shielded',
    group: 'Pins & Bearings',
    color: '#b7bcc4',
    finishes: ['steel'],
    sizes: Object.keys(BEARINGS),
    defaultSize: '608',
  },
];

export const HARDWARE_BY_TYPE = Object.fromEntries(HARDWARE_TYPES.map((t) => [t.type, t])) as Record<
  HardwareType,
  HardwareTypeInfo
>;

export const isMetric = (size: string): size is MetricSize => (METRIC_SIZES as readonly string[]).includes(size);

export function nearestSize(type: HardwareType, wanted: string, sizes = HARDWARE_BY_TYPE[type].sizes): string {
  const info = HARDWARE_BY_TYPE[type];

  if (sizes.includes(wanted)) return wanted;

  if (isMetric(wanted) && sizes.every(isMetric)) {
    const d = THREAD[wanted].d;

    return sizes.reduce((best, s) =>
      Math.abs(THREAD[s as MetricSize].d - d) < Math.abs(THREAD[best as MetricSize].d - d) ? s : best,
    );
  }

  return sizes.includes(info.defaultSize) ? info.defaultSize : sizes[0];
}

export function lengthRange(type: HardwareType, size: string): { min: number; max: number } | null {
  const list = HARDWARE_BY_TYPE[type].lengths?.(size);

  if (!list?.length) return null;

  return { min: list[0], max: Math.max(MAX_CUSTOM_LENGTH, list[list.length - 1]) };
}

function pickDrive(type: HardwareType, drive?: ScrewDrive): ScrewDrive | undefined {
  const drives = driveOptions(type);

  if (!drives.length) return undefined;

  return drive && drives.includes(drive) ? drive : defaultDrive(type);
}

export type SpecOptions = Partial<Omit<HardwareSpec, 'type'>>;

export function makeSpec(type: HardwareType, { size, length, finish, drive }: SpecOptions = {}): HardwareSpec {
  const info = HARDWARE_BY_TYPE[type];
  const s = nearestSize(type, size ?? info.defaultSize);
  const f = finish && info.finishes.includes(finish) ? finish : info.finishes[0];
  const d = pickDrive(type, drive);
  const range = lengthRange(type, s);

  if (!range) return { type, size: s, finish: f, ...(d ? { drive: d } : {}) };

  const wanted = length !== undefined && Number.isFinite(length) ? length : (info.defaultLength?.(s) ?? range.min);
  const l = Math.min(range.max, Math.max(range.min, Math.round(wanted / LENGTH_STEP) * LENGTH_STEP));

  return { type, size: s, length: l, finish: f, ...(d ? { drive: d } : {}) };
}

export function driveOptions(type: HardwareType): ScrewDrive[] {
  switch (type) {
    case 'socket_head':
    case 'button_head':
    case 'countersunk':
    case 'pan_head':
      return ['hex', 'torx', 'phillips', 'pozidriv', 'slotted'];
    case 'set_screw':
      return ['hex', 'torx', 'slotted'];
    default:
      return [];
  }
}

export function defaultDrive(type: HardwareType): ScrewDrive | undefined {
  return type === 'pan_head' ? 'phillips' : driveOptions(type)[0];
}

export const hardwareDrive = (spec: HardwareSpec): ScrewDrive | undefined =>
  spec.drive && driveOptions(spec.type).includes(spec.drive) ? spec.drive : defaultDrive(spec.type);

export type ScrewRecess =
  | { kind: 'hex'; s: number }
  | { kind: 'torx'; size: string }
  | { kind: 'phillips'; size: string }
  | { kind: 'pozidriv'; size: string }
  | { kind: 'slot'; width: number };

type ScrewHead = { dk: number; k: number; recess: ScrewRecess };

const HEAD_STANDARD: Partial<Record<HardwareType, string>> = {
  socket_head: 'ISO 4762',
  button_head: 'ISO 7380-1',
  countersunk: 'ISO 10642',
  pan_head: 'ISO 7045',
  set_screw: 'ISO 4026',
};

const DRIVE_STANDARD: Partial<Record<HardwareType, Partial<Record<ScrewDrive, string>>>> = {
  socket_head: { hex: 'ISO 4762', torx: 'ISO 14579' },
  button_head: { hex: 'ISO 7380-1', torx: 'ISO 7380-1 TX' },
  countersunk: {
    hex: 'ISO 10642',
    torx: 'ISO 14581',
    phillips: 'ISO 7046-1 H',
    pozidriv: 'ISO 7046-1 Z',
    slotted: 'ISO 2009',
  },
  pan_head: { torx: 'ISO 14583', phillips: 'ISO 7045 H', pozidriv: 'ISO 7045 Z', slotted: 'ISO 1580' },
  set_screw: { hex: 'ISO 4026', slotted: 'ISO 4766' },
};

function tableHead(h: DriveHead | undefined, drive: CrossDrive): ScrewHead | null {
  if (!h) return null;

  if (drive === 'slotted') return { dk: h.dk, k: h.k, recess: { kind: 'slot', width: Number(h.recess) } };

  return { dk: h.dk, k: h.k, recess: { kind: drive, size: h.recess } };
}

const withRecess = (h: { dk: number; k: number } | undefined, recess: ScrewRecess | null): ScrewHead | null =>
  h && recess ? { dk: h.dk, k: h.k, recess } : null;

const hexHead = (h: { dk: number; k: number; s: number } | undefined) =>
  withRecess(h, h ? { kind: 'hex', s: h.s } : null);

function capHead(
  heads: Table<{ dk: number; k: number; s: number }>,
  torx: Table<string>,
  drive: ScrewDrive,
  size: MetricSize,
): ScrewHead | null {
  if (drive === 'hex') return hexHead(heads[size]);

  if (drive !== 'torx') return null;

  const t = torx[size];

  return withRecess(heads[size], t ? { kind: 'torx', size: t } : null);
}

const STANDARD_HEADS: Partial<Record<HardwareType, (drive: ScrewDrive, size: MetricSize) => ScrewHead | null>> = {
  socket_head: (drive, size) => capHead(SOCKET_HEAD, SOCKET_HEAD_TORX, drive, size),
  button_head: (drive, size) => capHead(BUTTON_HEAD, BUTTON_HEAD_TORX, drive, size),
  countersunk: (drive, size) =>
    drive === 'hex' ? hexHead(COUNTERSUNK[size]) : tableHead(COUNTERSUNK_BY_DRIVE[drive][size], drive),
  pan_head: (drive, size) => (drive === 'hex' ? null : tableHead(PAN_HEAD[drive][size], drive)),
};

function standardHead(type: HardwareType, drive: ScrewDrive, size: MetricSize): ScrewHead | null {
  return STANDARD_HEADS[type]?.(drive, size) ?? null;
}

const CROSS_NUMBER: Record<MetricSize, number> = {
  M2: 0,
  'M2.5': 1,
  M3: 1,
  M4: 2,
  M5: 2,
  M6: 3,
  M8: 4,
  M10: 4,
  M12: 4,
};
const SLOT_WIDTH: Record<MetricSize, number> = {
  M2: 0.7,
  'M2.5': 0.8,
  M3: 1,
  M4: 1.51,
  M5: 1.51,
  M6: 1.91,
  M8: 2.31,
  M10: 2.81,
  M12: 3.06,
};
const SET_SCREW_TORX: Record<MetricSize, string> = {
  M2: 'T5',
  'M2.5': 'T5',
  M3: 'T6',
  M4: 'T8',
  M5: 'T10',
  M6: 'T15',
  M8: 'T25',
  M10: 'T30',
  M12: 'T40',
};

function commercialRecess(type: HardwareType, drive: ScrewDrive, size: MetricSize): ScrewRecess {
  switch (drive) {
    case 'hex':
      return { kind: 'hex', s: (type === 'set_screw' ? SET_SCREW : BUTTON_HEAD)[size]!.s };
    case 'torx':
      return { kind: 'torx', size: type === 'set_screw' ? SET_SCREW_TORX[size] : SOCKET_HEAD_TORX[size]! };
    case 'phillips':
      return { kind: 'phillips', size: `PH${CROSS_NUMBER[size]}` };
    case 'pozidriv':
      return { kind: 'pozidriv', size: `PZ${CROSS_NUMBER[size]}` };
    case 'slotted':
      return { kind: 'slot', width: type === 'set_screw' ? SET_SCREW_SLOT[size]!.n : SLOT_WIDTH[size] };
  }
}

function plainHead(type: HardwareType, size: MetricSize): { dk: number; k: number } | undefined {
  switch (type) {
    case 'socket_head':
      return SOCKET_HEAD[size];
    case 'button_head':
      return BUTTON_HEAD[size];
    case 'countersunk':
      return COUNTERSUNK[size];
    case 'pan_head':
      return PAN_HEAD.phillips[size];
    default:
      return undefined;
  }
}

export function screwHead(spec: HardwareSpec): ScrewHead | null {
  const d = hardwareDrive(spec);

  if (!d || !isMetric(spec.size)) return null;

  const exact = standardHead(spec.type, d, spec.size);

  if (exact) return exact;

  const h = plainHead(spec.type, spec.size);

  return h ? { dk: h.dk, k: h.k, recess: commercialRecess(spec.type, d, spec.size) } : null;
}

export function setScrewRecess(spec: HardwareSpec): { recess: ScrewRecess; depth: number } | null {
  if (spec.type !== 'set_screw' || !isMetric(spec.size)) return null;

  const d = hardwareDrive(spec) ?? 'hex';
  const recess = commercialRecess('set_screw', d, spec.size);
  const L = spec.length ?? 0;

  if (recess.kind === 'slot') return { recess, depth: Math.min(L * 0.6, SET_SCREW_SLOT[spec.size]!.t) };

  return { recess, depth: Math.min(L * 0.6, SET_SCREW[spec.size]!.s * 0.8) };
}

function isStandardDrive(spec: HardwareSpec): boolean {
  const d = hardwareDrive(spec);

  if (!d || !isMetric(spec.size) || !DRIVE_STANDARD[spec.type]?.[d]) return false;

  return spec.type === 'set_screw'
    ? d === 'hex' || !!SET_SCREW_SLOT[spec.size]
    : !!standardHead(spec.type, d, spec.size);
}

export function screwStandard(spec: HardwareSpec): string {
  const base = HEAD_STANDARD[spec.type];

  if (!base) return '';

  if (isStandardDrive(spec)) return DRIVE_STANDARD[spec.type]![hardwareDrive(spec)!]!;

  return spec.type === 'set_screw' ? `${base} form` : `${base} head`;
}

export function hardwareSubtitle(spec: HardwareSpec): string {
  const standard = screwStandard(spec);
  const description = HARDWARE_BY_TYPE[spec.type].description;

  return standard && !description.startsWith(standard) ? `${standard} · ${description}` : description;
}

export function recessLabel(r: ScrewRecess): string {
  if (r.kind === 'hex') return `${r.s} mm hex key`;

  return r.kind === 'slot' ? `${r.width} mm slot` : r.size;
}

export const hardwareFinish = (spec: HardwareSpec): HardwareFinish =>
  spec.finish ?? HARDWARE_BY_TYPE[spec.type].finishes[0];

export const hardwareColor = (spec: HardwareSpec): string => FINISHES[hardwareFinish(spec)].color;

export const stockLengths = (spec: HardwareSpec): number[] => HARDWARE_BY_TYPE[spec.type].lengths?.(spec.size) ?? [];

export const isStockLength = (spec: HardwareSpec): boolean =>
  spec.length === undefined || stockLengths(spec).includes(spec.length);

export function nearestStockLengths(spec: HardwareSpec): number[] {
  const list = stockLengths(spec);

  if (spec.length === undefined || !list.length) return [];

  const below = [...list].reverse().find((l) => l < spec.length!);
  const above = list.find((l) => l > spec.length!);

  return [below, above].filter((l): l is number => l !== undefined);
}

export interface HardwareFamily {
  id: string;
  name: string;
  typeLabel?: string;
  types: Array<{ type: HardwareType; label: string }>;
  description: string;
}

export const HARDWARE_FAMILIES: HardwareFamily[] = [
  {
    id: 'screws',
    name: 'Screws',
    typeLabel: 'Head',
    description: 'Socket, button, flat, pan, hex, set',
    types: [
      { type: 'socket_head', label: 'Socket' },
      { type: 'button_head', label: 'Button' },
      { type: 'countersunk', label: 'Flat' },
      { type: 'pan_head', label: 'Pan' },
      { type: 'hex_bolt', label: 'Hex' },
      { type: 'set_screw', label: 'Set' },
    ],
  },
  {
    id: 'nuts',
    name: 'Nuts',
    typeLabel: 'Style',
    description: 'Hex, nylon lock, square',
    types: [
      { type: 'hex_nut', label: 'Hex' },
      { type: 'lock_nut', label: 'Lock' },
      { type: 'square_nut', label: 'Square' },
    ],
  },
  {
    id: 'washers',
    name: 'Washers',
    typeLabel: 'Style',
    description: 'Standard, large',
    types: [
      { type: 'washer', label: 'Standard' },
      { type: 'large_washer', label: 'Large' },
    ],
  },
  {
    id: 'inserts',
    name: 'Heat-Set Inserts',
    description: 'Brass, for printed parts',
    types: [{ type: 'heat_insert', label: 'Insert' }],
  },
  {
    id: 'standoffs',
    name: 'Standoffs',
    typeLabel: 'Ends',
    description: 'Male–female, female–female',
    types: [
      { type: 'standoff_mf', label: 'Male–Female' },
      { type: 'standoff_ff', label: 'Female–Female' },
    ],
  },
  { id: 'pins', name: 'Dowel Pins', description: 'Ø2–8 mm, hardened', types: [{ type: 'dowel_pin', label: 'Pin' }] },
  {
    id: 'bearings',
    name: 'Ball Bearings',
    description: 'Deep groove, 3–12 mm bore',
    types: [{ type: 'bearing', label: 'Bearing' }],
  },
];

export const familyOf = (type: HardwareType): HardwareFamily =>
  HARDWARE_FAMILIES.find((f) => f.types.some((t) => t.type === type))!;

export function hardwareName(spec: HardwareSpec): string {
  const info = HARDWARE_BY_TYPE[spec.type];
  const finish = hardwareFinish(spec) !== info.finishes[0] ? `, ${FINISHES[hardwareFinish(spec)].label}` : '';

  if (spec.type === 'bearing') return `${spec.size} Bearing`;

  if (spec.type === 'dowel_pin') return `Ø${spec.size} × ${spec.length} Dowel Pin${finish}`;

  const d = hardwareDrive(spec);
  const drive = d && d !== defaultDrive(spec.type) ? `${d === 'hex' ? 'Hex Socket' : DRIVES[d].label} ` : '';

  if (spec.length !== undefined) return `${spec.size} × ${spec.length} ${drive}${info.name}${finish}`;

  return `${spec.size} ${info.name}${finish}`;
}

export const hexCorners = (s: number) => s / Math.cos(Math.PI / 6);

type Box = { width: number; height: number; depth: number };

const round2 = (v: number) => Math.round(v * 100) / 100;
const box = (w: number, h: number, d = w): Box => ({ width: round2(w), height: round2(h), depth: round2(d) });

const DIMENSIONS: Record<HardwareType, (spec: HardwareSpec, size: MetricSize, L: number) => Box> = {
  socket_head: (_spec, size, L) => box(SOCKET_HEAD[size]!.dk, L + SOCKET_HEAD[size]!.k),
  button_head: (_spec, size, L) => box(BUTTON_HEAD[size]!.dk, L + BUTTON_HEAD[size]!.k),
  countersunk: (spec, _size, L) => box(screwHead(spec)!.dk, L),
  pan_head: (spec, _size, L) => {
    const h = screwHead(spec)!;

    return box(h.dk, L + h.k);
  },
  hex_bolt: (_spec, size, L) => {
    const h = HEX_BOLT[size]!;

    return box(hexCorners(h.s), L + h.k, h.s);
  },
  set_screw: (_spec, size, L) => box(THREAD[size].d, L),
  hex_nut: (_spec, size) => {
    const n = HEX_NUT[size]!;

    return box(hexCorners(n.s), n.m, n.s);
  },
  lock_nut: (_spec, size) => {
    const n = LOCK_NUT[size]!;

    return box(hexCorners(n.s), n.h, n.s);
  },
  square_nut: (_spec, size) => box(SQUARE_NUT[size]!.s, SQUARE_NUT[size]!.m),
  washer: (_spec, size) => box(WASHER[size]!.d2, WASHER[size]!.h),
  large_washer: (_spec, size) => box(LARGE_WASHER[size]!.d2, LARGE_WASHER[size]!.h),
  heat_insert: (_spec, size) => box(HEAT_INSERT[size]!.od, HEAT_INSERT[size]!.l),
  standoff_mf: (_spec, size, L) => {
    const so = STANDOFF[size]!;

    return box(hexCorners(so.s), L + so.male, so.s);
  },
  standoff_ff: (_spec, size, L) => {
    const so = STANDOFF[size]!;

    return box(hexCorners(so.s), L, so.s);
  },
  dowel_pin: (spec, _size, L) => box(Number(spec.size), L),
  bearing: (spec) => {
    const b = BEARINGS[spec.size];

    return box(b.D, b.B);
  },
};

export function hardwareDimensions(spec: HardwareSpec): { width: number; height: number; depth: number } {
  return DIMENSIONS[spec.type](spec, spec.size as MetricSize, spec.length ?? 0);
}

type MetricType = Exclude<HardwareType, 'bearing' | 'dowel_pin'>;

type Holes = (typeof HOLES)[MetricSize];

const nutAcrossFlats = (type: HardwareType, size: MetricSize) => (type === 'hex_nut' ? HEX_NUT : LOCK_NUT)[size]!.s;

const capScrewNote = (spec: HardwareSpec, _size: MetricSize, hole: Holes) => {
  const h = screwHead(spec)!;

  return `Clearance Ø${hole.clearance}, counterbore Ø${round2(h.dk + 0.6)} × ${round2(h.k + 0.3)} deep, tap Ø${hole.tap} mm.`;
};
const nutNote = (spec: HardwareSpec, size: MetricSize, hole: Holes) =>
  `Nut trap ${(nutAcrossFlats(spec.type, size) + 0.3).toFixed(1)} mm across flats, clearance Ø${hole.clearance} mm.`;
const washerNote = (_spec: HardwareSpec, size: MetricSize, hole: Holes) =>
  `Fits ${size}, clearance Ø${hole.clearance} mm.`;
const standoffNote = (_spec: HardwareSpec, size: MetricSize, hole: Holes) =>
  `${size} threads, ${STANDOFF[size]!.s} mm hex. Clearance Ø${hole.clearance} mm in mounting plates.`;

const NOTES: Record<MetricType, (spec: HardwareSpec, size: MetricSize, hole: Holes) => string> = {
  socket_head: capScrewNote,
  button_head: capScrewNote,
  pan_head: capScrewNote,
  countersunk: (spec, _size, hole) =>
    `Clearance Ø${hole.clearance}, 90° countersink to Ø${Math.round((screwHead(spec)!.dk + 0.4) * 100) / 100}, tap Ø${hole.tap} mm.`,
  hex_bolt: (_spec, _size, hole) => `Clearance Ø${hole.clearance}, tap Ø${hole.tap} mm.`,
  set_screw: (_spec, size, hole) => `Tap Ø${hole.tap} mm, or a ${size} nut trap / heat-set insert.`,
  hex_nut: nutNote,
  lock_nut: nutNote,
  square_nut: (_spec, size) =>
    `Square slot ${(SQUARE_NUT[size]!.s + 0.3).toFixed(1)} mm wide, ${(SQUARE_NUT[size]!.m + 0.3).toFixed(1)} mm thick.`,
  washer: washerNote,
  large_washer: washerNote,
  heat_insert: (_spec, size) => {
    const ins = HEAT_INSERT[size]!;

    return `Printed hole Ø${ins.hole} × ${(ins.l + 1).toFixed(1)} mm deep, ${size} screw.`;
  },
  standoff_mf: standoffNote,
  standoff_ff: standoffNote,
};

export function hardwareNote(spec: HardwareSpec): string {
  if (spec.type === 'bearing') {
    const b = BEARINGS[spec.size];

    return `Bore Ø${b.d}, OD Ø${b.D}, width ${b.B} mm. Print the housing at Ø${b.D + 0.1} press fit, shaft Ø${b.d}.`;
  }

  if (spec.type === 'dowel_pin') {
    const d = Number(spec.size);

    return `Press-fit hole Ø${(d - 0.05).toFixed(2)}, slip-fit hole Ø${(d + 0.15).toFixed(2)} mm.`;
  }

  if (!isMetric(spec.size)) return '';

  return NOTES[spec.type](spec, spec.size, HOLES[spec.size]);
}

export interface HoleRow {
  label: string;
  value: string;
  unit: string;
}

const holeRow = (label: string, value: string, unit = 'mm'): HoleRow => ({ label, value, unit });
const r2 = (v: number) => `${round2(v)}`;

interface HoleContext {
  spec: HardwareSpec;
  size: MetricSize;
  clearance: HoleRow;
  tap: HoleRow;
}

const capScrewHoles = ({ spec, clearance, tap }: HoleContext) => {
  const h = screwHead(spec)!;

  return [clearance, holeRow('Counterbore', `Ø${r2(h.dk + 0.6)} × ${r2(h.k + 0.3)}`), tap];
};
const nutHoles = ({ spec, size, clearance }: HoleContext) => [
  holeRow('Nut trap', (nutAcrossFlats(spec.type, size) + 0.3).toFixed(1), 'mm across flats'),
  clearance,
];
const standoffHoles = ({ size }: HoleContext) => [holeRow('Clearance in plates', `Ø${HOLES[size].clearance}`)];

const HOLE_ROWS: Record<MetricType, (c: HoleContext) => HoleRow[]> = {
  socket_head: capScrewHoles,
  button_head: capScrewHoles,
  pan_head: capScrewHoles,
  countersunk: ({ spec, clearance, tap }) => [
    clearance,
    holeRow('Countersink', `90° to Ø${r2(screwHead(spec)!.dk + 0.4)}`),
    tap,
  ],
  hex_bolt: ({ clearance, tap }) => [clearance, tap],
  set_screw: ({ tap }) => [tap],
  hex_nut: nutHoles,
  lock_nut: nutHoles,
  square_nut: ({ size, clearance }) => {
    const n = SQUARE_NUT[size]!;

    return [holeRow('Slot', `${(n.s + 0.3).toFixed(1)} × ${(n.m + 0.3).toFixed(1)}`), clearance];
  },
  washer: ({ clearance }) => [clearance],
  large_washer: ({ clearance }) => [clearance],
  heat_insert: ({ size }) => {
    const ins = HEAT_INSERT[size]!;

    return [holeRow('Printed hole', `Ø${ins.hole} × ${(ins.l + 1).toFixed(1)}`)];
  },
  standoff_mf: standoffHoles,
  standoff_ff: standoffHoles,
};

export function hardwareHoleRows(spec: HardwareSpec): HoleRow[] {
  if (spec.type === 'bearing') {
    const b = BEARINGS[spec.size];

    return [holeRow('Housing, press fit', `Ø${r2(b.D + 0.1)}`), holeRow('Shaft', `Ø${b.d}`)];
  }

  if (spec.type === 'dowel_pin') {
    const d = Number(spec.size);

    return [holeRow('Press fit', `Ø${(d - 0.05).toFixed(2)}`), holeRow('Slip fit', `Ø${(d + 0.15).toFixed(2)}`)];
  }

  if (!isMetric(spec.size)) return [];

  const hole = HOLES[spec.size];

  return HOLE_ROWS[spec.type]({
    spec,
    size: spec.size,
    clearance: holeRow('Clearance', `Ø${hole.clearance}`),
    tap: holeRow('Tap drill', `Ø${hole.tap}`),
  });
}

export function parseHardwareQuery(q: string): { size?: string; length?: number } {
  const m = q
    .toLowerCase()
    .replace(/\s+/g, '')
    .match(/m(\d+(?:\.\d)?)(?:[x×*](\d+))?/);

  if (m) {
    const size = `M${m[1]}`;

    return { size: isMetric(size) ? size : undefined, length: m[2] ? Number(m[2]) : undefined };
  }

  const bearing = Object.keys(BEARINGS).find((b) => q.toLowerCase().replace(/\s+/g, '').includes(b.toLowerCase()));

  return bearing ? { size: bearing } : {};
}

function driveShopWord(d: ScrewDrive | undefined): string {
  if (d === 'hex') return 'hex socket';

  return d ? DRIVES[d].label.toLowerCase() : '';
}

export function hardwareShopUrl(spec: HardwareSpec): string {
  const L = spec.length;
  const d = hardwareDrive(spec);
  const drive = driveShopWord(d);
  const std = isStandardDrive(spec) ? ` ${screwStandard(spec)}` : '';
  const q: Record<HardwareType, string> = {
    socket_head: `${spec.size} x ${L}mm ${drive} socket head cap screw${std}`,
    button_head: `${spec.size} x ${L}mm ${drive} button head screw${std}`,
    countersunk: `${spec.size} x ${L}mm ${drive} countersunk flat head screw${std}`,
    pan_head: `${spec.size} x ${L}mm ${drive} pan head screw${std}`,
    hex_bolt: `${spec.size} x ${L}mm hex head bolt`,
    set_screw: `${spec.size} x ${L}mm ${drive} flat point set screw${std}`,
    hex_nut: `${spec.size} hex nut ISO 4032`,
    lock_nut: `${spec.size} nylon insert lock nut`,
    square_nut: `${spec.size} square nut DIN 562`,
    washer: `${spec.size} flat washer ISO 7089`,
    large_washer: `${spec.size} large flat washer ISO 7093`,
    heat_insert: `${spec.size} heat set threaded insert for 3D printing`,
    standoff_mf: `${spec.size} x ${L}mm brass hex standoff male female`,
    standoff_ff: `${spec.size} x ${L}mm brass hex standoff female female`,
    dowel_pin: `${spec.size} x ${L}mm dowel pin`,
    bearing: `${spec.size} ball bearing`,
  };
  const finish =
    spec.type === 'bearing' || spec.type === 'heat_insert' ? '' : ` ${FINISHES[hardwareFinish(spec)].shop}`;

  return `https://www.amazon.com/s?k=${encodeURIComponent(q[spec.type] + finish)}`;
}
