import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { bodyFixture, recordedBodyRun } from './bodyFit.fixtures';
import { fitBody } from './fitBody';
import { applyBodyFit } from './bodyModel';
import { replayBody } from './bodyReplay';
import { emptyBodyFit } from './bodyParameters';
import type { RobotRun } from '../robot/runBuffer';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

it('fits planted parameters with a separately declared validation trajectory and preserves the observations', async () => {
  const { model, robot, forearm, wrist } = bodyFixture();
  const truth = { massScales: { [forearm]: 1.3 }, payloadKg: { [wrist]: 0.15 }, floorFrictionScale: 1 };
  const planted = applyBodyFit(model, robot, truth);
  const validation: RobotRun = {
    joints: model.joints.map((joint) => joint.id),
    faultJoint: null,
    faultAt: 0,
    message: '',
    intents: Array.from({ length: 73 }, (_, frame) => ({
      at: frame * 50,
      joints: model.joints.map(
        (_, joint) => 0.45 * Math.sin(frame * 0.05 * (1.7 + joint)) + 0.12 * Math.sin(frame * 0.05 * 5.1),
      ),
    })),
    statuses: Array.from({ length: 73 }, (_, frame) => ({ at: frame * 50, positions: model.joints.map(() => 0) })),
  };
  const observed = replayBody({ mj, model: planted, robot, run: validation }, emptyBodyFit());

  validation.statuses = validation.statuses.map((status, frame) => ({ ...status, positions: observed[frame] }));

  const run = recordedBodyRun(mj, planted);
  const before = structuredClone({ run, validation });
  const fitted = await fitBody({ mj, model, robot, run, validation });

  expect(fitted.verdict, JSON.stringify(fitted)).toBe('measured');
  expect(fitted.evidence.gain).toBeGreaterThanOrEqual(0.25);
  expect(fitted.fit.payloadKg[wrist]).toBeCloseTo(0.15, 1);
  expect(Math.abs(fitted.fit.massScales[forearm] / 1.3 - 1)).toBeLessThan(0.15);
  expect({ run, validation }).toEqual(before);
  expect((await fitBody({ mj, model, robot, run, validation: run })).verdict).toBe('cant-tell');

  const shifted = {
    ...run,
    intents: run.intents.map((intent) => ({ ...intent, at: intent.at + 10000 })),
    statuses: run.statuses.map((status) => ({ ...status, at: status.at + 10000 })),
  };

  expect((await fitBody({ mj, model, robot, run, validation: shifted })).verdict).toBe('cant-tell');
  expect(
    (await fitBody({ mj, model, robot, run: { ...run, observations: 'servo-independent-1' }, validation })).verdict,
  ).toBe('cant-tell');
});
