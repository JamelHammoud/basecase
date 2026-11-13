import type { ActuatorSpec, ServoFit } from '../data/components';

export interface ServoDynamics {
  kp: number;
  damping: number;
  armature: number;
  frictionloss: number;
  forceNm: number;
  delayS: number;
}

export function fitDynamics(fit: ServoFit, volts: number, holdingNm: number): ServoDynamics {
  const voltsPerRad = fit.firmwareKp * fit.errorGain * fit.errorGainRatio * volts;
  const torquePerVolt = fit.kt / fit.resistance;

  return {
    kp: voltsPerRad * torquePerVolt,
    damping: fit.friction.viscous + fit.kt * torquePerVolt,
    armature: fit.armature,
    frictionloss: fit.friction.base + fit.friction.loadExternal * holdingNm,
    forceNm: fit.maxDuty * volts * torquePerVolt,
    delayS: fit.delayS,
  };
}

export const measuredServos = (specs: ActuatorSpec[]): specs is Array<ActuatorSpec & { fit: ServoFit }> =>
  specs.length > 0 && specs.every((s) => !!s.fit);

export function servoDynamics(specs: ActuatorSpec[], holdingNm: number): ServoDynamics | null {
  if (!measuredServos(specs)) return null;

  const each = specs.map((s) => fitDynamics(s.fit, s.atVolts, holdingNm / specs.length));
  const total = (key: keyof Omit<ServoDynamics, 'delayS'>) => each.reduce((sum, d) => sum + d[key], 0);

  return {
    kp: total('kp'),
    damping: total('damping'),
    armature: total('armature'),
    frictionloss: total('frictionloss'),
    forceNm: total('forceNm'),
    delayS: Math.max(...each.map((d) => d.delayS)),
  };
}

export const historySamples = (delayS: number, timestep: number) => Math.ceil(delayS / timestep) + 2;
