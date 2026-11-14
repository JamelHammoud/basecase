import type { ActuatorSpec } from '../data/components';
import { bedSizeText, fitOnBed, type Bed } from '../print/bed';
import { holdVerdict, PEAK_DERATE, ratingAt, stanceVerdict } from '../utils/actuatorRules';
import { cycloidalDesign, type CycloidalDesign } from './cycloidal';
import { cycloidalOptions, cycloidalSpec, cycloidalVariantId } from './generated';
import { BLDC_MOTORS, type BldcDriver, type BldcMotor } from './motors';

export const ADDED_MASS_MARGIN = 1.5;

export interface ActuatorNeed {
  loadNm: number;
  kind: 'stance' | 'hold';
  rmsNm?: number;
  peakNm?: number;
  volts?: number;
  bed: Bed;
}

export interface ActuatorChoice {
  motor: BldcMotor;
  driver: BldcDriver;
  ratio: number;
  variant: string;
  design: CycloidalDesign;
  spec: ActuatorSpec;
}

export type ActuatorPick = { choice: ActuatorChoice } | { problem: string };

const fitsBed = (d: CycloidalDesign, bed: Bed) => !!fitOnBed(d.housingD, d.housingD, d.housingH, bed);

function carries(spec: ActuatorSpec, need: ActuatorNeed): boolean {
  const rating = ratingAt(spec, need.volts);
  const load = need.loadNm * ADDED_MASS_MARGIN;
  const rms = need.rmsNm === undefined ? undefined : need.rmsNm * ADDED_MASS_MARGIN;
  const verdict = need.kind === 'stance' ? stanceVerdict(load, rating, rms) : holdVerdict(load, rating);
  const peakOk = need.peakNm === undefined || need.peakNm <= rating.stallNm * PEAK_DERATE;

  return verdict.status === 'pass' && peakOk;
}

function choiceOf(option: { motor: BldcMotor; driver: BldcDriver; ratio: number }): ActuatorChoice {
  const { motor, driver, ratio } = option;

  return {
    ...option,
    variant: cycloidalVariantId(ratio, driver),
    design: cycloidalDesign(ratio, motor),
    spec: cycloidalSpec(motor, driver, ratio),
  };
}

export function pickActuator(need: ActuatorNeed): ActuatorPick {
  const all = BLDC_MOTORS.flatMap(cycloidalOptions).map(choiceOf);
  const printable = all.filter((c) => fitsBed(c.design, need.bed));

  if (!printable.length) {
    const smallest = Math.min(...all.map((c) => c.design.housingD));

    return { problem: `The smallest actuator is ${smallest} mm across, too wide for a ${bedSizeText(need.bed)} bed` };
  }

  const choice = printable.find((c) => carries(c.spec, need));

  if (choice) return { choice };

  const strongest = Math.max(...printable.map((c) => c.spec.stallNm));

  return { problem: `No actuator carries ${need.loadNm.toFixed(2)} N·m: the strongest stalls at ${strongest} N·m` };
}
