import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { replayDifferences } from '../../../tools/sim/contactReplayComparison.mjs';
import { nativeContactReplay } from '../../../tools/sim/nativeContactReplay.mjs';
import { buildCase, builderRobot } from '../../cases/caseBuilder';
import { scoreTry } from '../../cases/tries';
import { buildRig } from '../../utils/kinematics';
import { capturePassiveFixture } from './passiveContactReplay';
import { contactReplayRecording } from './contactReplayRecording';
import { PASSIVE_VARIANTS } from './passiveVariants';
import { fixtureRobots } from './robots';

let mj: MainModule;

const robot = fixtureRobots().find((arm) => arm.id === 'arm-6dof')!;
const rig = buildRig(robot.joints, robot.parts);
const builder = builderRobot(rig, robot.parts);

beforeAll(async () => {
  mj = await loadMujoco();
});

for (const goal of ['lid', 'drawer'] as const) {
  for (const variant of PASSIVE_VARIANTS) {
    it(`matches C and WASM ${goal} travel, stops, contacts and verdict for ${variant}`, async () => {
      const built = buildCase(
        { goal, world: 'floor', values: variant === 'short' ? { fixtureTravel: 30, fixtureMassG: 35 } : {} },
        builder,
      );

      if (!built.ok) throw new Error(built.problem);

      const replay = await capturePassiveFixture(mj, built.kase, robot, variant);
      const native = await nativeContactReplay(replay, mj.mj_versionString());
      const { drift, contactDifferences } = replayDifferences(replay, native.cases[0]);

      expect(native.version).toBe(mj.mj_versionString());
      expect(drift).toBeLessThan(1e-6);
      expect(contactDifferences).toBe(0);

      const scoring = {
        kase: replay.kase,
        model: replay.model,
        rig: buildRig(replay.joints, replay.parts),
        effector: replay.effector,
      };
      const [verdict, baseline] = await Promise.all([
        scoreTry({ ...scoring, recording: contactReplayRecording(replay, native.cases[0], replay.model) }),
        scoreTry({ ...scoring, recording: contactReplayRecording(replay, replay.expected, replay.model) }),
      ]);

      expect(verdict.passed).toBe(replay.wasmPassed);
      expect(Math.abs(verdict.margin - baseline.margin)).toBeLessThan(1e-6);
    });
  }
}
