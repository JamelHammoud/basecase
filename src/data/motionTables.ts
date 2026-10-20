export const MGN_RAILS: Record<
  string,
  {
    widthWR: number;
    heightHR: number;
    pitchP: number;
    endE: number;
    endEMin: number;
    endEMax: number;
    boltHoleD: number;
    counterboreD: number;
    counterboreDepth: number;
    boltSize: string;
    bolt: string;
    kgPerM: number;
    maxStandardLength: number;
    maxStandardLengthHoles: number;
    maxLength: number;
    minLength: number;
    standardLengths: number[];
  }
> = {
  MGN7: {
    widthWR: 7,
    heightHR: 4.8,
    pitchP: 15,
    endE: 5,
    endEMin: 5,
    endEMax: 12,
    boltHoleD: 2.4,
    counterboreD: 4.2,
    counterboreDepth: 2.3,
    boltSize: 'M2',
    bolt: 'M2x6',
    kgPerM: 0.22,
    maxStandardLength: 595,
    maxStandardLengthHoles: 40,
    maxLength: 600,
    minLength: 25,
    standardLengths: [40, 55, 70, 85, 100, 130],
  },
  MGN9: {
    widthWR: 9,
    heightHR: 6.5,
    pitchP: 20,
    endE: 7.5,
    endEMin: 5,
    endEMax: 15,
    boltHoleD: 3.5,
    counterboreD: 6,
    counterboreDepth: 3.5,
    boltSize: 'M3',
    bolt: 'M3x8',
    kgPerM: 0.38,
    maxStandardLength: 1195,
    maxStandardLengthHoles: 60,
    maxLength: 1200,
    minLength: 30,
    standardLengths: [55, 75, 95, 115, 135, 155, 175, 195, 275, 375],
  },
  MGN12: {
    widthWR: 12,
    heightHR: 8,
    pitchP: 25,
    endE: 10,
    endEMin: 5,
    endEMax: 20,
    boltHoleD: 3.5,
    counterboreD: 6,
    counterboreDepth: 4.5,
    boltSize: 'M3',
    bolt: 'M3x8',
    kgPerM: 0.65,
    maxStandardLength: 1995,
    maxStandardLengthHoles: 80,
    maxLength: 2000,
    minLength: 35,
    standardLengths: [70, 95, 120, 145, 170, 195, 220, 245, 270, 320, 370, 470, 570, 695],
  },
  MGN15: {
    widthWR: 15,
    heightHR: 10,
    pitchP: 40,
    endE: 15,
    endEMin: 6,
    endEMax: 34,
    boltHoleD: 3.5,
    counterboreD: 6,
    counterboreDepth: 4.5,
    boltSize: 'M3',
    bolt: 'M3x10',
    kgPerM: 1.06,
    maxStandardLength: 1990,
    maxStandardLengthHoles: 50,
    maxLength: 2000,
    minLength: 52,
    standardLengths: [70, 110, 150, 190, 230, 270, 310, 350, 390, 430, 470, 550, 670, 870],
  },
};

export const MGN_CARRIAGES: Record<
  string,
  {
    rail: string;
    type: 'standard' | 'long';
    H: number;
    H1: number;
    H1WithBottomSeal: number | null;
    N: number;
    W: number;
    B: number;
    B1: number;
    C: number;
    L1: number;
    L: number;
    G: number | null;
    lubeGn: string;
    thread: string;
    threadDepth: number;
    H2: number;
    weightKg: number;
    dynamicC: number;
    staticC0: number;
    momentMR: number;
    momentMP: number;
    momentMY: number;
  }
> = {
  MGN7C: {
    rail: 'MGN7',
    type: 'standard',
    H: 8,
    H1: 1.5,
    H1WithBottomSeal: null,
    N: 5,
    W: 17,
    B: 12,
    B1: 2.5,
    C: 8,
    L1: 13.5,
    L: 22.5,
    G: null,
    lubeGn: 'Ø1.2',
    thread: 'M2',
    threadDepth: 2.5,
    H2: 1.5,
    weightKg: 0.01,
    dynamicC: 0.98,
    staticC0: 1.24,
    momentMR: 4.7,
    momentMP: 2.84,
    momentMY: 2.84,
  },
  MGN7H: {
    rail: 'MGN7',
    type: 'long',
    H: 8,
    H1: 1.5,
    H1WithBottomSeal: null,
    N: 5,
    W: 17,
    B: 12,
    B1: 2.5,
    C: 13,
    L1: 21.8,
    L: 30.8,
    G: null,
    lubeGn: 'Ø1.2',
    thread: 'M2',
    threadDepth: 2.5,
    H2: 1.5,
    weightKg: 0.015,
    dynamicC: 1.37,
    staticC0: 1.96,
    momentMR: 7.64,
    momentMP: 4.8,
    momentMY: 4.8,
  },
  MGN9C: {
    rail: 'MGN9',
    type: 'standard',
    H: 10,
    H1: 2,
    H1WithBottomSeal: 1,
    N: 5.5,
    W: 20,
    B: 15,
    B1: 2.5,
    C: 10,
    L1: 18.9,
    L: 28.9,
    G: null,
    lubeGn: 'Ø1.4',
    thread: 'M3',
    threadDepth: 3,
    H2: 1.8,
    weightKg: 0.016,
    dynamicC: 1.86,
    staticC0: 2.55,
    momentMR: 11.76,
    momentMP: 7.35,
    momentMY: 7.35,
  },
  MGN9H: {
    rail: 'MGN9',
    type: 'long',
    H: 10,
    H1: 2,
    H1WithBottomSeal: 1,
    N: 5.5,
    W: 20,
    B: 15,
    B1: 2.5,
    C: 16,
    L1: 29.9,
    L: 39.9,
    G: null,
    lubeGn: 'Ø1.4',
    thread: 'M3',
    threadDepth: 3,
    H2: 1.8,
    weightKg: 0.026,
    dynamicC: 2.55,
    staticC0: 4.02,
    momentMR: 19.6,
    momentMP: 18.62,
    momentMY: 18.62,
  },
  MGN12C: {
    rail: 'MGN12',
    type: 'standard',
    H: 13,
    H1: 3,
    H1WithBottomSeal: 2,
    N: 7.5,
    W: 27,
    B: 20,
    B1: 3.5,
    C: 15,
    L1: 21.7,
    L: 34.7,
    G: null,
    lubeGn: 'Ø2',
    thread: 'M3',
    threadDepth: 3.5,
    H2: 2.5,
    weightKg: 0.034,
    dynamicC: 2.84,
    staticC0: 3.92,
    momentMR: 25.48,
    momentMP: 13.72,
    momentMY: 13.72,
  },
  MGN12H: {
    rail: 'MGN12',
    type: 'long',
    H: 13,
    H1: 3,
    H1WithBottomSeal: 2,
    N: 7.5,
    W: 27,
    B: 20,
    B1: 3.5,
    C: 20,
    L1: 32.4,
    L: 45.4,
    G: null,
    lubeGn: 'Ø2',
    thread: 'M3',
    threadDepth: 3.5,
    H2: 2.5,
    weightKg: 0.054,
    dynamicC: 3.72,
    staticC0: 5.88,
    momentMR: 38.22,
    momentMP: 36.26,
    momentMY: 36.26,
  },
  MGN15C: {
    rail: 'MGN15',
    type: 'standard',
    H: 16,
    H1: 4,
    H1WithBottomSeal: 3,
    N: 8.5,
    W: 32,
    B: 25,
    B1: 3.5,
    C: 20,
    L1: 26.7,
    L: 42.1,
    G: 4.5,
    lubeGn: 'M3',
    thread: 'M3',
    threadDepth: 4,
    H2: 3,
    weightKg: 0.059,
    dynamicC: 4.61,
    staticC0: 5.59,
    momentMR: 45.08,
    momentMP: 21.56,
    momentMY: 21.56,
  },
  MGN15H: {
    rail: 'MGN15',
    type: 'long',
    H: 16,
    H1: 4,
    H1WithBottomSeal: 3,
    N: 8.5,
    W: 32,
    B: 25,
    B1: 3.5,
    C: 25,
    L1: 43.4,
    L: 58.8,
    G: 4.5,
    lubeGn: 'M3',
    thread: 'M3',
    threadDepth: 4,
    H2: 3,
    weightKg: 0.092,
    dynamicC: 6.37,
    staticC0: 9.11,
    momentMR: 73.5,
    momentMP: 57.82,
    momentMY: 57.82,
  },
};

export const LINEAR_SHAFTS: Record<
  string,
  {
    d: number;
    massKgPerM: number;
    h6UpperUm: number;
    h6LowerUm: number;
    g6UpperUm: number;
    g6LowerUm: number;
    maxLengthMm: number;
    samickMassKgPerM: number | null;
  }
> = {
  '3': {
    d: 3,
    massKgPerM: 0.06,
    h6UpperUm: 0,
    h6LowerUm: -6,
    g6UpperUm: -2,
    g6LowerUm: -8,
    maxLengthMm: 400,
    samickMassKgPerM: null,
  },
  '4': {
    d: 4,
    massKgPerM: 0.1,
    h6UpperUm: 0,
    h6LowerUm: -8,
    g6UpperUm: -4,
    g6LowerUm: -12,
    maxLengthMm: 500,
    samickMassKgPerM: null,
  },
  '5': {
    d: 5,
    massKgPerM: 0.16,
    h6UpperUm: 0,
    h6LowerUm: -8,
    g6UpperUm: -4,
    g6LowerUm: -12,
    maxLengthMm: 700,
    samickMassKgPerM: 0.16,
  },
  '6': {
    d: 6,
    massKgPerM: 0.23,
    h6UpperUm: 0,
    h6LowerUm: -8,
    g6UpperUm: -4,
    g6LowerUm: -12,
    maxLengthMm: 1000,
    samickMassKgPerM: 0.22,
  },
  '8': {
    d: 8,
    massKgPerM: 0.4,
    h6UpperUm: 0,
    h6LowerUm: -9,
    g6UpperUm: -5,
    g6LowerUm: -14,
    maxLengthMm: 1500,
    samickMassKgPerM: 0.39,
  },
  '10': {
    d: 10,
    massKgPerM: 0.62,
    h6UpperUm: 0,
    h6LowerUm: -9,
    g6UpperUm: -5,
    g6LowerUm: -14,
    maxLengthMm: 2000,
    samickMassKgPerM: 0.62,
  },
  '12': {
    d: 12,
    massKgPerM: 0.89,
    h6UpperUm: 0,
    h6LowerUm: -11,
    g6UpperUm: -6,
    g6LowerUm: -17,
    maxLengthMm: 3000,
    samickMassKgPerM: 0.89,
  },
};

export const LINEAR_BUSHINGS: Record<
  string,
  {
    d: number;
    D: number;
    L: number;
    B: number | null;
    W: number | null;
    D1: number | null;
    ballRows: number;
    C: number;
    C0: number;
    massG: number;
    samickMassG: number | null;
  }
> = {
  LM3UU: {
    d: 3,
    D: 7,
    L: 10,
    B: null,
    W: null,
    D1: null,
    ballRows: 4,
    C: 88.2,
    C0: 108,
    massG: 1.6,
    samickMassG: null,
  },
  LM4UU: {
    d: 4,
    D: 8,
    L: 12,
    B: null,
    W: null,
    D1: null,
    ballRows: 4,
    C: 88.2,
    C0: 127,
    massG: 2.2,
    samickMassG: null,
  },
  LM5UU: { d: 5, D: 10, L: 15, B: 10.2, W: 1.1, D1: 9.6, ballRows: 4, C: 167, C0: 206, massG: 4, samickMassG: 4 },
  LM6UU: { d: 6, D: 12, L: 19, B: 13.5, W: 1.1, D1: 11.5, ballRows: 4, C: 206, C0: 265, massG: 8, samickMassG: 8 },
  LM8UU: { d: 8, D: 15, L: 24, B: 17.5, W: 1.1, D1: 14.3, ballRows: 4, C: 265, C0: 402, massG: 13.5, samickMassG: 16 },
  LM10UU: { d: 10, D: 19, L: 29, B: 22, W: 1.3, D1: 18, ballRows: 4, C: 373, C0: 549, massG: 25, samickMassG: 30 },
  LM12UU: { d: 12, D: 21, L: 30, B: 23, W: 1.3, D1: 20, ballRows: 4, C: 412, C0: 598, massG: 28, samickMassG: 31.5 },
  LM8LUU: { d: 8, D: 15, L: 45, B: 35, W: 1.1, D1: 14.3, ballRows: 4, C: 431, C0: 784, massG: 26, samickMassG: 31 },
  LM10LUU: { d: 10, D: 19, L: 55, B: 44, W: 1.3, D1: 18, ballRows: 4, C: 588, C0: 1100, massG: 48, samickMassG: 62 },
  LM12LUU: { d: 12, D: 21, L: 57, B: 46, W: 1.3, D1: 20, ballRows: 4, C: 657, C0: 1200, massG: 56, samickMassG: 80 },
};

export const FLANGED_BEARINGS: Record<
  string,
  {
    nskNumber: string;
    d: number;
    D: number;
    B: number;
    D1: number;
    C1: number;
    Bzz: number;
    D1zz: number;
    C1zz: number;
    rMin: number;
    Cr: number;
    C0r: number;
    massG: number;
    massGzz: number;
  }
> = {
  MF63: {
    nskNumber: 'MF 63',
    d: 3,
    D: 6,
    B: 2,
    D1: 7.2,
    C1: 0.6,
    Bzz: 2.5,
    D1zz: 7.2,
    C1zz: 0.6,
    rMin: 0.1,
    Cr: 208,
    C0r: 74,
    massG: 0.27,
    massGzz: 0.33,
  },
  F623: {
    nskNumber: 'F 623',
    d: 3,
    D: 10,
    B: 4,
    D1: 11.5,
    C1: 1,
    Bzz: 4,
    D1zz: 11.5,
    C1zz: 1,
    rMin: 0.15,
    Cr: 630,
    C0r: 218,
    massG: 1.85,
    massGzz: 1.86,
  },
  F624: {
    nskNumber: 'F 624',
    d: 4,
    D: 13,
    B: 5,
    D1: 15,
    C1: 1,
    Bzz: 5,
    D1zz: 15,
    C1zz: 1,
    rMin: 0.2,
    Cr: 1300,
    C0r: 485,
    massG: 3.38,
    massGzz: 3.53,
  },
  MF85: {
    nskNumber: 'MF 85',
    d: 5,
    D: 8,
    B: 2,
    D1: 9.2,
    C1: 0.6,
    Bzz: 2.5,
    D1zz: 9.2,
    C1zz: 0.6,
    rMin: 0.1,
    Cr: 310,
    C0r: 120,
    massG: 0.33,
    massGzz: 0.41,
  },
  MF105: {
    nskNumber: 'MF 105',
    d: 5,
    D: 10,
    B: 3,
    D1: 11.2,
    C1: 0.6,
    Bzz: 4,
    D1zz: 11.6,
    C1zz: 0.8,
    rMin: 0.15,
    Cr: 430,
    C0r: 168,
    massG: 1.05,
    massGzz: 1.46,
  },
  F625: {
    nskNumber: 'F 625',
    d: 5,
    D: 16,
    B: 5,
    D1: 18,
    C1: 1,
    Bzz: 5,
    D1zz: 18,
    C1zz: 1,
    rMin: 0.3,
    Cr: 1730,
    C0r: 670,
    massG: 5.37,
    massGzz: 5.3,
  },
  F626: {
    nskNumber: 'F 626',
    d: 6,
    D: 19,
    B: 6,
    D1: 22,
    C1: 1.5,
    Bzz: 6,
    D1zz: 22,
    C1zz: 1.5,
    rMin: 0.3,
    Cr: 2340,
    C0r: 885,
    massG: 9.09,
    massGzz: 9.09,
  },
  F688: {
    nskNumber: 'F 688 A',
    d: 8,
    D: 16,
    B: 4,
    D1: 18,
    C1: 1,
    Bzz: 5,
    D1zz: 18,
    C1zz: 1.1,
    rMin: 0.2,
    Cr: 1610,
    C0r: 710,
    massG: 3.54,
    massGzz: 4.47,
  },
  F608: {
    nskNumber: 'F 608',
    d: 8,
    D: 22,
    B: 7,
    D1: 25,
    C1: 1.5,
    Bzz: 7,
    D1zz: 25,
    C1zz: 1.5,
    rMin: 0.3,
    Cr: 3300,
    C0r: 1370,
    massG: 13.4,
    massGzz: 13.5,
  },
};

export const THRUST_BEARINGS: Record<
  string,
  {
    d: number;
    D: number;
    T: number;
    shaftWasherOd: number;
    housingWasherBore: number;
    rMin: number;
    daMin: number;
    DaMax: number;
    Ca: number;
    C0a: number;
    massG: number;
  }
> = {
  '51100': {
    d: 10,
    D: 24,
    T: 9,
    shaftWasherOd: 24,
    housingWasherBore: 11,
    rMin: 0.3,
    daMin: 18,
    DaMax: 16,
    Ca: 10100,
    C0a: 14000,
    massG: 19,
  },
  '51101': {
    d: 12,
    D: 26,
    T: 9,
    shaftWasherOd: 26,
    housingWasherBore: 13,
    rMin: 0.3,
    daMin: 20,
    DaMax: 18,
    Ca: 10400,
    C0a: 15400,
    massG: 21,
  },
  '51102': {
    d: 15,
    D: 28,
    T: 9,
    shaftWasherOd: 28,
    housingWasherBore: 16,
    rMin: 0.3,
    daMin: 23,
    DaMax: 20,
    Ca: 10600,
    C0a: 16800,
    massG: 23,
  },
  '51103': {
    d: 17,
    D: 30,
    T: 9,
    shaftWasherOd: 30,
    housingWasherBore: 18,
    rMin: 0.3,
    daMin: 25,
    DaMax: 22,
    Ca: 11400,
    C0a: 19500,
    massG: 25,
  },
  '51104': {
    d: 20,
    D: 35,
    T: 10,
    shaftWasherOd: 35,
    housingWasherBore: 21,
    rMin: 0.3,
    daMin: 29,
    DaMax: 26,
    Ca: 15100,
    C0a: 26600,
    massG: 37,
  },
};

export const MINI_THRUST_BEARINGS: Record<
  string,
  {
    d: number;
    D: number;
    H: number;
    housingWasherBore: number;
    shaftWasherOd: number;
    rMin: number;
    balls: number;
    ballDiameter: number;
    massG: number;
  }
> = {
  'F4-10M': {
    d: 4,
    D: 10,
    H: 4,
    housingWasherBore: 4.2,
    shaftWasherOd: 9.8,
    rMin: 0.15,
    balls: 6,
    ballDiameter: 1.588,
    massG: 1.5,
  },
  'F5-12M': {
    d: 5,
    D: 12,
    H: 4,
    housingWasherBore: 5.2,
    shaftWasherOd: 11.8,
    rMin: 0.2,
    balls: 8,
    ballDiameter: 1.588,
    massG: 2.1,
  },
  'F6-14M': {
    d: 6,
    D: 14,
    H: 5,
    housingWasherBore: 6.25,
    shaftWasherOd: 13.8,
    rMin: 0.2,
    balls: 7,
    ballDiameter: 2.381,
    massG: 3.5,
  },
  'F8-16M': {
    d: 8,
    D: 16,
    H: 5,
    housingWasherBore: 8.2,
    shaftWasherOd: 15.8,
    rMin: 0.3,
    balls: 9,
    ballDiameter: 3,
    massG: 3.9,
  },
};

export const MISUMI_EXTRUSIONS: Record<
  string,
  {
    maker: string;
    partNumber: string;
    series: number;
    size: [number, number];
    cornerRadius: number;
    slotOpening: number;
    lipThickness: number;
    undercutWidth: number;
    undercutDepth: number;
    slotDepth: number;
    coreWidth: number;
    slotBottomGroove: { angleDeg: number; depth: number };
    bores: { diameter: number; at: [number, number]; endTap: { thread: string; depth: number } }[];
    cornerHoles: { count: number; diameter: number; pitch: number } | null;
    slotCentres: { shortFace: number[]; longFace: number[] };
    massKgPerM: number;
    areaMm2: number;
    ixMm4: number;
    iyMm4: number;
    outerTolerance: [number, number];
    material: string;
  }
> = {
  'HFS5-2020': {
    maker: 'Misumi',
    partNumber: 'HFS5-2020',
    series: 5,
    size: [20, 20],
    cornerRadius: 1,
    slotOpening: 6,
    lipThickness: 2,
    undercutWidth: 12,
    undercutDepth: 4,
    slotDepth: 6,
    coreWidth: 8,
    slotBottomGroove: { angleDeg: 120, depth: 0.3 },
    bores: [{ diameter: 4.2, at: [10, 10], endTap: { thread: 'M5', depth: 15 } }],
    cornerHoles: null,
    slotCentres: { shortFace: [10], longFace: [10] },
    massKgPerM: 0.5,
    areaMm2: 183,
    ixMm4: 0.742e4,
    iyMm4: 0.742e4,
    outerTolerance: [0.41, 0.41],
    material: 'A6N01SS-T5 or 6005A-T5',
  },
  'HFS5-2040': {
    maker: 'Misumi',
    partNumber: 'HFS5-2040',
    series: 5,
    size: [20, 40],
    cornerRadius: 1,
    slotOpening: 6,
    lipThickness: 2,
    undercutWidth: 12,
    undercutDepth: 4,
    slotDepth: 6,
    coreWidth: 8,
    slotBottomGroove: { angleDeg: 120, depth: 0.3 },
    bores: [
      { diameter: 4.2, at: [10, 10], endTap: { thread: 'M5', depth: 15 } },
      { diameter: 4.2, at: [10, 30], endTap: { thread: 'M5', depth: 15 } },
    ],
    cornerHoles: null,
    slotCentres: { shortFace: [10], longFace: [10, 30] },
    massKgPerM: 0.88,
    areaMm2: 324,
    ixMm4: 1.358e4,
    iyMm4: 5.13e4,
    outerTolerance: [0.41, 0.54],
    material: 'A6N01SS-T5 or 6005A-T5',
  },
  'HFS6-3030': {
    maker: 'Misumi',
    partNumber: 'HFS6-3030',
    series: 6,
    size: [30, 30],
    cornerRadius: 2,
    slotOpening: 8,
    lipThickness: 2,
    undercutWidth: 16.5,
    undercutDepth: 7,
    slotDepth: 9,
    coreWidth: 12,
    slotBottomGroove: { angleDeg: 120, depth: 0.3 },
    bores: [{ diameter: 6.8, at: [15, 15], endTap: { thread: 'M8', depth: 24 } }],
    cornerHoles: { count: 4, diameter: 4.2, pitch: 23.2 },
    slotCentres: { shortFace: [15], longFace: [15] },
    massKgPerM: 0.9,
    areaMm2: 333,
    ixMm4: 2.83e4,
    iyMm4: 2.83e4,
    outerTolerance: [0.54, 0.54],
    material: 'A6N01SS-T5',
  },
};

export const MISUMI_TNUTS: Record<
  string,
  {
    maker: string;
    partNumber: string;
    series: number;
    insertion: 'pre' | 'post';
    retainer: 'none' | 'ball' | 'leaf';
    threads: string[];
    tongueWidth: number;
    width: number;
    length: number;
    bodyHeight: number;
    height: number;
    threadOffset: number | null;
  }
> = {
  HNTT5: {
    maker: 'Misumi',
    partNumber: 'HNTT5',
    series: 5,
    insertion: 'pre',
    retainer: 'none',
    threads: ['M3', 'M4', 'M5'],
    tongueWidth: 5.8,
    width: 10,
    length: 10,
    bodyHeight: 3.3,
    height: 4.1,
    threadOffset: null,
  },
  HNTU5: {
    maker: 'Misumi',
    partNumber: 'HNTU5',
    series: 5,
    insertion: 'pre',
    retainer: 'ball',
    threads: ['M3', 'M4', 'M5'],
    tongueWidth: 5.8,
    width: 10,
    length: 14,
    bodyHeight: 3.3,
    height: 4.1,
    threadOffset: 4.5,
  },
  HNTP5: {
    maker: 'Misumi',
    partNumber: 'HNTP5',
    series: 5,
    insertion: 'post',
    retainer: 'ball',
    threads: ['M3', 'M4', 'M5'],
    tongueWidth: 5.8,
    width: 8.3,
    length: 17,
    bodyHeight: 3.2,
    height: 3.8,
    threadOffset: 6,
  },
  HNTA5: {
    maker: 'Misumi',
    partNumber: 'HNTA5',
    series: 5,
    insertion: 'post',
    retainer: 'none',
    threads: ['M3', 'M4', 'M5'],
    tongueWidth: 5.8,
    width: 8,
    length: 15,
    bodyHeight: 2.5,
    height: 3.2,
    threadOffset: null,
  },
  HNTAJ5: {
    maker: 'Misumi',
    partNumber: 'HNTAJ5',
    series: 5,
    insertion: 'post',
    retainer: 'leaf',
    threads: ['M3', 'M4', 'M5'],
    tongueWidth: 5.8,
    width: 8,
    length: 10,
    bodyHeight: 2.4,
    height: 3.2,
    threadOffset: null,
  },
  HNTT6: {
    maker: 'Misumi',
    partNumber: 'HNTT6',
    series: 6,
    insertion: 'pre',
    retainer: 'none',
    threads: ['M3', 'M4', 'M5', 'M6'],
    tongueWidth: 7.8,
    width: 15,
    length: 14,
    bodyHeight: 5.5,
    height: 6.3,
    threadOffset: null,
  },
  HNTU6: {
    maker: 'Misumi',
    partNumber: 'HNTU6',
    series: 6,
    insertion: 'pre',
    retainer: 'ball',
    threads: ['M3', 'M4', 'M5', 'M6'],
    tongueWidth: 7.8,
    width: 15,
    length: 16,
    bodyHeight: 6,
    height: 6.8,
    threadOffset: 5,
  },
  HNTP6: {
    maker: 'Misumi',
    partNumber: 'HNTP6',
    series: 6,
    insertion: 'post',
    retainer: 'ball',
    threads: ['M3', 'M4', 'M5', 'M6'],
    tongueWidth: 7.8,
    width: 11.5,
    length: 17,
    bodyHeight: 6.3,
    height: 6.8,
    threadOffset: 6,
  },
  HNTA6: {
    maker: 'Misumi',
    partNumber: 'HNTA6',
    series: 6,
    insertion: 'post',
    retainer: 'none',
    threads: ['M3', 'M4', 'M5', 'M6'],
    tongueWidth: 7.8,
    width: 11.5,
    length: 17,
    bodyHeight: 5.5,
    height: 6.3,
    threadOffset: null,
  },
  HNTAJ6: {
    maker: 'Misumi',
    partNumber: 'HNTAJ6',
    series: 6,
    insertion: 'post',
    retainer: 'leaf',
    threads: ['M3', 'M4', 'M5', 'M6'],
    tongueWidth: 7.8,
    width: 11.5,
    length: 10,
    bodyHeight: 5.5,
    height: 6.3,
    threadOffset: null,
  },
};

export const MISUMI_CORNER_BRACKETS: Record<
  string,
  {
    maker: string;
    partNumber: string;
    series: number;
    legBase: number;
    legUpright: number;
    width: number;
    legTipHeight: number;
    tabProtrusion: number;
    holeDiameter: number;
    baseHoles: number[];
    uprightHoles: number[];
    sideTapM5: [number, number];
    massG: number;
    allowableLoadN: number;
    screw: string;
    nut: string;
    material: string;
  }
> = {
  HBLFSN5: {
    maker: 'Misumi',
    partNumber: 'HBLFSN5',
    series: 5,
    legBase: 30,
    legUpright: 30,
    width: 20,
    legTipHeight: 4.5,
    tabProtrusion: 1,
    holeDiameter: 5.3,
    baseHoles: [10, 18],
    uprightHoles: [18],
    sideTapM5: [12, 12],
    massG: 15,
    allowableLoadN: 1176,
    screw: 'CBM5-10',
    nut: 'HNTT5-5',
    material: 'ADC12 aluminium die-cast',
  },
  HBLFSNF5: {
    maker: 'Misumi',
    partNumber: 'HBLFSNF5',
    series: 5,
    legBase: 20,
    legUpright: 30,
    width: 20,
    legTipHeight: 4.5,
    tabProtrusion: 1,
    holeDiameter: 5.2,
    baseHoles: [10],
    uprightHoles: [18],
    sideTapM5: [12, 12],
    massG: 13,
    allowableLoadN: 1176,
    screw: 'CBM5-10',
    nut: 'HNTT5-5',
    material: 'ADC12 aluminium die-cast',
  },
};

export const RULAND_MSC_SET_SCREW_COLLARS: Record<
  string,
  { boreMm: number; odMm: number; widthMm: number; setScrew: string }
> = {
  'MSC-4-F': { boreMm: 4, odMm: 8, widthMm: 5, setScrew: 'M2.5x3' },
  'MSC-5-F': { boreMm: 5, odMm: 10, widthMm: 6, setScrew: 'M3x4' },
  'MSC-6-F': { boreMm: 6, odMm: 12, widthMm: 8, setScrew: 'M4x4' },
  'MSC-8-F': { boreMm: 8, odMm: 16, widthMm: 8, setScrew: 'M4x4' },
  'MSC-10-F': { boreMm: 10, odMm: 20, widthMm: 10, setScrew: 'M5x5' },
  'MSC-12-F': { boreMm: 12, odMm: 22, widthMm: 12, setScrew: 'M6x6' },
};

export const RULAND_MCL_CLAMP_COLLARS: Record<
  string,
  {
    boreMm: number;
    odMm: number;
    widthMm: number;
    clampScrew: string;
    screwCount: number;
    screwLocationRMm: number;
    clearanceDiaCMaxMm: number;
    hexKeyMm: number;
    seatingTorqueNm: number;
  }
> = {
  'MCL-3-F': {
    boreMm: 3,
    odMm: 16,
    widthMm: 9,
    clampScrew: 'M3x8',
    screwCount: 1,
    screwLocationRMm: 5.51,
    clearanceDiaCMaxMm: 20.8,
    hexKeyMm: 2.5,
    seatingTorqueNm: 2.1,
  },
  'MCL-4-F': {
    boreMm: 4,
    odMm: 16,
    widthMm: 9,
    clampScrew: 'M3x8',
    screwCount: 1,
    screwLocationRMm: 5.51,
    clearanceDiaCMaxMm: 20.8,
    hexKeyMm: 2.5,
    seatingTorqueNm: 2.1,
  },
  'MCL-5-F': {
    boreMm: 5,
    odMm: 16,
    widthMm: 9,
    clampScrew: 'M3x8',
    screwCount: 1,
    screwLocationRMm: 5.51,
    clearanceDiaCMaxMm: 20.8,
    hexKeyMm: 2.5,
    seatingTorqueNm: 2.1,
  },
  'MCL-6-F': {
    boreMm: 6,
    odMm: 16,
    widthMm: 9,
    clampScrew: 'M3x8',
    screwCount: 1,
    screwLocationRMm: 5.51,
    clearanceDiaCMaxMm: 20.8,
    hexKeyMm: 2.5,
    seatingTorqueNm: 2.1,
  },
  'MCL-8-F': {
    boreMm: 8,
    odMm: 18,
    widthMm: 9,
    clampScrew: 'M3x8',
    screwCount: 1,
    screwLocationRMm: 6.5,
    clearanceDiaCMaxMm: 22.4,
    hexKeyMm: 2.5,
    seatingTorqueNm: 2.1,
  },
  'MCL-10-F': {
    boreMm: 10,
    odMm: 24,
    widthMm: 9,
    clampScrew: 'M3x10',
    screwCount: 1,
    screwLocationRMm: 8.51,
    clearanceDiaCMaxMm: 26.3,
    hexKeyMm: 2.5,
    seatingTorqueNm: 2.1,
  },
  'MCL-12-F': {
    boreMm: 12,
    odMm: 28,
    widthMm: 11,
    clampScrew: 'M4x12',
    screwCount: 1,
    screwLocationRMm: 10.01,
    clearanceDiaCMaxMm: 32,
    hexKeyMm: 3,
    seatingTorqueNm: 4.6,
  },
};

export const MISUMI_SET_SCREW_COLLARS_3MM: Record<
  string,
  { boreMm: number; odMm: number; widthMm: number; setScrew: string; setScrewCount: number }
> = {
  'SCCN3-6': { boreMm: 3, odMm: 7, widthMm: 6, setScrew: 'M3x3', setScrewCount: 2 },
  'SCCN3-8': { boreMm: 3, odMm: 7, widthMm: 8, setScrew: 'M3x3', setScrewCount: 2 },
  'SCCJ3-5': { boreMm: 3, odMm: 7, widthMm: 5, setScrew: 'M3x3', setScrewCount: 2 },
};

export const DIN471_RINGS: Record<
  string,
  {
    shaftD1: number;
    s: number;
    d3: number;
    d2: number;
    m: number;
    grooveDepth: number;
    aMax: number;
    bApprox: number;
    d5Min: number;
    nMin: number;
  }
> = {
  '3': { shaftD1: 3, s: 0.4, d3: 2.7, d2: 2.8, m: 0.5, grooveDepth: 0.1, aMax: 1.9, bApprox: 0.8, d5Min: 1, nMin: 0.3 },
  '4': { shaftD1: 4, s: 0.4, d3: 3.7, d2: 3.8, m: 0.5, grooveDepth: 0.1, aMax: 2.2, bApprox: 0.9, d5Min: 1, nMin: 0.3 },
  '5': { shaftD1: 5, s: 0.6, d3: 4.7, d2: 4.8, m: 0.7, grooveDepth: 0.1, aMax: 2.5, bApprox: 1.1, d5Min: 1, nMin: 0.3 },
  '6': {
    shaftD1: 6,
    s: 0.7,
    d3: 5.6,
    d2: 5.7,
    m: 0.8,
    grooveDepth: 0.15,
    aMax: 2.7,
    bApprox: 1.3,
    d5Min: 1.2,
    nMin: 0.5,
  },
  '7': {
    shaftD1: 7,
    s: 0.8,
    d3: 6.5,
    d2: 6.7,
    m: 0.9,
    grooveDepth: 0.15,
    aMax: 3.1,
    bApprox: 1.4,
    d5Min: 1.2,
    nMin: 0.5,
  },
  '8': {
    shaftD1: 8,
    s: 0.8,
    d3: 7.4,
    d2: 7.6,
    m: 0.9,
    grooveDepth: 0.2,
    aMax: 3.2,
    bApprox: 1.5,
    d5Min: 1.2,
    nMin: 0.6,
  },
  '9': { shaftD1: 9, s: 1, d3: 8.4, d2: 8.6, m: 1.1, grooveDepth: 0.2, aMax: 3.3, bApprox: 1.7, d5Min: 1.2, nMin: 0.6 },
  '10': {
    shaftD1: 10,
    s: 1,
    d3: 9.3,
    d2: 9.6,
    m: 1.1,
    grooveDepth: 0.2,
    aMax: 3.3,
    bApprox: 1.8,
    d5Min: 1.5,
    nMin: 0.6,
  },
  '11': {
    shaftD1: 11,
    s: 1,
    d3: 10.2,
    d2: 10.5,
    m: 1.1,
    grooveDepth: 0.25,
    aMax: 3.3,
    bApprox: 1.8,
    d5Min: 1.5,
    nMin: 0.8,
  },
  '12': {
    shaftD1: 12,
    s: 1,
    d3: 11,
    d2: 11.5,
    m: 1.1,
    grooveDepth: 0.25,
    aMax: 3.3,
    bApprox: 1.8,
    d5Min: 1.7,
    nMin: 0.8,
  },
  '13': {
    shaftD1: 13,
    s: 1,
    d3: 11.9,
    d2: 12.4,
    m: 1.1,
    grooveDepth: 0.3,
    aMax: 3.4,
    bApprox: 2,
    d5Min: 1.7,
    nMin: 0.9,
  },
  '14': {
    shaftD1: 14,
    s: 1,
    d3: 12.9,
    d2: 13.4,
    m: 1.1,
    grooveDepth: 0.3,
    aMax: 3.5,
    bApprox: 2.1,
    d5Min: 1.7,
    nMin: 0.9,
  },
  '15': {
    shaftD1: 15,
    s: 1,
    d3: 13.8,
    d2: 14.3,
    m: 1.1,
    grooveDepth: 0.35,
    aMax: 3.6,
    bApprox: 2.2,
    d5Min: 1.7,
    nMin: 1.1,
  },
  '16': {
    shaftD1: 16,
    s: 1,
    d3: 14.7,
    d2: 15.2,
    m: 1.1,
    grooveDepth: 0.4,
    aMax: 3.7,
    bApprox: 2.2,
    d5Min: 1.7,
    nMin: 1.2,
  },
  '17': {
    shaftD1: 17,
    s: 1,
    d3: 15.7,
    d2: 16.2,
    m: 1.1,
    grooveDepth: 0.4,
    aMax: 3.8,
    bApprox: 2.3,
    d5Min: 1.7,
    nMin: 1.2,
  },
  '18': {
    shaftD1: 18,
    s: 1.2,
    d3: 16.5,
    d2: 17,
    m: 1.3,
    grooveDepth: 0.5,
    aMax: 3.9,
    bApprox: 2.4,
    d5Min: 2,
    nMin: 1.5,
  },
  '19': {
    shaftD1: 19,
    s: 1.2,
    d3: 17.5,
    d2: 18,
    m: 1.3,
    grooveDepth: 0.5,
    aMax: 3.9,
    bApprox: 2.5,
    d5Min: 2,
    nMin: 1.5,
  },
  '20': { shaftD1: 20, s: 1.2, d3: 18.5, d2: 19, m: 1.3, grooveDepth: 0.5, aMax: 4, bApprox: 2.6, d5Min: 2, nMin: 1.5 },
};

export const DIN472_RINGS: Record<
  string,
  {
    boreD1: number;
    s: number;
    d3: number;
    d2: number;
    m: number;
    grooveDepth: number;
    aMax: number;
    bApprox: number;
    d5Min: number;
    nMin: number;
  }
> = {
  '8': { boreD1: 8, s: 0.8, d3: 8.7, d2: 8.4, m: 0.9, grooveDepth: 0.2, aMax: 2.4, bApprox: 1.1, d5Min: 1, nMin: 0.6 },
  '9': { boreD1: 9, s: 0.8, d3: 9.8, d2: 9.4, m: 0.9, grooveDepth: 0.2, aMax: 2.5, bApprox: 1.3, d5Min: 1, nMin: 0.6 },
  '10': {
    boreD1: 10,
    s: 1,
    d3: 10.8,
    d2: 10.4,
    m: 1.1,
    grooveDepth: 0.2,
    aMax: 3.2,
    bApprox: 1.4,
    d5Min: 1.2,
    nMin: 0.6,
  },
  '11': {
    boreD1: 11,
    s: 1,
    d3: 11.8,
    d2: 11.4,
    m: 1.1,
    grooveDepth: 0.2,
    aMax: 3.3,
    bApprox: 1.5,
    d5Min: 1.2,
    nMin: 0.6,
  },
  '12': {
    boreD1: 12,
    s: 1,
    d3: 13,
    d2: 12.5,
    m: 1.1,
    grooveDepth: 0.25,
    aMax: 3.4,
    bApprox: 1.7,
    d5Min: 1.5,
    nMin: 0.8,
  },
  '13': {
    boreD1: 13,
    s: 1,
    d3: 14.1,
    d2: 13.6,
    m: 1.1,
    grooveDepth: 0.3,
    aMax: 3.6,
    bApprox: 1.8,
    d5Min: 1.5,
    nMin: 0.9,
  },
  '14': {
    boreD1: 14,
    s: 1,
    d3: 15.1,
    d2: 14.6,
    m: 1.1,
    grooveDepth: 0.3,
    aMax: 3.7,
    bApprox: 1.8,
    d5Min: 1.7,
    nMin: 0.9,
  },
  '15': {
    boreD1: 15,
    s: 1,
    d3: 16.2,
    d2: 15.7,
    m: 1.1,
    grooveDepth: 0.35,
    aMax: 3.7,
    bApprox: 2,
    d5Min: 1.7,
    nMin: 1.1,
  },
  '16': {
    boreD1: 16,
    s: 1,
    d3: 17.3,
    d2: 16.8,
    m: 1.1,
    grooveDepth: 0.4,
    aMax: 3.8,
    bApprox: 2,
    d5Min: 1.7,
    nMin: 1.2,
  },
  '17': {
    boreD1: 17,
    s: 1,
    d3: 18.3,
    d2: 17.8,
    m: 1.1,
    grooveDepth: 0.4,
    aMax: 3.9,
    bApprox: 2.1,
    d5Min: 1.7,
    nMin: 1.2,
  },
  '18': { boreD1: 18, s: 1, d3: 19.5, d2: 19, m: 1.1, grooveDepth: 0.5, aMax: 4.1, bApprox: 2.2, d5Min: 2, nMin: 1.5 },
  '19': { boreD1: 19, s: 1, d3: 20.5, d2: 20, m: 1.1, grooveDepth: 0.5, aMax: 4.1, bApprox: 2.2, d5Min: 2, nMin: 1.5 },
  '20': { boreD1: 20, s: 1, d3: 21.5, d2: 21, m: 1.1, grooveDepth: 0.5, aMax: 4.2, bApprox: 2.3, d5Min: 2, nMin: 1.5 },
};

export const MISUMI_GPA_GT2060_DIMENSIONS: Record<
  string,
  {
    teeth: number;
    pdMm: number;
    odMm: number;
    flangeDiaF: number;
    swageBossDiaE: number;
    hubDiaD: number | null;
    shapes: string[];
  }
> = {
  '16': { teeth: 16, pdMm: 10.19, odMm: 9.68, flangeDiaF: 14, swageBossDiaE: 7, hubDiaD: null, shapes: ['A'] },
  '20': { teeth: 20, pdMm: 12.73, odMm: 12.22, flangeDiaF: 17, swageBossDiaE: 9, hubDiaD: null, shapes: ['A'] },
  '36': { teeth: 36, pdMm: 22.92, odMm: 22.41, flangeDiaF: 27, swageBossDiaE: 18, hubDiaD: 14, shapes: ['A', 'B'] },
  '40': { teeth: 40, pdMm: 25.46, odMm: 24.95, flangeDiaF: 30, swageBossDiaE: 21, hubDiaD: 17, shapes: ['A', 'B'] },
  '60': { teeth: 60, pdMm: 38.2, odMm: 37.69, flangeDiaF: 42, swageBossDiaE: 33, hubDiaD: 28, shapes: ['A', 'B'] },
};

export const MISUMI_GPA_GT2060_WIDTH = {
  toothWidthA: 7,
  widthOverFlangesW: 10.3,
  overallLengthL: 18,
  flangeThickness: 1,
  hubLengthB: 7.7,
  setScrewFromFlangeFaceB: 4,
} as const;

export const MISUMI_GT2060_TOOTHED_IDLERS: Record<
  string,
  {
    teeth: number;
    shaftD: number;
    pdMm: number;
    odMm: number;
    flangeDiaF: number;
    swageBossDiaE: number;
    toothWidthA: number;
    widthW: number;
    bearing: string;
    bearingOdMm: number;
    bearingWidthMm: number;
    innerSpacerDhMm?: number;
    bearingOffsetSMm?: number;
  }
> = {
  AGTFW30GT2060: {
    teeth: 30,
    shaftD: 5,
    pdMm: 19.1,
    odMm: 18.59,
    flangeDiaF: 24,
    swageBossDiaE: 15,
    toothWidthA: 7,
    widthW: 10.3,
    bearing: '675ZZ x2',
    bearingOdMm: 8,
    bearingWidthMm: 2.5,
    innerSpacerDhMm: 7,
  },
  AGTF40GT2060: {
    teeth: 40,
    shaftD: 6,
    pdMm: 25.46,
    odMm: 24.96,
    flangeDiaF: 30,
    swageBossDiaE: 21,
    toothWidthA: 7,
    widthW: 10.3,
    bearing: '676ZZ x1',
    bearingOdMm: 10,
    bearingWidthMm: 3,
    bearingOffsetSMm: 3.65,
  },
};

export const EXTRUSIONS = {
  '2020': MISUMI_EXTRUSIONS['HFS5-2020'],
  '2040': MISUMI_EXTRUSIONS['HFS5-2040'],
  '3030': MISUMI_EXTRUSIONS['HFS6-3030'],
} as Record<string, (typeof MISUMI_EXTRUSIONS)[string]>;

export const T_NUTS = {
  slot6: MISUMI_TNUTS.HNTT5,
  slot8: MISUMI_TNUTS.HNTT6,
};

export interface Collar {
  part: string;
  bore: number;
  od: number;
  width: number;
  screw: string;
  screwR?: number;
}

const msc = (k: string): Collar => {
  const c = RULAND_MSC_SET_SCREW_COLLARS[k];

  return { part: `Ruland ${k}`, bore: c.boreMm, od: c.odMm, width: c.widthMm, screw: c.setScrew };
};

export const SET_COLLARS: Record<string, Collar> = {
  '3': {
    part: 'Misumi SCCN3-6',
    bore: 3,
    od: MISUMI_SET_SCREW_COLLARS_3MM['SCCN3-6'].odMm,
    width: MISUMI_SET_SCREW_COLLARS_3MM['SCCN3-6'].widthMm,
    screw: MISUMI_SET_SCREW_COLLARS_3MM['SCCN3-6'].setScrew,
  },
  ...Object.fromEntries([4, 5, 6, 8, 10, 12].map((d) => [String(d), msc(`MSC-${d}-F`)])),
};

export const CLAMP_COLLARS: Record<string, Collar> = Object.fromEntries(
  Object.entries(RULAND_MCL_CLAMP_COLLARS).map(([k, c]) => [
    String(c.boreMm),
    {
      part: `Ruland ${k}`,
      bore: c.boreMm,
      od: c.odMm,
      width: c.widthMm,
      screw: c.clampScrew,
      screwR: c.screwLocationRMm,
    },
  ]),
);

export interface Gt2Pulley {
  part: string;
  teeth: number;
  bore: number;
  pd: number;
  od: number;
  flange: number;
  boss: number;
  hubD: number | null;
  setScrews: string | null;
}

const GPA = MISUMI_GPA_GT2060_DIMENSIONS;

const gpa = (teeth: number, shape: 'A' | 'B', bore: number, setScrews: string | null): Gt2Pulley => {
  const g = GPA[String(teeth)];

  return {
    part: `Misumi GPA${teeth}GT2060-${shape}-${setScrews ? 'P' : 'H'}${bore}`,
    teeth,
    bore,
    pd: g.pdMm,
    od: g.odMm,
    flange: g.flangeDiaF,
    boss: g.swageBossDiaE,
    hubD: shape === 'B' ? g.hubDiaD : null,
    setScrews,
  };
};

export const GT2_PULLEYS: Record<string, Gt2Pulley> = {
  '20T-5': gpa(20, 'A', 5, null),
  '36T-8': gpa(36, 'B', 8, '2× M4 × 3'),
  '40T-8': gpa(40, 'B', 8, '2× M4 × 3'),
  '60T-8': gpa(60, 'B', 8, '2× M4 × 3'),
};

export const GT2_IDLERS: Record<string, Gt2Pulley> = Object.fromEntries(
  Object.entries(MISUMI_GT2060_TOOTHED_IDLERS).map(([k, i]) => [
    `${i.teeth}T-${i.shaftD}`,
    {
      part: `Misumi ${k}`,
      teeth: i.teeth,
      bore: i.shaftD,
      pd: i.pdMm,
      od: i.odMm,
      flange: i.flangeDiaF,
      boss: i.swageBossDiaE,
      hubD: null,
      setScrews: null,
    },
  ]),
);
