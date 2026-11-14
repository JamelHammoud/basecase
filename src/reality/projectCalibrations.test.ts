import { describe, expect, it } from 'vitest';
import { DEFAULT_UNIT } from '../../electron/robot/units.mjs';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import { activeCalibration } from './history';
import { unitHistories, withCalibration, withRollBack } from './projectCalibrations';
import { presetServo } from './servoEstimate';
import { scaledFit } from './servoParams';
import { FAMILY_SERVOS } from './servoPart';
import type { ServoCalibration } from './types';

const preset = presetServo(FAMILY_SERVOS.sts3215);

const measured = (gain: number): ServoCalibration => ({
  verdict: 'measured',
  servo: FAMILY_SERVOS.sts3215,
  version: 1,
  rung: 'response',
  fit: scaledFit(preset.fit, { gain: Math.log(gain) }),
  volts: preset.volts,
  scales: { gain },
  conditions: { volts: preset.volts, temperatureC: 25 },
  evidence: { logs: 6, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.9, reason: '' },
});

const gainOf = (project: ProjectSettings, unit: string) => {
  const history = unitHistories(project, unit).arm0;

  return history ? (activeCalibration(history)?.scales.gain ?? null) : null;
};

describe('calibrations per unit', () => {
  it('keeps the scene’s own robot on servoCalibrations', () => {
    const project = withCalibration(DEFAULT_PROJECT, 'arm0', measured(0.9));

    expect(project.servoCalibrations?.arm0.versions).toHaveLength(1);
    expect(project.unitCalibrations).toBeUndefined();
    expect(unitHistories(project, DEFAULT_UNIT)).toBe(project.servoCalibrations);
    expect(unitHistories(project)).toBe(project.servoCalibrations);
  });

  it('records on one unit and leaves the others and the scene’s own untouched', () => {
    const own = withCalibration(DEFAULT_PROJECT, 'arm0', measured(0.9));
    const one = withCalibration(own, 'arm0', measured(0.5), 'arm-1');
    const two = withCalibration(one, 'arm0', measured(0.7), 'arm-2');

    expect(one.servoCalibrations).toBe(own.servoCalibrations);
    expect(gainOf(two, DEFAULT_UNIT)).toBeCloseTo(0.9, 9);
    expect(gainOf(two, 'arm-1')).toBeCloseTo(0.5, 9);
    expect(gainOf(two, 'arm-2')).toBeCloseTo(0.7, 9);
    expect(unitHistories(two, 'arm-3')).toEqual({});
  });

  it('rolls back one unit and leaves the others', () => {
    let project = withCalibration(DEFAULT_PROJECT, 'arm0', measured(0.9));

    for (const unit of ['arm-1', 'arm-2']) {
      project = withCalibration(project, 'arm0', measured(0.6), unit);
      project = withCalibration(project, 'arm0', measured(0.4), unit);
    }

    const rolled = withRollBack(project, 'arm0', 'arm-1');

    expect(gainOf(rolled, 'arm-1')).toBeCloseTo(0.6, 9);
    expect(gainOf(rolled, 'arm-2')).toBeCloseTo(0.4, 9);
    expect(gainOf(rolled, DEFAULT_UNIT)).toBeCloseTo(0.9, 9);
    expect(rolled.unitCalibrations?.['arm-2']).toBe(project.unitCalibrations?.['arm-2']);
  });
});
