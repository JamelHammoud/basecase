import { COMPONENT_BY_ID, type ActuatorSpec } from '../data/components';
import { ACTUATOR_MOTORS, cycloidalSpec, ratioLabel } from '../data/generatedActuators';
import type { FindingFix } from '../utils/engineeringTypes';
import { HEAT_LIMITS, STANCE_LIMITS } from '../utils/actuatorRules';
import { PEAK_LIMITS } from '../utils/peakTorque';
import { lengthLabel } from '../utils/size';
import { torque } from '../utils/torque';
import { footprint, PIN_COUNTS, sizedDesign, type CycloidalDesign } from './cycloidal';

export const MIN_OUTPUT_RPM = 60;

export type ActuatorLoads = Extract<FindingFix, { kind: 'make-actuator' }>['loads'];

export interface BedSize {
  name: string;
  width: number;
  depth: number;
  height: number;
}

export type ActuatorPick = { design: CycloidalDesign; spec: ActuatorSpec } | { refusal: string };

export function requiredNm(loads: ActuatorLoads): { stallNm: number; ratedNm: number } {
  return {
    stallNm: Math.max(loads.loadNm / STANCE_LIMITS.pass, (loads.peakNm ?? 0) / PEAK_LIMITS.pass),
    ratedNm: loads.rmsNm / HEAT_LIMITS.pass,
  };
}

const motorsBySize = () =>
  Object.entries(ACTUATOR_MOTORS)
    .sort(([, a], [, b]) => a.body.d ** 2 * a.body.length - b.body.d ** 2 * b.body.length)
    .map(([id]) => id);

const fitsBed = (d: CycloidalDesign, bed: BedSize) => {
  const f = footprint(d);

  return f.width <= Math.min(bed.width, bed.depth) && f.height <= bed.height;
};

interface Candidate {
  design: CycloidalDesign;
  spec: ActuatorSpec;
}

function candidates(): Candidate[] {
  return motorsBySize().flatMap((motor) =>
    PIN_COUNTS.flatMap((pins) => {
      const spec = cycloidalSpec(motor, pins)!;

      return spec.rpm! >= MIN_OUTPUT_RPM ? [{ design: sizedDesign(motor, pins, spec.stallNm), spec }] : [];
    }),
  );
}

const name = (c: Candidate) =>
  `${ratioLabel(c.design.pins)} ${COMPONENT_BY_ID[c.design.motor]?.name ?? c.design.motor}`;

function refusal(all: Candidate[], strong: Candidate[], need: { stallNm: number }, bed: BedSize): string {
  if (strong.length) {
    const f = footprint(strong[0].design);

    return `needs an actuator ${lengthLabel(f.width)} across, bigger than the ${bed.name} bed.`;
  }

  const best = all[all.length - 1];

  return `needs ${torque(need.stallNm)} of stall, more than a ${name(best)} gives (${torque(best.spec.stallNm)}).`;
}

export function pickActuator(loads: ActuatorLoads, bed: BedSize): ActuatorPick {
  const need = requiredNm(loads);
  const all = candidates();
  const strong = all.filter((c) => c.spec.stallNm >= need.stallNm && c.spec.ratedNm! >= need.ratedNm);
  const fitting = strong.find((c) => fitsBed(c.design, bed));

  return fitting ?? { refusal: refusal(all, strong, need, bed) };
}
