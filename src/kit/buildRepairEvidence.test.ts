import { expect, it } from 'vitest';
import { calibrationApplies } from '../reality/measuredJoints';
import { FAMILY_SERVOS } from '../reality/servoPart';
import { presetServo } from '../reality/servoEstimate';
import type { ServoCalibration } from '../reality/types';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import { isStalePolicy, modelFingerprints } from '../sim/policyFreshness';
import { SIM_MODEL_VERSION } from '../sim/mjcfTypes';
import { repairKitFixture } from './buildRepair.fixtures';

it('keeps calibration identity and policy physics freshness in their existing evidence paths', async () => {
  const source = await repairKitFixture('SO-101-style arm');
  const joint = source.kit.project.joints![0];
  const actuator = joint.actuators![0];
  const calibration: ServoCalibration = {
    ...presetServo(FAMILY_SERVOS.sts3215),
    servo: FAMILY_SERVOS.sts3215,
    verdict: 'measured',
    version: 1,
    rung: 'response',
    scales: {},
    conditions: { volts: 7.4, temperatureC: 30 },
    evidence: { logs: 2, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.99, reason: '' },
  };
  const parts = source.kit.parts.map((part) => (part.id === actuator ? { ...part, componentVariant: 'c018' } : part));

  expect(calibrationApplies(calibration, joint, source.kit.parts)).toBe(true);
  expect(calibrationApplies(calibration, joint, parts)).toBe(false);

  const before = fixturePackageJob({ id: 'arm', parts: source.kit.parts, joints: source.kit.project.joints! }).job
    .model;
  const changed = source.kit.parts.map((part) =>
    joint.child.includes(part.id)
      ? { ...part, dimensions: { ...part.dimensions, width: part.dimensions.width + 2 } }
      : part,
  );
  const after = fixturePackageJob({ id: 'arm', parts: changed, joints: source.kit.project.joints! }).job.model;
  const robot = before.robots[0];

  expect(
    isStalePolicy(
      { modelVersion: SIM_MODEL_VERSION, robot: robot.key, fingerprint: robot.fingerprint },
      modelFingerprints(after),
    ),
  ).toBe(true);
});
