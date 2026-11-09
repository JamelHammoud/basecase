import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { builderRobot, buildCase } from '../../src/cases/caseBuilder';
import type { Case } from '../../src/cases/schema';
import { parseCase, touchTheDots } from '../../src/cases/testing';
import { buildRig } from '../../src/utils/kinematics';
import { GATE_ARM_SEED, gateArmShape, judgePlay, playRobot, roundTrip } from './play';

const ARMS = ['arm-3dof', 'arm-6dof', 'gate-arm-5dof'];

function authoredOnSixJoints(): Case {
  return roundTrip(parseCase(roundTrip(touchTheDots(playRobot('arm-6dof')))));
}

function authoredOnGateArm(): Case {
  const arm = playRobot('gate-arm-5dof');
  const made = buildCase({ goal: 'touch', world: 'shelf' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

  if (!made.ok) throw new Error(`The Case builder refused the gate arm (seed ${GATE_ARM_SEED}): ${made.problem}`);

  return roundTrip(parseCase(roundTrip(made.kase)));
}

const AUTHORED: Array<[string, () => Case]> = [
  ['Touch the Dots written once on arm-6dof', authoredOnSixJoints],
  ['a Touch Case on a Shelf written once on the gate arm', authoredOnGateArm],
];

describe('one Case file runs on different arms', () => {
  for (const [name, author] of AUTHORED) {
    for (const arm of ARMS) {
      it(`${name} runs on ${arm}: limp fails, reference passes, repeats match, file unchanged`, async () => {
        const mj = await loadMujoco();
        const kase = author();
        const frozen = JSON.stringify(kase);

        expect(
          await judgePlay(mj, kase, playRobot(arm)),
          `gate arm seed ${GATE_ARM_SEED}: ${JSON.stringify(gateArmShape())}`,
        ).toEqual([]);
        expect(JSON.stringify(kase)).toBe(frozen);
      }, 300_000);
    }
  }
});
