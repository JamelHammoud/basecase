import type { ActuatorSpec, ComponentVariant } from '../data/components';
import { CYCLOIDAL_RATIOS } from './cycloidal';
import { BLDC_DRIVERS, driverByShort, motorById, torqueConstant, type BldcDriver, type BldcMotor } from './motors';

export const REDUCER_EFFICIENCY = 0.9;
export const SUPPLY_VOLTS = 24;

const VARIANT = /^cycloidal-(\d+)-([\w-]+)$/;

const r2 = (v: number) => Math.round(v * 100) / 100;

export const cycloidalVariantId = (ratio: number, driver: Pick<BldcDriver, 'short'>) =>
  `cycloidal-${ratio}-${driver.short}`;

export function cycloidalSpec(motor: BldcMotor, driver: BldcDriver, ratio: number): ActuatorSpec {
  const gain = torqueConstant(motor) * ratio * REDUCER_EFFICIENCY;
  const peakA = Math.min(motor.peakA, driver.peakA);
  const ratedA = Math.min(motor.ratedA, driver.ratedA);
  const stallNm = r2(gain * peakA);
  const ratedNm = r2(gain * ratedA);
  const volts: [number, number] = [driver.volts[0], Math.min(motor.maxV, driver.volts[1])];
  const rpmAt = (v: number) => Math.round((motor.kv * v) / ratio);

  return {
    stallNm,
    ratedNm,
    volts,
    atVolts: SUPPLY_VOLTS,
    rpm: rpmAt(SUPPLY_VOLTS),
    curve: volts.map((v) => ({ volts: v, stallNm, ratedNm, rpm: rpmAt(v) })),
    peak: true,
    stallA: peakA,
    ratedA,
    armature: Number((motor.rotorKgM2 * ratio * ratio).toPrecision(4)),
    source: `Estimate: Kt ${r2(torqueConstant(motor) * 1000) / 1000} N·m/A × ${peakA} A peak, ${ratedA} A rated × ${ratio}:1 × ${REDUCER_EFFICIENCY} efficiency; rotor inertia ${motor.rotorKgM2} kg·m² × ${ratio}²`,
  };
}

export function cycloidalVariant(componentId: string, variantId: string): ComponentVariant | undefined {
  const motor = motorById(componentId);
  const m = VARIANT.exec(variantId);
  const driver = m ? driverByShort(m[2]) : undefined;
  const ratio = Number(m?.[1]);

  if (!motor || !driver || !CYCLOIDAL_RATIOS.includes(ratio)) return undefined;

  return {
    id: variantId,
    label: `${ratio}:1 cycloidal`,
    mpn: `${motor.short} ${ratio}:1 cycloidal on a ${driver.short}`,
    actuator: cycloidalSpec(motor, driver, ratio),
  };
}

export const cycloidalOptions = (motor: BldcMotor) =>
  CYCLOIDAL_RATIOS.flatMap((ratio) => BLDC_DRIVERS.map((driver) => ({ motor, driver, ratio })));
