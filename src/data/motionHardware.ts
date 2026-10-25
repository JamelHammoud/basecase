import { FRAME_HARDWARE } from './frameHardware';
import { MotionHardware, boreFacts, box, holeRow, r2, seatHoles } from './hardwareKit';
import {
  FLANGED_BEARINGS,
  LINEAR_BUSHINGS,
  LINEAR_SHAFTS,
  MGN_CARRIAGES,
  MGN_RAILS,
  MINI_THRUST_BEARINGS,
  THRUST_BEARINGS,
} from './motionTables';

export type { Box, Fact, HoleRow, MotionHardware } from './hardwareKit';
export { box, holeRow, round2 } from './hardwareKit';

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

const bearing: MotionHardware = {
  name: (spec) => `${spec.size} Bearing`,
  dimensions: (spec) => {
    const b = BEARINGS[spec.size];

    return box(b.D, b.B);
  },
  facts: (spec) => {
    const b = BEARINGS[spec.size];

    return boreFacts(b.d, b.D, b.B);
  },
  holes: (spec) => seatHoles(BEARINGS[spec.size].D, BEARINGS[spec.size].d),
  note: (spec) => {
    const b = BEARINGS[spec.size];

    return `Bore Ø${b.d}, OD Ø${b.D}, width ${b.B} mm. Print the housing at Ø${b.D + 0.1} press fit, shaft Ø${b.d}.`;
  },
  shop: (spec) => `${spec.size} ball bearing`,
  sizeColumns: 3,
  seat: (spec) => ({ name: `${spec.size} Bearing Seat`, diameter: BEARINGS[spec.size].D + 0.1 }),
};

const pinFits = (d: number) => [
  holeRow('Press fit', `Ø${(d - 0.05).toFixed(2)}`),
  holeRow('Slip fit', `Ø${(d + 0.15).toFixed(2)}`),
];

const dowelPin: MotionHardware = {
  name: (spec) => `Ø${spec.size} × ${spec.length} Dowel Pin`,
  dimensions: (spec) => box(Number(spec.size), spec.length ?? 0),
  facts: () => [],
  holes: (spec) => pinFits(Number(spec.size)),
  note: (spec) => {
    const d = Number(spec.size);

    return `Press-fit hole Ø${(d - 0.05).toFixed(2)}, slip-fit hole Ø${(d + 0.15).toFixed(2)} mm.`;
  },
  shop: (spec) => `${spec.size} x ${spec.length}mm dowel pin`,
  sizeLabel: (s) => `Ø${s}`,
  seat: (spec) => ({ name: `Ø${spec.size} Pin Hole`, diameter: Number(spec.size) + 0.1 }),
};

const railHoles = (rail: string) => {
  const r = MGN_RAILS[rail];

  return [
    holeRow('Rail bolts', `${r.boltSize}, every ${r.pitchP}`),
    holeRow('Tap in the base', `${r.boltSize} on a ${r.pitchP} pitch`, 'mm, centred'),
  ];
};

const linearRail: MotionHardware = {
  name: (spec) => `${spec.size} × ${spec.length} Linear Rail`,
  dimensions: (spec) => {
    const r = MGN_RAILS[spec.size];

    return box(r.widthWR, r.heightHR, spec.length ?? 0);
  },
  facts: (spec) => {
    const r = MGN_RAILS[spec.size];

    return [
      { label: 'Width', value: `${r.widthWR}`, unit: 'mm' },
      { label: 'Height', value: `${r.heightHR}`, unit: 'mm' },
      { label: 'Hole pitch', value: `${r.pitchP}`, unit: `mm, ${r.boltSize} counterbored` },
      { label: 'Standard', value: 'HIWIN MGN' },
    ];
  },
  holes: (spec) => railHoles(spec.size),
  note: (spec) => {
    const r = MGN_RAILS[spec.size];

    return `HIWIN ${spec.size} rail: ${r.widthWR} × ${r.heightHR} mm, ${r.boltSize} holes every ${r.pitchP} mm, ${r.endE} mm from the ends. Cut to length; the length should be (n − 1) × ${r.pitchP} + 2 × ${r.endE} mm.`;
  },
  shop: (spec) => `${spec.size} linear rail ${spec.length}mm`,
  massG: (spec) => MGN_RAILS[spec.size].kgPerM * (spec.length ?? 0),
  cutToLength: true,
};

const carriage: MotionHardware = {
  name: (spec) => `${spec.size} Carriage`,
  dimensions: (spec) => {
    const c = MGN_CARRIAGES[spec.size];

    return box(c.W, c.H - c.H1, c.L);
  },
  facts: (spec) => {
    const c = MGN_CARRIAGES[spec.size];

    return [
      { label: 'Top above rail base', value: `${c.H}`, unit: 'mm' },
      { label: 'Mounting', value: `4× ${c.thread} × ${c.threadDepth} on ${c.B} × ${c.C}`, unit: 'mm' },
      { label: 'Dynamic load (C)', value: `${c.dynamicC}`, unit: 'kN' },
      { label: 'Static load (C0)', value: `${c.staticC0}`, unit: 'kN' },
    ];
  },
  holes: (spec) => {
    const c = MGN_CARRIAGES[spec.size];

    return [holeRow('Clearance in the plate', `4× ${c.thread} on ${c.B} × ${c.C}`)];
  },
  note: (spec) => {
    const c = MGN_CARRIAGES[spec.size];

    return `Rides a ${c.rail} rail. Top face ${c.H} mm above the rail base, ${c.W} × ${c.L} mm, 4× ${c.thread} × ${c.threadDepth} mm on ${c.B} × ${c.C} mm.`;
  },
  shop: (spec) => `${spec.size} linear guide carriage block`,
  massG: (spec) => MGN_CARRIAGES[spec.size].weightKg * 1000,
  sizeColumns: 4,
};

const shaft: MotionHardware = {
  name: (spec) => `Ø${spec.size} × ${spec.length} Shaft`,
  dimensions: (spec) => box(Number(spec.size), spec.length ?? 0),
  facts: (spec) => [
    { label: 'Tolerance', value: `h6, 0 / ${LINEAR_SHAFTS[spec.size].h6LowerUm}`, unit: 'µm' },
    { label: 'Material', value: 'Bearing steel, hardened 60 HRC+' },
  ],
  holes: (spec) => [holeRow('Clamp hole', `Ø${r2(Number(spec.size) + 0.1)}`), holeRow('Bearing bore', `Ø${spec.size}`)],
  note: (spec) =>
    `Ø${spec.size} h6 hardened, ground shaft. Clamp it in a Ø${r2(Number(spec.size) + 0.1)} hole; linear bearings and Ø${spec.size} bore bearings ride on it.`,
  shop: (spec) => `${spec.size}mm linear shaft ${spec.length}mm hardened chrome`,
  sizeLabel: (s) => `Ø${s}`,
  massG: (spec) => LINEAR_SHAFTS[spec.size].massKgPerM * (spec.length ?? 0),
  seat: (spec) => ({ name: `Ø${spec.size} Shaft Hole`, diameter: Number(spec.size) + 0.1 }),
  cutToLength: true,
};

const linearBearing: MotionHardware = {
  name: (spec) => `${spec.size} Linear Bearing`,
  dimensions: (spec) => {
    const b = LINEAR_BUSHINGS[spec.size];

    return box(b.D, b.L);
  },
  facts: (spec) => {
    const b = LINEAR_BUSHINGS[spec.size];

    return [
      { label: 'Shaft', value: `${b.d}`, unit: 'mm' },
      { label: 'OD', value: `${b.D}`, unit: 'mm' },
      { label: 'Length', value: `${b.L}`, unit: 'mm' },
      ...(b.B ? [{ label: 'Ring grooves', value: `${b.B} apart, Ø${b.D1} × ${b.W}`, unit: 'mm' }] : []),
      { label: 'Dynamic load (C)', value: `${b.C}`, unit: 'N' },
      { label: 'Static load (C0)', value: `${b.C0}`, unit: 'N' },
    ];
  },
  holes: (spec) => seatHoles(LINEAR_BUSHINGS[spec.size].D, LINEAR_BUSHINGS[spec.size].d),
  note: (spec) => {
    const b = LINEAR_BUSHINGS[spec.size];

    return `Rides a Ø${b.d} shaft. Housing bore Ø${r2(b.D + 0.1)} × ${b.L} mm; keep it from sliding with a clamp or retaining rings.`;
  },
  shop: (spec) => `${spec.size} linear ball bearing`,
  sizeColumns: 4,
  massG: (spec) => LINEAR_BUSHINGS[spec.size].massG,
  seat: (spec) => ({ name: `${spec.size} Housing`, diameter: LINEAR_BUSHINGS[spec.size].D + 0.1 }),
};

const flangedBearing: MotionHardware = {
  name: (spec) => `${spec.size}ZZ Flanged Bearing`,
  dimensions: (spec) => {
    const b = FLANGED_BEARINGS[spec.size];

    return box(b.D1zz, b.Bzz);
  },
  facts: (spec) => {
    const b = FLANGED_BEARINGS[spec.size];

    return [...boreFacts(b.d, b.D, b.Bzz), { label: 'Flange', value: `Ø${b.D1zz} × ${b.C1zz}`, unit: 'mm' }];
  },
  holes: (spec) => {
    const b = FLANGED_BEARINGS[spec.size];

    return [...seatHoles(b.D, b.d), holeRow('Flange recess', `Ø${r2(b.D1zz + 0.4)} × ${r2(b.C1zz + 0.1)}`)];
  },
  note: (spec) => {
    const b = FLANGED_BEARINGS[spec.size];

    return `Bore Ø${b.d}, OD Ø${b.D}, width ${b.Bzz} mm, flange Ø${b.D1zz} × ${b.C1zz}. The flange locates it axially: press into Ø${r2(b.D + 0.1)}, shaft Ø${b.d}.`;
  },
  shop: (spec) => `${spec.size}ZZ flanged ball bearing`,
  sizeColumns: 3,
  massG: (spec) => FLANGED_BEARINGS[spec.size].massGzz,
  seat: (spec) => ({ name: `${spec.size} Bearing Seat`, diameter: FLANGED_BEARINGS[spec.size].D + 0.1 }),
};

export const thrustBearing = (size: string) => {
  const big = THRUST_BEARINGS[size];

  if (big)
    return {
      d: big.d,
      D: big.D,
      T: big.T,
      shaftOd: big.shaftWasherOd,
      housingBore: big.housingWasherBore,
      massG: big.massG,
    };

  const m = MINI_THRUST_BEARINGS[size];

  return { d: m.d, D: m.D, T: m.H, shaftOd: m.shaftWasherOd, housingBore: m.housingWasherBore, massG: m.massG };
};

const thrust: MotionHardware = {
  name: (spec) => `${spec.size} Thrust Bearing`,
  dimensions: (spec) => {
    const b = thrustBearing(spec.size);

    return box(b.D, b.T);
  },
  facts: (spec) => {
    const b = thrustBearing(spec.size);

    return boreFacts(b.d, b.D, b.T, 'Height');
  },
  holes: (spec) => {
    const b = thrustBearing(spec.size);

    return [holeRow('Housing', `Ø${r2(b.D + 0.2)}`), holeRow('Shaft', `Ø${b.d}`)];
  },
  note: (spec) => {
    const b = thrustBearing(spec.size);

    return `Takes axial load only. Bore Ø${b.d}, OD Ø${b.D}, height ${b.T} mm: the shaft washer grips the Ø${b.d} shaft, the housing washer sits in a Ø${r2(b.D + 0.2)} recess. Pair it with a radial bearing.`;
  },
  shop: (spec) => `${spec.size} thrust ball bearing`,
  sizeColumns: 3,
  massG: (spec) => thrustBearing(spec.size).massG,
  seat: (spec) => ({ name: `${spec.size} Bearing Seat`, diameter: thrustBearing(spec.size).D + 0.2 }),
};

export const MOTION_HARDWARE = {
  bearing,
  dowel_pin: dowelPin,
  linear_rail: linearRail,
  rail_carriage: carriage,
  shaft,
  linear_bearing: linearBearing,
  flanged_bearing: flangedBearing,
  thrust_bearing: thrust,
  ...FRAME_HARDWARE,
} satisfies Record<string, MotionHardware>;

export type MotionHardwareType = keyof typeof MOTION_HARDWARE;
