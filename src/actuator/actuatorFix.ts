import { resolvePrinter } from '../data/printers';
import { bedOf, type Bed } from '../print/bed';
import type { ProjectSettings } from '../types/robotics';
import type { FindingFix, JointLoad, WalkSim } from '../utils/engineeringTypes';
import { cycloidalDesign } from './cycloidal';
import { cycloidalSpec, cycloidalVariantId } from './generated';
import { driverByShort, motorById } from './motors';
import { pickActuator, type ActuatorChoice, type ActuatorPick } from './pickActuator';

export type ActuatorFix = Extract<FindingFix, { kind: 'make-actuator' }>;

export const sceneBed = (project: Pick<ProjectSettings, 'printer'>, bed?: Bed): Bed =>
  bed ?? bedOf(resolvePrinter(project.printer, []).model);

export function actuatorFor(load: JointLoad, bed: Bed, walk?: WalkSim | string): ActuatorPick {
  const peakNm = typeof walk === 'object' ? walk.joints[load.joint.id]?.p99Nm : undefined;

  return pickActuator({
    loadNm: load.loadNm,
    kind: load.kind,
    rmsNm: load.simRmsNm,
    peakNm,
    volts: load.volts,
    bed,
  });
}

export const fixOf = (joint: string, c: ActuatorChoice): ActuatorFix => ({
  kind: 'make-actuator',
  joint,
  motor: c.motor.componentId,
  driver: c.driver.short,
  ratio: c.ratio,
});

export function choiceOf(fix: Omit<ActuatorFix, 'kind' | 'joint'>): ActuatorChoice | null {
  const motor = motorById(fix.motor);
  const driver = driverByShort(fix.driver);

  if (!motor || !driver) return null;

  return {
    motor,
    driver,
    ratio: fix.ratio,
    variant: cycloidalVariantId(fix.ratio, driver),
    design: cycloidalDesign(fix.ratio, motor),
    spec: cycloidalSpec(motor, driver, fix.ratio),
  };
}

export interface TorqueOffer {
  fix?: ActuatorFix;
  why?: string;
}

export function torqueOffer(load: JointLoad, bed: Bed, walk?: WalkSim | string): TorqueOffer {
  if (load.status !== 'fail' || !load.joint.actuators?.length) return {};

  const pick = actuatorFor(load, bed, walk);

  return 'choice' in pick ? { fix: fixOf(load.joint.id, pick.choice) } : { why: pick.problem };
}
