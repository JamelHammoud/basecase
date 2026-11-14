import type { BldcMotor } from './motors';

export type P2 = [number, number];

export const CYCLOIDAL_RATIOS = [10, 12, 15, 20];
export const DISC_BEARING = '6804';
export const OUTPUT_BEARING = '6806';

export interface CycloidalDesign {
  ratio: number;
  lobes: number;
  pins: number;
  pinCircleR: number;
  pinD: number;
  fit: number;
  ecc: number;
  discT: number;
  gap: number;
  camD: number;
  discBore: number;
  outPins: number;
  outPinD: number;
  outPinR: number;
  holeD: number;
  wall: number;
  housingD: number;
  housingH: number;
  stageH: number;
  shaftD: number;
}

const half = (v: number) => Math.round(v * 2) / 2;
const twentieth = (v: number) => Math.round(v * 20) / 20;

export function cycloidalDesign(ratio: number, motor: Pick<BldcMotor, 'diameterMm' | 'shaftMm'>): CycloidalDesign {
  const pins = ratio + 1;
  const pinCircleR = half(motor.diameterMm / 2 + 4.5);
  const pinD = Math.min(6, Math.max(3, half((0.4 * 2 * Math.PI * pinCircleR) / pins)));
  const ecc = twentieth((0.55 * pinCircleR) / pins);
  const outPinD = 5;
  const wall = 4;

  return {
    ratio,
    lobes: ratio,
    pins,
    pinCircleR,
    pinD,
    fit: 0.15,
    ecc,
    discT: 8,
    gap: 0.5,
    camD: 20,
    discBore: 32,
    outPins: 6,
    outPinD,
    outPinR: 23,
    holeD: twentieth(outPinD + 2 * ecc + 0.4),
    wall,
    housingD: 2 * (pinCircleR + pinD / 2 + wall),
    housingH: 26,
    stageH: 35,
    shaftD: motor.shaftMm,
  };
}

const rot = ([x, y]: P2, a: number): P2 => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

export function pinPath(d: CycloidalDesign, s: number): { at: P2; tangent: P2 } {
  const R = d.pinCircleR,
    E = d.ecc,
    N = d.pins;

  return {
    at: [R * Math.cos(s) - E * Math.cos(N * s), R * Math.sin(s) - E * Math.sin(N * s)],
    tangent: [-R * Math.sin(s) + E * N * Math.sin(N * s), R * Math.cos(s) - E * N * Math.cos(N * s)],
  };
}

export function discProfile(d: CycloidalDesign, samples = 64 * d.lobes): P2[] {
  const r = d.pinD / 2 + d.fit;

  return Array.from({ length: samples }, (_, i) => {
    const { at, tangent } = pinPath(d, (2 * Math.PI * i) / samples);
    const len = Math.hypot(tangent[0], tangent[1]);

    return [at[0] - (r * tangent[1]) / len, at[1] + (r * tangent[0]) / len];
  });
}

export const secondDiscTurn = (d: CycloidalDesign) => -Math.PI / d.lobes;

export const discCenter = (d: CycloidalDesign, inputRad: number, disc: 0 | 1): P2 => {
  const a = inputRad + (disc ? Math.PI : 0);

  return [d.ecc * Math.cos(a), d.ecc * Math.sin(a)];
};

export const outputTurn = (d: CycloidalDesign, inputRad: number) => -inputRad / d.lobes;

export const ringPins = (d: CycloidalDesign): P2[] =>
  Array.from({ length: d.pins }, (_, k) => rot([d.pinCircleR, 0], (2 * Math.PI * k) / d.pins));

export const outputPinsAt = (d: CycloidalDesign, turn: number): P2[] =>
  Array.from({ length: d.outPins }, (_, k) => rot([d.outPinR, 0], (2 * Math.PI * k) / d.outPins + turn));

function inside(poly: P2[], [x, y]: P2): boolean {
  let hit = false;

  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }

  return hit;
}

function segmentDistance([px, py]: P2, [ax, ay]: P2, [bx, by]: P2): number {
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));

  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function edgeDistance(poly: P2[], p: P2): number {
  let best = Infinity;

  for (let i = 0; i < poly.length; i++) best = Math.min(best, segmentDistance(p, poly[i], poly[(i + 1) % poly.length]));

  return best;
}

export interface DiscPose {
  center: P2;
  turn: number;
}

export function posedDisc(d: CycloidalDesign, inputRad: number, disc: 0 | 1): DiscPose {
  return { center: discCenter(d, inputRad, disc), turn: outputTurn(d, inputRad) + (disc ? secondDiscTurn(d) : 0) };
}

export function pinClearance(d: CycloidalDesign, profile: P2[], pose: DiscPose): number {
  let least = Infinity;

  for (const pin of ringPins(d)) {
    const local = rot([pin[0] - pose.center[0], pin[1] - pose.center[1]], -pose.turn);
    const gap = edgeDistance(profile, local) * (inside(profile, local) ? -1 : 1) - d.pinD / 2;

    least = Math.min(least, gap);
  }

  return least;
}

export function holeClearance(d: CycloidalDesign, inputRad: number, disc: 0 | 1): number {
  const center = discCenter(d, inputRad, disc);
  const turn = outputTurn(d, inputRad);

  return Math.min(
    ...outputPinsAt(d, turn).map((pin, k) => {
      const hole = rot([d.outPinR, 0], (2 * Math.PI * k) / d.outPins + turn);
      const off = Math.hypot(pin[0] - hole[0] - center[0], pin[1] - hole[1] - center[1]);

      return d.holeD / 2 - d.outPinD / 2 - off;
    }),
  );
}

export function meshedTurn(d: CycloidalDesign, profile: P2[], inputRad: number, steps = 400): number {
  const pitch = (2 * Math.PI) / d.lobes;
  const center = discCenter(d, inputRad, 0);
  let best = { turn: 0, gap: -Infinity };

  for (let i = 0; i < steps; i++) {
    const turn = (pitch * i) / steps;
    const gap = pinClearance(d, profile, { center, turn });

    if (gap > best.gap) best = { turn, gap };
  }

  return best.turn;
}
