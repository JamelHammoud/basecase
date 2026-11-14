import path from 'node:path';
import { calibratedInput } from '../../src/reality/calibratedInput';
import { SERVO_POPULATIONS } from '../../src/reality/servoPopulations';
import { fixtureMeasures, fixtureTriangles } from '../../src/sim/fixtures/parts';
import { withServos } from '../../src/sim/fixtures/servoLegs';
import { buildMjcf } from '../../src/sim/mjcf';
import type { MjcfInput, SimModel } from '../../src/sim/mjcfTypes';
import { DEFAULT_PROJECT } from '../../src/types/robotics';
import { buildRig } from '../../src/utils/kinematics';
import { seededRng } from '../zoo/rng';
import { drawUnit, oracleFit, type TwinUnit } from '../twin/units';

export const POPULATION_OUT = path.resolve('verify/out/population');
export const TWINS = 8;

const quad = withServos('quad-servo', { componentId: 'feetech-sts3215', variant: 'c001' });

export const quadInput = (): MjcfInput => ({
  parts: quad.parts,
  rig: buildRig(quad.joints, quad.parts),
  project: { ...DEFAULT_PROJECT, joints: quad.joints },
  measures: fixtureMeasures(quad.parts),
  partTriangles: fixtureTriangles(quad.parts),
});

export const populationQuad = (): SimModel => buildMjcf(calibratedInput(quadInput(), {}, SERVO_POPULATIONS));

export function uniformQuad(): SimModel {
  const model = populationQuad();

  delete model.servoSpreads;

  return model;
}

export const heldOutTwins = (seed: string): TwinUnit[] =>
  Array.from({ length: TWINS }, (_, i) => drawUnit(seededRng(seed, 'sts3215', 'stand', String(i)), 'sts3215'));

export function twinQuad(unit: TwinUnit): SimModel {
  const fit = oracleFit(unit);

  return buildMjcf({
    ...quadInput(),
    servoFits: Object.fromEntries(quad.joints.map((j) => [j.id, { fit, volts: unit.volts }])),
  });
}
