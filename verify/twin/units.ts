import { actuatorOf, type ServoFit } from '../../src/data/components';
import { between, type Rng } from '../zoo/rng';

export type Family = 'sts3215' | 'xl330';

export const FAMILIES: readonly Family[] = Object.freeze(['sts3215', 'xl330']);

export const CATALOG: Record<Family, { componentId: string; variant?: string }> = {
  sts3215: { componentId: 'feetech-sts3215', variant: 'c001' },
  xl330: { componentId: 'dynamixel-xl330-m288' },
};

export function presetOf(family: Family): { fit: ServoFit; volts: number } {
  const { componentId, variant } = CATALOG[family];
  const spec = actuatorOf(componentId, variant);

  if (!spec?.fit) throw new Error(`The catalog ${componentId} has no BAM fit`);

  return { fit: spec.fit, volts: spec.atVolts };
}

export interface TwinUnit {
  family: Family;
  volts: number;
  kt: number;
  resistance: number;
  armature: number;
  friction: number;
  frictionLoad: number;
  viscous: number;
  gain: number;
  maxDuty: number;
  delayS: number;
  stickRatio: number;
  backlashRad: number;
  stiffness: number | null;
  supplyOhm: number;
  thermal: { rth: number; cth: number; ambientC: number; startC: number; alpha: number };
  biasRad: number;
}

const spread = (rng: Rng, value: number, share: number) => value * between(rng, 1 - share, 1 + share);

const STIFFNESS: Record<Family, [number, number]> = { sts3215: [25, 70], xl330: [3, 10] };

export function nominalUnit(family: Family): TwinUnit {
  const { fit, volts } = presetOf(family);

  return {
    family,
    volts,
    kt: fit.kt,
    resistance: fit.resistance,
    armature: fit.armature,
    friction: fit.friction.base,
    frictionLoad: fit.friction.loadExternal,
    viscous: fit.friction.viscous,
    gain: fit.firmwareKp * fit.errorGain * fit.errorGainRatio,
    maxDuty: fit.maxDuty,
    delayS: fit.delayS,
    stickRatio: 1,
    backlashRad: 0,
    stiffness: null,
    supplyOhm: 0,
    thermal: { rth: 11, cth: 12, ambientC: 25, startC: 25, alpha: 0 },
    biasRad: 0,
  };
}

export function drawUnit(rng: Rng, family: Family): TwinUnit {
  const n = nominalUnit(family);

  return {
    ...n,
    kt: spread(rng, n.kt, 0.15),
    resistance: spread(rng, n.resistance, 0.2),
    armature: spread(rng, n.armature, 0.3),
    friction: spread(rng, n.friction, 0.6),
    frictionLoad: spread(rng, n.frictionLoad, 0.4),
    viscous: spread(rng, n.viscous, 0.5),
    gain: spread(rng, n.gain, 0.2),
    maxDuty: Math.min(1, spread(rng, n.maxDuty, 0.05)),
    delayS: n.delayS * between(rng, 0.5, 3),
    stickRatio: between(rng, 1.2, 1.8),
    backlashRad: between(rng, 0.004, 0.015),
    stiffness: between(rng, ...STIFFNESS[family]),
    supplyOhm: between(rng, 0.2, 0.6),
    thermal: {
      rth: spread(rng, 11, 0.2),
      cth: spread(rng, 12, 0.2),
      ambientC: 25,
      startC: between(rng, 25, 45),
      alpha: 0.0039,
    },
    biasRad: between(rng, -0.02, 0.02),
  };
}

export const inClass = (unit: TwinUnit): TwinUnit => ({
  ...unit,
  stickRatio: 1,
  backlashRad: 0,
  stiffness: null,
  supplyOhm: 0,
  thermal: { ...unit.thermal, alpha: 0 },
  biasRad: 0,
});

export function oracleFit(unit: TwinUnit): ServoFit {
  const { fit } = presetOf(unit.family);
  const warm = 1 + unit.thermal.alpha * (unit.thermal.startC + 5 - 25);

  return {
    ...fit,
    kt: unit.kt,
    resistance: unit.resistance * warm,
    armature: unit.armature,
    friction: { ...fit.friction, base: unit.friction, loadExternal: unit.frictionLoad, viscous: unit.viscous },
    errorGainRatio: unit.gain / (fit.firmwareKp * fit.errorGain),
    maxDuty: unit.maxDuty,
    delayS: unit.delayS,
  };
}
