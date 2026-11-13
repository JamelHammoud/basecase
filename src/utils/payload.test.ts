import { describe, expect, it } from 'vitest';
import { biped, box, component, joint, part, row, run, type Scene } from './engineering.fixtures';
import { G } from './engineeringMath';
import { HOLD_LIMIT } from './holdingTorque';
import { payloadMap, type ArmModel } from './payload';

const L = 200;
const UPPER_KG = 0.1;
const FORE_KG = 0.08;
const STALL_NM = 2;
const HEIGHT = 1000;

const planar = (shoulderNm = STALL_NM): ArmModel => ({
  floorY: 0,
  tip: [2 * L, HEIGHT, 0],
  links: [
    {
      anchor: [0, HEIGHT, 0],
      axis: [0, 0, 1],
      revolute: true,
      range: [-90, 90],
      stallNm: shoulderNm,
      massKg: UPPER_KG,
      com: [L / 2, HEIGHT, 0],
    },
    {
      anchor: [L, HEIGHT, 0],
      axis: [0, 0, 1],
      revolute: true,
      range: [-150, 150],
      stallNm: STALL_NM,
      massKg: FORE_KG,
      com: [1.5 * L, HEIGHT, 0],
    },
  ],
});

const metres = (mm: number) => mm / 1000;
const limit = HOLD_LIMIT * STALL_NM;

const stretchedOutKg = Math.min(
  (limit - G * (UPPER_KG * metres(L / 2) + FORE_KG * metres(1.5 * L))) / (G * metres(2 * L)),
  (limit - G * FORE_KG * metres(L / 2)) / (G * metres(L)),
);

const halfReachKg = Math.min(
  (limit - G * (UPPER_KG * metres(L / 2) + FORE_KG * metres(L))) / (G * metres(L)),
  (limit - G * FORE_KG * metres(L / 2)) / (G * metres(L)),
);

describe('payloadMap', () => {
  it('matches the analytic payload of a two-link arm stretched out and at half reach', () => {
    const map = payloadMap(planar())!;

    expect(map.reachMm).toBeCloseTo(2 * L, -1);
    expect(Math.abs(map.fullReachKg / stretchedOutKg - 1)).toBeLessThan(0.02);
    expect(Math.abs(map.closeInKg / halfReachKg - 1)).toBeLessThan(0.02);
  });

  it('lifts more at full reach with a stronger shoulder', () => {
    expect(payloadMap(planar(4))!.fullReachKg).toBeGreaterThan(payloadMap(planar())!.fullReachKg);
  });

  it('is the same every time', () => {
    expect(payloadMap(planar())).toEqual(payloadMap(planar()));
  });

  it('leaves out poses that put the hand under the floor', () => {
    const low: ArmModel = {
      ...planar(),
      floorY: HEIGHT,
    };
    const map = payloadMap(low)!;

    expect(map.samples.every((s) => s.at[1] >= HEIGHT)).toBe(true);
  });
});

const SERVO = 'feetech-sts3215';
const STRONG_SERVO = 'feetech-sts3250';
const VARIANT: Record<string, string | undefined> = { [SERVO]: 'c001' };

function deskArm(shoulderServo = SERVO): Scene {
  return {
    parts: [
      part('base', { massG: 500 }),
      component('shoulderServo', shoulderServo, { componentVariant: VARIANT[shoulderServo] }),
      part('upper', { massG: 80 }),
      component('elbowServo', SERVO, { componentVariant: VARIANT[SERVO] }),
      part('fore', { massG: 60 }),
    ],
    measures: {
      base: box([-50, 0, -50], [50, 60, 50]),
      shoulderServo: box([-20, 60, -20], [20, 100, 20]),
      upper: box([0, 70, -15], [200, 90, 15]),
      elbowServo: box([190, 60, -20], [230, 100, 20]),
      fore: box([200, 70, -15], [400, 90, 15]),
    },
    joints: [
      joint('shoulder', {
        origin: [0, 80, 0],
        axis: [0, 0, 1],
        range: [-90, 90],
        parent: ['base', 'shoulderServo'],
        child: ['upper', 'elbowServo'],
        actuators: ['shoulderServo'],
      }),
      joint('elbow', {
        origin: [200, 80, 0],
        axis: [0, 0, 1],
        range: [-150, 150],
        parent: ['upper'],
        child: ['fore'],
        actuators: ['elbowServo'],
      }),
    ],
  };
}

const grams = (text: string) =>
  [...text.matchAll(/([\d.]+) (k?g)/g)].map(([, n, unit]) => Number(n) * (unit === 'kg' ? 1000 : 1));

describe('Payload row', () => {
  it('gives a fixed arm the grams it lifts at full reach and close in', () => {
    const payload = row(run(deskArm()), 'Payload')!;
    const [full, close] = grams(payload.detail);

    expect(payload.status).toBe('pass');
    expect(payload.detail).toMatch(/at full reach, .* close in$/);
    expect(full).toBeGreaterThan(0);
    expect(close).toBeGreaterThan(full);
    expect(payload.dots!.length).toBeGreaterThan(100);
    expect(payload.dots!.every((d) => d.shade >= 0 && d.shade <= 1)).toBe(true);
  });

  it('lifts more at full reach with a stronger shoulder servo', () => {
    const [weak] = grams(row(run(deskArm()), 'Payload')!.detail);
    const [strong] = grams(row(run(deskArm(STRONG_SERVO)), 'Payload')!.detail);

    expect(strong).toBeGreaterThan(weak);
  });

  it('measures through the given payload hook', () => {
    const seen: ArmModel[] = [];

    run(deskArm(), {}, { payload: (arm) => (seen.push(arm), payloadMap(arm)) });

    expect(seen).toHaveLength(1);
    expect(seen[0].links).toHaveLength(2);
  });

  it('leaves robots that stand on legs alone', () => {
    expect(row(run(biped()), 'Payload')).toBeUndefined();
  });
});
