import type { ActuatorPoint, ActuatorSpec, ComponentInfo, ComponentVariant } from './components';

export const ACTUATOR_EFFICIENCY = 0.9;
export const ACTUATOR_SUPPLY_V = 24;

export interface ActuatorMotor {
  kv: number;
  ktNm: number;
  contA: number;
  peakA: number;
  rotorKgM2: number;
  volts: [number, number];
  driver: string;
  encoder: string;
  stator: { pcd: number; holes: number; m: number; phase: number };
  shaft: { d: number; length: number };
  body: { d: number; length: number };
  faceY: number;
  rim: number;
}

export const ACTUATOR_MOTORS: Record<string, ActuatorMotor> = {
  'odrive-d6374': {
    kv: 150,
    ktNm: 0.055,
    contA: 32,
    peakA: 90,
    rotorKgM2: 2e-4,
    volts: [10, 44],
    driver: 'mjbots-moteus-r4',
    encoder: 'adafruit-as5600',
    stator: { pcd: 44, holes: 4, m: 4, phase: 45 },
    shaft: { d: 10, length: 30 },
    body: { d: 63, length: 74 },
    faceY: 30,
    rim: 0,
  },
};

const VARIANT = /^cycloidal-(\d+)-(\d+)$/;

export const cycloidalVariantId = (pins: number, lobes: number) => `cycloidal-${pins}-${lobes}`;

export const reduction = (pins: number, lobes: number) => pins / (pins - lobes);

export function cycloidalRatio(variant: string): { pins: number; lobes: number; ratio: number } | null {
  const m = VARIANT.exec(variant);
  const pins = Number(m?.[1]);
  const lobes = Number(m?.[2]);

  if (!m || lobes >= pins || pins > 60) return null;

  return { pins, lobes, ratio: reduction(pins, lobes) };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function pointAt(motor: ActuatorMotor, ratio: number, volts: number): ActuatorPoint {
  const atOutput = motor.ktNm * ratio * ACTUATOR_EFFICIENCY;

  return {
    volts,
    stallNm: r2(atOutput * motor.peakA),
    ratedNm: r2(atOutput * motor.contA),
    rpm: Math.round((motor.kv * volts) / ratio),
  };
}

export function cycloidalSpec(motorId: string, ratio: number): ActuatorSpec | undefined {
  const motor = ACTUATOR_MOTORS[motorId];

  if (!motor) return undefined;

  const at = pointAt(motor, ratio, ACTUATOR_SUPPLY_V);

  return {
    stallNm: at.stallNm,
    ratedNm: at.ratedNm,
    volts: motor.volts,
    atVolts: ACTUATOR_SUPPLY_V,
    rpm: at.rpm,
    curve: [pointAt(motor, ratio, motor.volts[0]), pointAt(motor, ratio, motor.volts[1])],
    bus: 'can',
    peak: true,
    armature: motor.rotorKgM2 * ratio ** 2,
    source: `Estimate: Kt ${motor.ktNm} N·m/A × ${motor.peakA} A peak and ${motor.contA} A continuous × ${r2(ratio)}:1 × ${ACTUATOR_EFFICIENCY} efficiency; armature is rotor inertia × ratio²`,
  };
}

export const ratioLabel = (ratio: number) => `${r2(ratio)}:1`;

const made = new Map<string, ComponentVariant | null>();

function variantOf(c: ComponentInfo, variant: string): ComponentVariant | null {
  const found = cycloidalRatio(variant);
  const actuator = found && cycloidalSpec(c.id, found.ratio);

  return actuator ? { id: variant, label: `Cycloidal ${ratioLabel(found.ratio)}`, mpn: c.mpn, actuator } : null;
}

export function generatedVariant(c: ComponentInfo, variant: string): ComponentVariant | undefined {
  const key = `${c.id}|${variant}`;

  if (!made.has(key)) made.set(key, variantOf(c, variant));

  return made.get(key) ?? undefined;
}
