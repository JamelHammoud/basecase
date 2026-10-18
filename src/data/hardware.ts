/**
 * Metric hardware catalog: screws, nuts, washers, inserts, standoffs, pins and bearings.
 *
 * Dimensions are nominal values from the ISO/DIN standards named on each table.
 * They were checked against bd_warehouse (Apache-2.0), BOSL2 (BSD-2) and the FreeCAD
 * Fasteners tables (used only to cross-check), plus CNC Kitchen / Ruthex insert sheets
 * and NSK/SKF bearing data. Values marked "commercial" aren't covered by ISO.
 * Units are millimeters.
 */

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
  /** "M3", or a bearing code like "608", or a dowel diameter like "3" */
  size: string;
  /** Shaft / body length in mm where the type has one (any value in range, 0.5 mm steps) */
  length?: number;
  /** Surface finish; sets the color and the shopping search (defaults per type) */
  finish?: HardwareFinish;
  /** Screw drive (recess); each head + drive pair has its own ISO head dimensions */
  drive?: ScrewDrive;
}

export type ScrewDrive = 'hex' | 'torx' | 'phillips' | 'pozidriv' | 'slotted';

/** Every drive, in the one order the Drive chips use for every head */
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

/** Nominal diameter and coarse pitch (ISO 261/262) */
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

/** ISO 273 clearance (medium) and tap drill sizes */
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

/** ISO 4762 socket head cap screw: head Ø dk, head height k, hex key s */
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

/** ISO 7380-1 button head (M2/M2.5 are common commercial sizes) */
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

/** ISO 10642 countersunk socket, 90° (M2/M2.5 per DIN 7991 commercial) */
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

/** Head + recess for drives other than hex (bd_warehouse fastener tables, from the ISO standards).
 *  Torx recess sizes follow ISO 10664; Phillips (H) and Pozidriv (Z) sizes ISO 4757. */
type DriveHead = { dk: number; k: number; recess: string };
type CrossDrive = 'torx' | 'phillips' | 'pozidriv' | 'slotted';

/** ISO 7045 / 7046-1 give the H (Phillips) and Z (Pozidriv) heads the same size and recess number */
const pozidrivOf = (t: Table<DriveHead>): Table<DriveHead> =>
  Object.fromEntries(Object.entries(t).map(([s, h]) => [s, { ...h, recess: h.recess.replace('PH', 'PZ') }]));

/** ISO 7046-1 countersunk cross recess (H); the Z (Pozidriv) table is the same */
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

/** ISO 14581 countersunk Torx, ISO 7046-1 countersunk Phillips (H) and Pozidriv (Z), ISO 2009 countersunk slotted */
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

/** ISO 7045 pan head cross recess (H); the Z (Pozidriv) table is the same */
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

/** ISO 7045 pan head Phillips (H) and Pozidriv (Z), ISO 14583 pan head Torx, ISO 1580 pan head slotted (slot width as recess) */
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

/** ISO 14579 socket head Torx: same head as ISO 4762, hexalobular recess */
export const SOCKET_HEAD_TORX: Table<string> = {
  M2: 'T6', 'M2.5': 'T8', M3: 'T10', M4: 'T20', M5: 'T25', M6: 'T30', M8: 'T45', M10: 'T50', M12: 'T55',
};

/** ISO 7380-1 TX: the ISO 7380-1 button head with a hexalobular recess (commercial; M3 T10 per
 *  McMaster / Lemu listings, larger sizes follow the ISO 14579 progression) */
export const BUTTON_HEAD_TORX: Table<string> = {
  M2: 'T6', 'M2.5': 'T8', M3: 'T10', M4: 'T20', M5: 'T25', M6: 'T30', M8: 'T40', M10: 'T50', M12: 'T55',
};

/** ISO 10664 hexalobular (Torx) recess: point-to-point A and across-lobes B, mm */
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

/** ISO 4757 cross recess, type H (Phillips) and type Z (Pozidriv): overall width m and depth, simplified per size */
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

/** ISO 4017 hex head: across flats s, head height k */
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

/** ISO 4766 slotted set screw, flat point: slot width n and minimum slot depth t (2011 edition) */
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

/** ISO 4026 set screw hex key */
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

/** ISO 4032 hex nut: across flats s, height m */
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

/** DIN 985 / ISO 10511 nylon-insert lock nut: across flats s, total height h (M2/M2.5 commercial) */
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

/** DIN 562 thin square nut */
export const SQUARE_NUT: Table<{ s: number; m: number }> = {
  M2: { s: 4, m: 1.2 },
  'M2.5': { s: 5, m: 1.6 },
  M3: { s: 5.5, m: 1.8 },
  M4: { s: 7, m: 2.2 },
  M5: { s: 8, m: 2.7 },
  M6: { s: 10, m: 3.2 },
  M8: { s: 13, m: 4 },
};

/** ISO 7089 flat washer: inner d1, outer d2, thickness h */
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

/** ISO 7093 large (fender) washer */
export const LARGE_WASHER: Table<{ d1: number; d2: number; h: number }> = {
  M3: { d1: 3.2, d2: 9, h: 0.8 },
  M4: { d1: 4.3, d2: 12, h: 1 },
  M5: { d1: 5.3, d2: 15, h: 1 },
  M6: { d1: 6.4, d2: 18, h: 1.6 },
  M8: { d1: 8.4, d2: 24, h: 2 },
  M10: { d1: 10.5, d2: 30, h: 2.5 },
  M12: { d1: 13, d2: 37, h: 3 },
};

/** Heat-set inserts (CNC Kitchen standard): outer Ø, length, recommended printed hole Ø.
 *  Printed holes come out ~0.25 mm small, so the cutout adds 0.2 mm. */
export const HEAT_INSERT: Table<{ od: number; l: number; hole: number }> = {
  M2: { od: 3.6, l: 3, hole: 3.2 },
  'M2.5': { od: 4.6, l: 4, hole: 4 },
  M3: { od: 4.6, l: 5.7, hole: 4 },
  M4: { od: 6.3, l: 8.1, hole: 5.6 },
  M5: { od: 7.1, l: 9.5, hole: 6.4 },
  M6: { od: 8.7, l: 12.7, hole: 8 },
};

/** Brass hex standoffs for electronics: across flats s, male thread length */
export const STANDOFF: Table<{ s: number; male: number }> = {
  M2: { s: 4, male: 4 },
  'M2.5': { s: 5, male: 6 },
  M3: { s: 5, male: 6 },
};

/** Deep groove ball bearings: bore d, outer D, width B */
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

/** ISO 8734 dowel pins: diameter → common lengths */
export const DOWEL_LENGTHS: Record<string, number[]> = {
  '2': [4, 5, 6, 8, 10, 12, 14, 16, 18, 20],
  '3': [4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24, 25, 30],
  '4': [6, 8, 10, 12, 14, 16, 18, 20, 24, 25, 30, 35, 40],
  '5': [8, 10, 12, 14, 16, 18, 20, 24, 25, 30, 35, 40, 45, 50],
  '6': [10, 12, 14, 16, 18, 20, 24, 25, 30, 35, 40, 45, 50, 55, 60],
  '8': [12, 16, 20, 24, 25, 30, 35, 40, 45, 50, 60, 70, 80],
};

/** ISO 888 preferred nominal lengths plus common retail in-betweens */
const PREFERRED_LENGTHS = [
  2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 25, 28, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80,
  90, 100, 110, 120, 130, 140, 150, 160, 180, 200,
];
const between = (min: number, max: number) => PREFERRED_LENGTHS.filter((l) => l >= min && l <= max);

/** Lengths commonly stocked for ISO 4762 / 7380 / 10642 / 4017 screws (retail ranges) */
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

/** ISO 4026 set screws */
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

/** Hex standoffs come in 1 mm steps up to 20 mm */
const STANDOFF_LENGTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 25, 28, 30, 35, 40, 45, 50, 60];

/** Custom lengths: anything from the shortest stock length to this, in 0.5 mm steps */
export const MAX_CUSTOM_LENGTH = 300;
export const LENGTH_STEP = 0.5;

/* ------------------------------------------------------------------ */
/* Type registry                                                       */
/* ------------------------------------------------------------------ */

export interface HardwareTypeInfo {
  type: HardwareType;
  name: string;
  description: string;
  group: 'Screws' | 'Nuts & Washers' | 'Inserts & Standoffs' | 'Pins & Bearings';
  color: string;
  /** Finishes it's sold in; the first is the default */
  finishes: HardwareFinish[];
  sizes: string[];
  defaultSize: string;
  /** Valid lengths for a size, or undefined when the type has no length */
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
    defaultLength: (s) => pickLength(SET_SCREW_LENGTHS[s as MetricSize] ?? [4], (THREAD[s as MetricSize]?.d ?? 3) * 1.4),
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

/** Closest valid size for a type (used when switching types or parsing search) */
export function nearestSize(type: HardwareType, wanted: string, sizes = HARDWARE_BY_TYPE[type].sizes): string {
  const info = HARDWARE_BY_TYPE[type];
  if (sizes.includes(wanted)) return wanted;
  if (isMetric(wanted) && sizes.every(isMetric)) {
    const d = THREAD[wanted].d;
    return sizes.reduce((best, s) =>
      Math.abs(THREAD[s as MetricSize].d - d) < Math.abs(THREAD[best as MetricSize].d - d) ? s : best
    );
  }
  return sizes.includes(info.defaultSize) ? info.defaultSize : sizes[0];
}

/** Shortest and longest length you can pick for a type at a size (custom lengths included) */
export function lengthRange(type: HardwareType, size: string): { min: number; max: number } | null {
  const list = HARDWARE_BY_TYPE[type].lengths?.(size);
  if (!list?.length) return null;
  return { min: list[0], max: Math.max(MAX_CUSTOM_LENGTH, list[list.length - 1]) };
}

/**
 * A complete spec for a type at a size. Any length in range is kept (rounded to 0.5 mm),
 * so screws can be exactly as long as the design needs; isStockLength says whether it's sold.
 */
export function makeSpec(
  type: HardwareType,
  size?: string,
  length?: number,
  finish?: HardwareFinish,
  drive?: ScrewDrive
): HardwareSpec {
  const info = HARDWARE_BY_TYPE[type];
  const drives = driveOptions(type);
  const s = nearestSize(type, size ?? info.defaultSize);
  const f = finish && info.finishes.includes(finish) ? finish : info.finishes[0];
  const d = drives.length ? (drive && drives.includes(drive) ? drive : defaultDrive(type)) : undefined;
  const range = lengthRange(type, s);
  if (!range) return { type, size: s, finish: f, ...(d ? { drive: d } : {}) };
  const wanted = length !== undefined && Number.isFinite(length) ? length : info.defaultLength?.(s) ?? range.min;
  const l = Math.min(range.max, Math.max(range.min, Math.round(wanted / LENGTH_STEP) * LENGTH_STEP));
  return { type, size: s, length: l, finish: f, ...(d ? { drive: d } : {}) };
}

/**
 * Drives a screw comes in, in `DRIVES` order. Every headed screw takes every drive; set screws
 * take hex, Torx and slotted (cross recesses aren't made in grub screws). Empty for non-screws.
 */
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

/** The drive a head comes with unless you pick another (the most common one sold) */
export function defaultDrive(type: HardwareType): ScrewDrive | undefined {
  return type === 'pan_head' ? 'phillips' : driveOptions(type)[0];
}

export const hardwareDrive = (spec: HardwareSpec): ScrewDrive | undefined =>
  spec.drive && driveOptions(spec.type).includes(spec.drive) ? spec.drive : defaultDrive(spec.type);

/**
 * Head size and recess for a screw at its drive: dk head Ø, k head height, and the recess
 * ('hex' with across-flats s, a Torx T size, a Phillips PH or Pozidriv PZ size, or a slot width).
 */
export type ScrewRecess =
  | { kind: 'hex'; s: number }
  | { kind: 'torx'; size: string }
  | { kind: 'phillips'; size: string }
  | { kind: 'pozidriv'; size: string }
  | { kind: 'slot'; width: number };

type ScrewHead = { dk: number; k: number; recess: ScrewRecess };

/** The standard each head's shape comes from (its usual drive) */
const HEAD_STANDARD: Partial<Record<HardwareType, string>> = {
  socket_head: 'ISO 4762',
  button_head: 'ISO 7380-1',
  countersunk: 'ISO 10642',
  pan_head: 'ISO 7045',
  set_screw: 'ISO 4026',
};

/** Standards that cover a head + drive pair exactly; anything else is a commercial screw */
const DRIVE_STANDARD: Partial<Record<HardwareType, Partial<Record<ScrewDrive, string>>>> = {
  socket_head: { hex: 'ISO 4762', torx: 'ISO 14579' },
  button_head: { hex: 'ISO 7380-1', torx: 'ISO 7380-1 TX' },
  countersunk: { hex: 'ISO 10642', torx: 'ISO 14581', phillips: 'ISO 7046-1 H', pozidriv: 'ISO 7046-1 Z', slotted: 'ISO 2009' },
  pan_head: { torx: 'ISO 14583', phillips: 'ISO 7045 H', pozidriv: 'ISO 7045 Z', slotted: 'ISO 1580' },
  set_screw: { hex: 'ISO 4026', slotted: 'ISO 4766' },
};

/** Head + recess straight from the standard's table, when one covers this drive at this size */
function standardHead(type: HardwareType, drive: ScrewDrive, size: MetricSize): ScrewHead | null {
  const fromTable = (h: DriveHead | undefined): ScrewHead | null =>
    !h
      ? null
      : drive === 'torx' || drive === 'phillips' || drive === 'pozidriv'
        ? { dk: h.dk, k: h.k, recess: { kind: drive, size: h.recess } }
        : { dk: h.dk, k: h.k, recess: { kind: 'slot', width: Number(h.recess) } };
  const withRecess = (h: { dk: number; k: number } | undefined, recess: ScrewRecess | null) =>
    h && recess ? { dk: h.dk, k: h.k, recess } : null;
  switch (type) {
    case 'socket_head': {
      const h = SOCKET_HEAD[size];
      if (drive === 'hex') return withRecess(h, h ? { kind: 'hex', s: h.s } : null);
      return drive === 'torx' ? withRecess(h, SOCKET_HEAD_TORX[size] ? { kind: 'torx', size: SOCKET_HEAD_TORX[size]! } : null) : null;
    }
    case 'button_head': {
      const h = BUTTON_HEAD[size];
      if (drive === 'hex') return withRecess(h, h ? { kind: 'hex', s: h.s } : null);
      return drive === 'torx' ? withRecess(h, BUTTON_HEAD_TORX[size] ? { kind: 'torx', size: BUTTON_HEAD_TORX[size]! } : null) : null;
    }
    case 'countersunk': {
      if (drive !== 'hex') return fromTable(COUNTERSUNK_BY_DRIVE[drive][size]);
      const h = COUNTERSUNK[size];
      return withRecess(h, h ? { kind: 'hex', s: h.s } : null);
    }
    case 'pan_head':
      return drive === 'hex' ? null : fromTable(PAN_HEAD[drive][size]);
    default:
      return null;
  }
}

/** Cross recess number per thread size (ISO 7045 / 7046-1), for heads whose standard has none */
const CROSS_NUMBER: Record<MetricSize, number> = { M2: 0, 'M2.5': 1, M3: 1, M4: 2, M5: 2, M6: 3, M8: 4, M10: 4, M12: 4 };
/** Slot width per thread size (ISO 1580 / 2009), for heads whose standard has none */
const SLOT_WIDTH: Record<MetricSize, number> = { M2: 0.7, 'M2.5': 0.8, M3: 1, M4: 1.51, M5: 1.51, M6: 1.91, M8: 2.31, M10: 2.81, M12: 3.06 };
/** Torx for set screws (commercial): the size whose point-to-point A matches the ISO 4026 hex key's corners */
const SET_SCREW_TORX: Record<MetricSize, string> = {
  M2: 'T5', 'M2.5': 'T5', M3: 'T6', M4: 'T8', M5: 'T10', M6: 'T15', M8: 'T25', M10: 'T30', M12: 'T40',
};

/** A recess sized for the thread, for a head + drive pair no standard covers */
function commercialRecess(type: HardwareType, drive: ScrewDrive, size: MetricSize): ScrewRecess {
  switch (drive) {
    case 'hex':
      // Hex socket pan heads use the button head's key
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

/** The head's shape when no standard covers the drive: the head of its usual drive */
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

/** A set screw's recess (no head) and how deep it's cut: ISO 4026 hex socket, ISO 4766 slot, or Torx */
export function setScrewRecess(spec: HardwareSpec): { recess: ScrewRecess; depth: number } | null {
  if (spec.type !== 'set_screw' || !isMetric(spec.size)) return null;
  const d = hardwareDrive(spec) ?? 'hex';
  const recess = commercialRecess('set_screw', d, spec.size);
  const L = spec.length ?? 0;
  if (recess.kind === 'slot') return { recess, depth: Math.min(L * 0.6, SET_SCREW_SLOT[spec.size]!.t) };
  // ISO 4026: socket about 0.8 s deep (minimum key engagement); Torx to the same depth
  return { recess, depth: Math.min(L * 0.6, SET_SCREW[spec.size]!.s * 0.8) };
}

/** True when an ISO standard covers this screw's head + drive exactly */
function isStandardDrive(spec: HardwareSpec): boolean {
  const d = hardwareDrive(spec);
  if (!d || !isMetric(spec.size) || !DRIVE_STANDARD[spec.type]?.[d]) return false;
  return spec.type === 'set_screw' ? d === 'hex' || !!SET_SCREW_SLOT[spec.size] : !!standardHead(spec.type, d, spec.size);
}

/**
 * The ISO standard for a screw's head + drive. Pairs no standard covers name the standard
 * their head shape comes from: "ISO 7380-1 head" for a slotted button head.
 */
export function screwStandard(spec: HardwareSpec): string {
  const base = HEAD_STANDARD[spec.type];
  if (!base) return '';
  if (isStandardDrive(spec)) return DRIVE_STANDARD[spec.type]![hardwareDrive(spec)!]!;
  return spec.type === 'set_screw' ? `${base} form` : `${base} head`;
}

/** One line for cards and pages: the exact standard for this drive, then the type's description */
export function hardwareSubtitle(spec: HardwareSpec): string {
  const standard = screwStandard(spec);
  const description = HARDWARE_BY_TYPE[spec.type].description;
  return standard && !description.startsWith(standard) ? `${standard} · ${description}` : description;
}

/** What drives the recess, for spec rows: "2.5 mm hex key", "T10", "PZ1", "0.8 mm slot" */
export const recessLabel = (r: ScrewRecess): string =>
  r.kind === 'hex' ? `${r.s} mm hex key` : r.kind === 'slot' ? `${r.width} mm slot` : r.size;

export const hardwareFinish = (spec: HardwareSpec): HardwareFinish => spec.finish ?? HARDWARE_BY_TYPE[spec.type].finishes[0];

/** Color of the finish (the part's color) */
export const hardwareColor = (spec: HardwareSpec): string => FINISHES[hardwareFinish(spec)].color;

/** Stocked lengths for this spec's type and size */
export const stockLengths = (spec: HardwareSpec): number[] => HARDWARE_BY_TYPE[spec.type].lengths?.(spec.size) ?? [];

export const isStockLength = (spec: HardwareSpec): boolean =>
  spec.length === undefined || stockLengths(spec).includes(spec.length);

/** The stocked lengths either side of a custom one */
export function nearestStockLengths(spec: HardwareSpec): number[] {
  const list = stockLengths(spec);
  if (spec.length === undefined || !list.length) return [];
  const below = [...list].reverse().find((l) => l < spec.length!);
  const above = list.find((l) => l > spec.length!);
  return [below, above].filter((l): l is number => l !== undefined);
}

/** Families shown in Parts: one configurator per family, switching type inside it */
export interface HardwareFamily {
  id: string;
  name: string;
  /** Label for the type switch ("Head", "Style"), when the family has several types */
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
  { id: 'inserts', name: 'Heat-Set Inserts', description: 'Brass, for printed parts', types: [{ type: 'heat_insert', label: 'Insert' }] },
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
  { id: 'bearings', name: 'Ball Bearings', description: 'Deep groove, 3–12 mm bore', types: [{ type: 'bearing', label: 'Bearing' }] },
];

export const familyOf = (type: HardwareType): HardwareFamily =>
  HARDWARE_FAMILIES.find((f) => f.types.some((t) => t.type === type))!;

/* ------------------------------------------------------------------ */
/* Derived values                                                      */
/* ------------------------------------------------------------------ */

export function hardwareName(spec: HardwareSpec): string {
  const info = HARDWARE_BY_TYPE[spec.type];
  // The default finish goes unsaid; others are part of the name (they're different parts to buy)
  const finish = hardwareFinish(spec) !== info.finishes[0] ? `, ${FINISHES[hardwareFinish(spec)].label}` : '';
  if (spec.type === 'bearing') return `${spec.size} Bearing`;
  if (spec.type === 'dowel_pin') return `Ø${spec.size} × ${spec.length} Dowel Pin${finish}`;
  // Non-default drives are part of the name too ("M3 × 10 Torx Socket Head Screw")
  const d = hardwareDrive(spec);
  // "Hex Socket", so a hex socket pan head doesn't read as a hex head
  const drive = d && d !== defaultDrive(spec.type) ? `${d === 'hex' ? 'Hex Socket' : DRIVES[d].label} ` : '';
  if (spec.length !== undefined) return `${spec.size} × ${spec.length} ${drive}${info.name}${finish}`;
  return `${spec.size} ${info.name}${finish}`;
}

/** Across-corners width of a hex with across-flats s */
export const hexCorners = (s: number) => s / Math.cos(Math.PI / 6);

/** Bounding size (Y is the axis). Screws: head on top. */
export function hardwareDimensions(spec: HardwareSpec): { width: number; height: number; depth: number } {
  const size = spec.size as MetricSize;
  const L = spec.length ?? 0;
  const round = (v: number) => Math.round(v * 100) / 100;
  const box = (w: number, h: number, d = w) => ({ width: round(w), height: round(h), depth: round(d) });
  switch (spec.type) {
    case 'socket_head': {
      const h = SOCKET_HEAD[size]!;
      return box(h.dk, L + h.k);
    }
    case 'button_head': {
      const h = BUTTON_HEAD[size]!;
      return box(h.dk, L + h.k);
    }
    case 'countersunk':
      return box(screwHead(spec)!.dk, L);
    case 'pan_head': {
      const h = screwHead(spec)!;
      return box(h.dk, L + h.k);
    }
    case 'hex_bolt': {
      const h = HEX_BOLT[size]!;
      return box(hexCorners(h.s), L + h.k, h.s);
    }
    case 'set_screw':
      return box(THREAD[size].d, L);
    case 'hex_nut': {
      const n = HEX_NUT[size]!;
      return box(hexCorners(n.s), n.m, n.s);
    }
    case 'lock_nut': {
      const n = LOCK_NUT[size]!;
      return box(hexCorners(n.s), n.h, n.s);
    }
    case 'square_nut': {
      const n = SQUARE_NUT[size]!;
      return box(n.s, n.m);
    }
    case 'washer':
      return box(WASHER[size]!.d2, WASHER[size]!.h);
    case 'large_washer':
      return box(LARGE_WASHER[size]!.d2, LARGE_WASHER[size]!.h);
    case 'heat_insert':
      return box(HEAT_INSERT[size]!.od, HEAT_INSERT[size]!.l);
    case 'standoff_mf': {
      const so = STANDOFF[size]!;
      return box(hexCorners(so.s), L + so.male, so.s);
    }
    case 'standoff_ff': {
      const so = STANDOFF[size]!;
      return box(hexCorners(so.s), L, so.s);
    }
    case 'dowel_pin':
      return box(Number(spec.size), L);
    case 'bearing': {
      const b = BEARINGS[spec.size];
      return box(b.D, b.B);
    }
  }
}

/** One-line build notes for the AI brief: holes to model around this part */
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
  const hole = HOLES[spec.size];
  switch (spec.type) {
    case 'socket_head':
    case 'button_head':
    case 'pan_head': {
      const h = screwHead(spec)!;
      const r = (v: number) => Math.round(v * 100) / 100;
      return `Clearance Ø${hole.clearance}, counterbore Ø${r(h.dk + 0.6)} × ${r(h.k + 0.3)} deep, tap Ø${hole.tap} mm.`;
    }
    case 'countersunk':
      return `Clearance Ø${hole.clearance}, 90° countersink to Ø${Math.round((screwHead(spec)!.dk + 0.4) * 100) / 100}, tap Ø${hole.tap} mm.`;
    case 'hex_bolt':
      return `Clearance Ø${hole.clearance}, tap Ø${hole.tap} mm.`;
    case 'set_screw':
      return `Tap Ø${hole.tap} mm, or a ${spec.size} nut trap / heat-set insert.`;
    case 'hex_nut':
    case 'lock_nut': {
      const s = (spec.type === 'hex_nut' ? HEX_NUT : LOCK_NUT)[spec.size]!.s;
      return `Nut trap ${(s + 0.3).toFixed(1)} mm across flats, clearance Ø${hole.clearance} mm.`;
    }
    case 'square_nut':
      return `Square slot ${(SQUARE_NUT[spec.size]!.s + 0.3).toFixed(1)} mm wide, ${(SQUARE_NUT[spec.size]!.m + 0.3).toFixed(1)} mm thick.`;
    case 'washer':
    case 'large_washer':
      return `Fits ${spec.size}, clearance Ø${hole.clearance} mm.`;
    case 'heat_insert': {
      const ins = HEAT_INSERT[spec.size]!;
      return `Printed hole Ø${ins.hole} × ${(ins.l + 1).toFixed(1)} mm deep, ${spec.size} screw.`;
    }
    case 'standoff_mf':
    case 'standoff_ff':
      return `${spec.size} threads, ${STANDOFF[spec.size]!.s} mm hex. Clearance Ø${hole.clearance} mm in mounting plates.`;
  }
}

/** One hole to model around a part: what it is, its size, and the unit shown muted after it */
export interface HoleRow {
  label: string;
  value: string;
  unit: string;
}

/** The holes to print or drill around this part (the same numbers as `hardwareNote`), as spec rows */
export function hardwareHoleRows(spec: HardwareSpec): HoleRow[] {
  const r = (v: number) => `${Math.round(v * 100) / 100}`;
  const row = (label: string, value: string, unit = 'mm'): HoleRow => ({ label, value, unit });
  if (spec.type === 'bearing') {
    const b = BEARINGS[spec.size];
    return [row('Housing, press fit', `Ø${r(b.D + 0.1)}`), row('Shaft', `Ø${b.d}`)];
  }
  if (spec.type === 'dowel_pin') {
    const d = Number(spec.size);
    return [row('Press fit', `Ø${(d - 0.05).toFixed(2)}`), row('Slip fit', `Ø${(d + 0.15).toFixed(2)}`)];
  }
  if (!isMetric(spec.size)) return [];
  const hole = HOLES[spec.size];
  const clearance = row('Clearance', `Ø${hole.clearance}`);
  const tap = row('Tap drill', `Ø${hole.tap}`);
  switch (spec.type) {
    case 'socket_head':
    case 'button_head':
    case 'pan_head': {
      const h = screwHead(spec)!;
      return [clearance, row('Counterbore', `Ø${r(h.dk + 0.6)} × ${r(h.k + 0.3)}`), tap];
    }
    case 'countersunk':
      return [clearance, row('Countersink', `90° to Ø${r(screwHead(spec)!.dk + 0.4)}`), tap];
    case 'hex_bolt':
      return [clearance, tap];
    case 'set_screw':
      return [tap];
    case 'hex_nut':
    case 'lock_nut': {
      const s = (spec.type === 'hex_nut' ? HEX_NUT : LOCK_NUT)[spec.size]!.s;
      return [row('Nut trap', (s + 0.3).toFixed(1), 'mm across flats'), clearance];
    }
    case 'square_nut': {
      const n = SQUARE_NUT[spec.size]!;
      return [row('Slot', `${(n.s + 0.3).toFixed(1)} × ${(n.m + 0.3).toFixed(1)}`), clearance];
    }
    case 'washer':
    case 'large_washer':
      return [clearance];
    case 'heat_insert': {
      const ins = HEAT_INSERT[spec.size]!;
      return [row('Printed hole', `Ø${ins.hole} × ${(ins.l + 1).toFixed(1)}`)];
    }
    case 'standoff_mf':
    case 'standoff_ff':
      return [row('Clearance in plates', `Ø${hole.clearance}`)];
  }
}

/**
 * Parses search text like "m3", "m3x10", "M2.5 × 8", "608" into a size and length.
 */
export function parseHardwareQuery(q: string): { size?: string; length?: number } {
  const m = q.toLowerCase().replace(/\s+/g, '').match(/m(\d+(?:\.\d)?)(?:[x×*](\d+))?/);
  if (m) {
    const size = `M${m[1]}`;
    return { size: isMetric(size) ? size : undefined, length: m[2] ? Number(m[2]) : undefined };
  }
  const bearing = Object.keys(BEARINGS).find((b) => q.toLowerCase().replace(/\s+/g, '').includes(b.toLowerCase()));
  return bearing ? { size: bearing } : {};
}

/** Amazon US search for this exact spec (fasteners are sold by many sellers, so it's a search, not one listing) */
export function hardwareShopUrl(spec: HardwareSpec): string {
  const L = spec.length;
  const d = hardwareDrive(spec);
  const drive = d === 'hex' ? 'hex socket' : d ? DRIVES[d].label.toLowerCase() : '';
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
  const finish = spec.type === 'bearing' || spec.type === 'heat_insert' ? '' : ` ${FINISHES[hardwareFinish(spec)].shop}`;
  return `https://www.amazon.com/s?k=${encodeURIComponent(q[spec.type] + finish)}`;
}
