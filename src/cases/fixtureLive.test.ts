import loadMujoco from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { Recorder } from '../sim/recorder';
import { commandTimeline, stepScriptedCase } from '../sim/simRun';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import { liveController, runCase } from './testing';
import { LiveCase } from './liveCase';
import { toCommand } from './caseDrives';
import { scoreTry } from './tries';
import { robotFacts } from './robotFit';

const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
const rig = buildRig(arm.joints, arm.parts);
let result: Awaited<ReturnType<typeof runCase>>;
let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();

  const made = buildCase({ goal: 'chest', world: 'floor' }, builderRobot(rig, arm.parts));

  if (!made.ok) throw new Error(made.problem);

  result = await runCase(mj, made.kase, arm, { controller: 'reference' });
  expect(result.passed).toBe(true);
});

it.each([0.02, 0.08, 0.3])(
  'keeps the contact-driven live chore passing with %s-second rendering batches',
  async (batch) => {
    const controller = liveController(arm, rig, result.model);
    const engine = new SimEngine(mj, result.model);
    const live = await LiveCase.start(
      engine,
      { kase: result.case, plan: null, joints: arm.joints, kit: null },
      () => controller,
    );
    const script = {
      start: engine.data.time,
      commands: commandTimeline(
        engine,
        result.case.reference.timeline.map((command) => ({ at: command.at, command: toCommand(command, 0) })),
      ),
    };
    const recorder = new Recorder(engine, controller);

    engine.setController(controller);
    engine.stepHook = recorder.hook;
    engine.commandHook = recorder.command;

    try {
      while (engine.data.time < result.case.task.seconds) stepScriptedCase(engine, live, script, batch);

      const verdict = await scoreTry({
        kase: result.case,
        model: result.model,
        recording: recorder.finish(),
        rig,
        effector: robotFacts(rig, arm.parts).endEffector,
      });

      expect(verdict.passed).toBe(true);
    } finally {
      engine.dispose();
    }
  },
);
