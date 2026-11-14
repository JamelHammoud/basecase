import { ACTUATOR_MOTORS, reduction, type ActuatorMotor } from '../data/generatedActuators';
import { BEARINGS } from '../data/motionHardware';

export type V3 = [number, number, number];

export const PRINTED_PARTS = ['housing', 'cap', 'disc_a', 'disc_b', 'output', 'shaft'] as const;

export type PrintedPart = (typeof PRINTED_PARTS)[number];

export const BEARING_SIZES = { cam: '6704', shaft: '6800', out: '6805' } as const;

export const PIN_COUNTS = [11, 13, 15, 17, 19, 21, 25];

export const MIN_PIN_RADIUS = 32;

const PLA_PIN_MPA = 15;
const DISC_MM = 6;
const PIN_MM = 5;
const CLEARANCE = 0.15;
const POSTS = 4;
const POST_MM = 8;

export interface CycloidalDesign {
  motor: string;
  pins: number;
  lobes: number;
  R: number;
  pinD: number;
  e: number;
  t: number;
}

export interface Levels {
  baseTop: number;
  discA: number;
  discB: number;
  cap: number;
  outBearing: number;
  hub: number;
  plate: number;
  cavity: number;
  out: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

const bearing = (size: string) => BEARINGS[size];

export const designRatio = (d: Pick<CycloidalDesign, 'pins' | 'lobes'>) => reduction(d.pins, d.lobes);

export const motorOf = (d: Pick<CycloidalDesign, 'motor'>): ActuatorMotor => ACTUATOR_MOTORS[d.motor];

export function sizedDesign(motor: string, pins: number, stallNm: number): CycloidalDesign {
  const needR = (2 * stallNm * 1000) / (pins * PLA_PIN_MPA * PIN_MM * DISC_MM);
  const R = Math.max(MIN_PIN_RADIUS, Math.ceil(needR / 2) * 2);

  return { motor, pins, lobes: pins - 1, R, pinD: PIN_MM, e: Math.round((10 * R) / pins) / 20, t: DISC_MM };
}

export function levels(d: CycloidalDesign): Levels {
  const { rim } = motorOf(d);
  const baseTop = rim > 0 ? rim + 6.5 : 8;
  const discA = baseTop + 1;
  const discB = discA + d.t + 1;
  const cap = discB + d.t + 1.5;
  const outBearing = cap + 6.3;
  const hub = outBearing + bearing(BEARING_SIZES.out).B;

  return {
    baseTop,
    discA,
    discB,
    cap,
    outBearing,
    hub,
    plate: cap + 6.8,
    cavity: hub + 5.5,
    out: hub + 8.9,
  };
}

export function postRadius(d: CycloidalDesign): number {
  const hole = POST_MM / 2 + d.e + CLEARANCE;
  const lo = bearing(BEARING_SIZES.cam).D / 2 + 0.05 + 1.2 + hole;
  const hi = d.R - d.e - d.pinD / 2 - CLEARANCE - 1.2 - hole;

  return (lo + hi) / 2;
}

export const ringRadius = (d: CycloidalDesign) => d.R + 3;

const earRadius = (d: CycloidalDesign) => ringRadius(d) + 5;

export const POST_ANGLES = Array.from({ length: POSTS }, (_, i) => (360 * i) / POSTS);

const triple = (size: string) => {
  const b = bearing(size);

  return `[${b.d}, ${b.D}, ${b.B}]`;
};

export function cycloidalCode(d: CycloidalDesign, part: PrintedPart | 'all'): string {
  const m = motorOf(d);
  const motor = `[${m.stator.pcd}, ${m.stator.holes}, ${m.stator.m}, ${m.shaft.d}, ${m.shaft.length}, ${m.stator.phase}, ${m.rim}]`;
  const args = [
    `pins = ${d.pins}`,
    `lobes = ${d.lobes}`,
    `R = ${d.R}`,
    `pin_d = ${d.pinD}`,
    `e = ${d.e}`,
    `t = ${d.t}`,
    `posts = ${POSTS}`,
    `post_d = ${POST_MM}`,
    `cam_bearing = ${triple(BEARING_SIZES.cam)}`,
    `shaft_bearing = ${triple(BEARING_SIZES.shaft)}`,
    `out_bearing = ${triple(BEARING_SIZES.out)}`,
    `motor = ${motor}`,
    `part = "${part}"`,
  ];

  return `include <robotics.scad>\ninclude <mechanisms.scad>\ncycloidal_drive(${args.join(', ')});`;
}

export interface Extent {
  min: V3;
  max: V3;
}

function discExtent(d: CycloidalDesign, cx: number, z: number): Extent {
  const r = d.R + d.e - d.pinD / 2 - CLEARANCE;

  return { min: [cx - r, -r, z], max: [cx + r, r, z + d.t] };
}

export function partExtent(d: CycloidalDesign, part: PrintedPart): Extent {
  const z = levels(d);
  const ear = earRadius(d) + 4.5;
  const ring = ringRadius(d);
  const cap = Math.min(postRadius(d) + POST_MM / 2 + 2, d.R - d.pinD / 2 - 1);
  const cam = bearing(BEARING_SIZES.cam).d / 2;
  const extents: Record<PrintedPart, Extent> = {
    housing: { min: [-ear, -ear, 0], max: [ear, ear, z.cap] },
    cap: { min: [-cap, -cap, z.cap], max: [cap, cap, z.hub] },
    disc_a: discExtent(d, d.e, z.discA),
    disc_b: discExtent(d, -d.e, z.discB),
    output: { min: [-ring, -ring, z.baseTop + 0.4], max: [ring, ring, z.out] },
    shaft: { min: [-cam - d.e, -cam, z.baseTop + 0.3], max: [cam + d.e, cam, z.cap - 1] },
  };
  const e = extents[part];

  return { min: e.min.map(r2) as V3, max: e.max.map(r2) as V3 };
}

export function footprint(d: CycloidalDesign): { width: number; height: number } {
  const sizes = PRINTED_PARTS.map((p) => partExtent(d, p)).map((e) => ({
    width: Math.max(e.max[0] - e.min[0], e.max[1] - e.min[1]),
    height: e.max[2] - e.min[2],
  }));

  return {
    width: r2(Math.max(...sizes.map((s) => s.width))),
    height: r2(Math.max(...sizes.map((s) => s.height))),
  };
}
