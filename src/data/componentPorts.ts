import type { Port, PortVec } from '../types/ports';

type Hole = Pick<Port, 'thread' | 'diameterMm' | 'depthMm'> & { kind?: 'screw' | 'bore' };

const UP: PortVec = [0, 1, 0];
const DOWN: PortVec = [0, -1, 0];
const PX: PortVec = [1, 0, 0];
const NX: PortVec = [-1, 0, 0];
const PZ: PortVec = [0, 0, 1];
const NZ: PortVec = [0, 0, -1];

const r2 = (v: number) => Math.round(v * 100) / 100;

function hole(name: string, position: PortVec, axis: PortVec, spec: Hole): Port {
  return { name, position: position.map(r2) as PortVec, axis, kind: spec.kind ?? 'screw', ...spec };
}

function points(name: string, axis: PortVec, at: PortVec[], spec: Hole): Port[] {
  return at.map((p, i) => hole(`${name}-${i + 1}`, p, axis, spec));
}

function grid(name: string, at: { center: PortVec; axis: PortVec; span: [number, number] }, spec: Hole): Port[] {
  const k = at.axis.findIndex((v) => v !== 0);
  const [u, v] = [0, 1, 2].filter((i) => i !== k);
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];

  return points(
    name,
    at.axis,
    corners.map(([su, sv]) => {
      const p: PortVec = [...at.center];

      p[u] += (su * at.span[0]) / 2;
      p[v] += (sv * at.span[1]) / 2;

      return p;
    }),
    spec,
  );
}

function rotateAbout(axis: PortVec, ref: PortVec, angle: number): PortVec {
  const [kx, ky, kz] = axis;
  const [x, y, z] = ref;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dot = kx * x + ky * y + kz * z;
  const cross: PortVec = [ky * z - kz * y, kz * x - kx * z, kx * y - ky * x];

  return [0, 1, 2].map((i) => ref[i] * c + cross[i] * s + axis[i] * dot * (1 - c)) as PortVec;
}

interface Circle {
  center: PortVec;
  axis: PortVec;
  pcd: number;
  count: number;
  ref: PortVec;
}

function circle(name: string, c: Circle, spec: Hole): Port[] {
  const head: Port = {
    name,
    position: c.center,
    axis: c.axis,
    kind: 'hole_circle',
    pitchDiameterMm: c.pcd,
    count: c.count,
    ref: c.ref,
    ...spec,
  };

  const holes = Array.from({ length: c.count }, (_, i) => {
    const dir = rotateAbout(c.axis, c.ref, (2 * Math.PI * i) / c.count);

    return hole(`${name}-${i + 1}`, [0, 1, 2].map((k) => c.center[k] + (dir[k] * c.pcd) / 2) as PortVec, c.axis, spec);
  });

  return [head, ...holes];
}

const output = (position: PortVec, axis: PortVec, diameterMm: number): Port => ({
  name: 'output',
  position,
  axis,
  kind: 'output',
  diameterMm,
});

const boss = (name: string, position: PortVec, axis: PortVec, diameterMm: number): Port => ({
  name,
  position,
  axis,
  kind: 'boss',
  diameterMm,
});

const face = (name: string, position: PortVec, axis: PortVec): Port => ({ name, position, axis, kind: 'face' });

function stsBody(top: number, bottom: number, caseTop: number, caseBottom: number): Port[] {
  const m2 = { thread: 'M2', diameterMm: 1.6 };

  return [
    output([-12.5, top, 0], UP, 19.95),
    ...circle('horn', { center: [-12.5, top, 0], axis: UP, pcd: 14, count: 4, ref: PX }, { thread: 'M3', depthMm: 3 }),
    boss('idler', [-12.5, bottom, 0], DOWN, 19.95),
    ...circle(
      'idler-horn',
      { center: [-12.5, bottom, 0], axis: DOWN, pcd: 14, count: 4, ref: PX },
      { thread: 'M3', depthMm: 3 },
    ),
    ...points(
      'case-top',
      UP,
      [
        [-4.2, caseTop, -10.25],
        [-4.2, caseTop, 10.25],
        [20.2, caseTop, -10.25],
        [20.2, caseTop, 10.25],
      ],
      { ...m2, depthMm: 3 },
    ),
    ...points(
      'case-bottom',
      DOWN,
      [
        [-4.2, caseBottom, -10.25],
        [-4.2, caseBottom, 10.25],
        [16.45, caseBottom, -10.25],
        [16.45, caseBottom, 10.25],
      ],
      { ...m2, depthMm: 1.5 },
    ),
  ];
}

interface Dynamixel {
  axisZ: number;
  top: number;
  bottom: number;
  horn: { pcd: number; count: number; thread: string; diameter: number; depth: number };
  sides: { x: number; y: [number, number]; z: [number, number] };
  end: { z: number; x: number; y: [number, number] };
  caseThread: Hole;
}

function dynamixelBody(d: Dynamixel): Port[] {
  const hornHole = { thread: d.horn.thread, depthMm: d.horn.depth };
  const sideAt = (x: number): PortVec[] => d.sides.y.flatMap((y) => d.sides.z.map((z): PortVec => [x, y, z]));

  return [
    output([0, d.top, d.axisZ], UP, d.horn.diameter),
    ...circle(
      'horn',
      { center: [0, d.top, d.axisZ], axis: UP, pcd: d.horn.pcd, count: d.horn.count, ref: PX },
      hornHole,
    ),
    boss('idler', [0, d.bottom, d.axisZ], DOWN, d.horn.diameter),
    ...circle(
      'idler-horn',
      { center: [0, d.bottom, d.axisZ], axis: DOWN, pcd: d.horn.pcd, count: d.horn.count, ref: PX },
      hornHole,
    ),
    ...points('side-left', PX, sideAt(d.sides.x), d.caseThread),
    ...points('side-right', NX, sideAt(-d.sides.x), d.caseThread),
    ...points(
      'end',
      PZ,
      d.end.y.flatMap((y) => [-d.end.x, d.end.x].map((x): PortVec => [x, y, d.end.z])),
      d.caseThread,
    ),
  ];
}

const board = (name: string, at: { center: PortVec; span: [number, number]; faces: [number, number] }, spec: Hole) => [
  ...grid(`${name}-bottom`, { center: [at.center[0], at.faces[0], at.center[2]], axis: DOWN, span: at.span }, spec),
  ...grid(`${name}-top`, { center: [at.center[0], at.faces[1], at.center[2]], axis: UP, span: at.span }, spec),
];

const M25_BOARD: Hole = { kind: 'bore', thread: 'M2.5', diameterMm: 2.7 };
const M2_CAMERA: Hole = { kind: 'bore', thread: 'M2', diameterMm: 2.2 };

const STS3215 = stsBody(18.35, -18.9, 16.3, -15.7);

export const COMPONENT_PORTS: Record<string, Port[]> = {
  'feetech-sts3215': STS3215,
  'feetech-sts3250': STS3215,
  'waveshare-st3215-hs': STS3215,
  'hiwonder-lx-16a': stsBody(18.15, -18.05, 16.05, -15.95).map((p) =>
    p.name.startsWith('horn') || p.name.startsWith('idler-horn') ? { ...p, thread: 'M2' } : p,
  ),
  'dynamixel-xl430-w250': dynamixelBody({
    axisZ: -12,
    top: 18.55,
    bottom: -19.45,
    horn: { pcd: 16, count: 4, thread: 'M2', diameter: 20.5, depth: 3.5 },
    sides: { x: 14.25, y: [-6.45, 5.55], z: [-8, 16] },
    end: { z: 23.25, x: 8, y: [-6.45, 5.55] },
    caseThread: { thread: 'M2', diameterMm: 2.1, depthMm: 4 },
  }),
  'dynamixel-xm430-w350': dynamixelBody({
    axisZ: -12,
    top: 16.65,
    bottom: -21.35,
    horn: { pcd: 16, count: 8, thread: 'M2', diameter: 19.5, depth: 2 },
    sides: { x: 14.25, y: [-8.35, 3.65], z: [-8, 16] },
    end: { z: 23.25, x: 8, y: [-8.35, 3.65] },
    caseThread: { thread: 'M2.5', depthMm: 3 },
  }),
  'dynamixel-xm540-w270': dynamixelBody({
    axisZ: -15.5,
    top: 21.85,
    bottom: -27.15,
    horn: { pcd: 22, count: 8, thread: 'M2.5', diameter: 26, depth: 2.5 },
    sides: { x: 16.75, y: [-10.65, 5.35], z: [-9.5, 22.5] },
    end: { z: 29.25, x: 10, y: [-10.65, 5.35] },
    caseThread: { thread: 'M2.5', depthMm: 3 },
  }),
  'dynamixel-xl330-m288': xl330(),
  'dynamixel-xc330-m288': xl330(),
  'dynamixel-2xl430-w250': [
    { ...output([-0.45, 18.55, -12], UP, 20.5), name: 'output-a' },
    ...circle(
      'horn-a',
      { center: [-0.45, 18.55, -12], axis: UP, pcd: 16, count: 4, ref: PX },
      { thread: 'M2', depthMm: 3.9 },
    ),
    { ...output([18.55, -0.45, 12], PX, 20.5), name: 'output-b' },
    ...circle(
      'horn-b',
      { center: [18.55, -0.45, 12], axis: PX, pcd: 16, count: 4, ref: UP },
      { thread: 'M2', depthMm: 3.9 },
    ),
  ],
  'towerpro-sg90': [output([5.25, 15.15, 0], UP, 4.8)],
  'towerpro-mg996r': [output([10, 21.35, 0], UP, 5.9)],
  'dsservo-ds3218': [output([8.73, 24.05, 0.15], UP, 5.9)],
  'feetech-scs0009': [output([5.7, 14.23, 0], UP, 3.95)],
  'raspberry-pi-5': board('mount', { center: [-11.27, 0, -0.85], span: [58, 49], faces: [-8.01, -6.73] }, M25_BOARD),
  'raspberry-pi-4b': board('mount', { center: [-12, 0, -1.2], span: [58, 49], faces: [-7.85, -6.25] }, M25_BOARD),
  'raspberry-pi-zero-2w': board('mount', { center: [0, 0, -0.72], span: [58, 23], faces: [-2.15, -1.15] }, M25_BOARD),
  'adafruit-bno085': board(
    'mount',
    { center: [0, 0, 0], span: [20.32, 17.78], faces: [-2.27, -0.69] },
    { kind: 'bore', thread: 'M2.5', diameterMm: 2.5 },
  ),
  'adafruit-lsm6dsox-lis3mdl': board(
    'mount',
    { center: [0, 0, 0], span: [20.32, 12.7], faces: [-2.27, -0.69] },
    { kind: 'bore', thread: 'M2.5', diameterMm: 2.5 },
  ),
  'raspberry-pi-pico-2': board(
    'mount',
    { center: [0.63, 0, 0], span: [47, 11.44], faces: [-1.86, -0.85] },
    { kind: 'bore', thread: 'M2', diameterMm: 2.1 },
  ),
  'raspberry-pi-camera-2': board('mount', { center: [0, 0, 3.69], span: [21, 12.5], faces: [-2, -1] }, M2_CAMERA),
  'raspberry-pi-camera-3': [
    ...board('mount', { center: [-3.68, 0, 0], span: [12.55, 21], faces: [1.83, 2.5] }, M2_CAMERA),
    face('lens', [2.47, -5.12, 0], DOWN),
  ],
  'raspberry-pi-camera-3-wide': [
    ...board('mount', { center: [-3.68, 0, 0], span: [12.55, 21], faces: [2.4, 3.07] }, M2_CAMERA),
    face('lens', [2.47, -5.7, 0], DOWN),
  ],
  'raspberry-pi-ai-camera': [
    ...board('mount', { center: [0, 0, -3.68], span: [21, 12.5], faces: [-3.4, -2.4] }, M2_CAMERA),
    face('lens', [0, 5.95, 2.47], UP),
  ],
  'luxonis-oak-1': points(
    'back',
    PZ,
    [
      [-12.5, 2.5, 13.9],
      [12.5, 2.5, 13.9],
    ],
    { thread: 'M4', diameterMm: 3.3, depthMm: 7 },
  ),
  'luxonis-oak-d-lite': points(
    'back',
    NZ,
    [
      [-37.5, -4.5, -8.72],
      [37.5, -4.5, -8.72],
    ],
    { thread: 'M4', diameterMm: 3.3, depthMm: 6.5 },
  ),
  'realsense-d435': realsense({ back: -12.52, span: 45, depth: 3, tripod: [0, -12.5, 0], tripodDepth: 5.5 }),
  'realsense-d435i': realsense({ back: -12.52, span: 45, depth: 3, tripod: [0, -12.5, 0], tripodDepth: 5.5 }),
  'realsense-d405': realsense({ back: -11.5, span: 20, depth: 4, tripod: [0.05, -21, -3.15], tripodDepth: 5 }),
};

function xl330(): Port[] {
  const tap = { thread: 'M2', diameterMm: 1.6, depthMm: 3.3 };
  const through = { thread: 'M2', diameterMm: 2, depthMm: 6 };

  return [
    output([0, 14.5, -7.5], UP, 16),
    ...circle('horn', { center: [0, 14.5, -7.5], axis: UP, pcd: 12, count: 4, ref: PX }, tap),
    ...grid('case-top', { center: [0, 11.5, 0], axis: UP, span: [16, 30] }, through),
    ...grid('case-bottom', { center: [0, -11.5, 0], axis: DOWN, span: [16, 30] }, through),
  ];
}

function realsense(r: { back: number; span: number; depth: number; tripod: PortVec; tripodDepth: number }): Port[] {
  return [
    ...points(
      'back',
      NZ,
      [
        [-r.span / 2, 0, r.back],
        [r.span / 2, 0, r.back],
      ],
      { thread: 'M3', diameterMm: 2.5, depthMm: r.depth },
    ),
    hole('tripod', r.tripod, DOWN, { thread: '1/4-20', diameterMm: 5.1, depthMm: r.tripodDepth }),
  ];
}

export const componentPorts = (componentId: string | undefined): Port[] =>
  (componentId && COMPONENT_PORTS[componentId]) || [];
