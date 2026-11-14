import type { MainModule } from '@mujoco/mujoco';
import { driveAccess } from '../sim/driveAccess';
import type { Controller } from '../sim/engine';
import { SimEngine } from '../sim/engine';
import { fixtureMeasures, fixtureTriangles, type FixtureRobot } from '../sim/fixtures/parts';
import { buildMjcf } from '../sim/mjcf';
import { Recorder } from '../sim/recorder';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { presetCase as builtPreset, type PresetId } from './caseBuilder';
import { stageCase, stagedEffectors } from './caseCast';
import { toCommand } from './caseDrives';
import { runCase as runCaseOn, type CaseRobot, type RunOptions } from './runCase';
import { parseCase as parseCaseFile, worldItem, type Case } from './schema';
import { scoreTry, tryManifest, type TryRecord, type TryScoring } from './tries';

export const parseCase = parseCaseFile;

export const caseRobot = (robot: FixtureRobot): CaseRobot => ({
  id: robot.id,
  parts: robot.parts,
  joints: robot.joints,
  measures: fixtureMeasures(robot.parts),
  partTriangles: fixtureTriangles(robot.parts),
});

export const presetCase = (robot: FixtureRobot, id: PresetId): Case =>
  builtPreset(id, buildRig(robot.joints, robot.parts), robot.parts);

export const touchTheDots = (robot: FixtureRobot): Case => presetCase(robot, 'touch-the-dots');

type FixtureRun = Omit<RunOptions, 'partners'> & { partners?: FixtureRobot[] };

export function runCase(mj: MainModule, kase: Case, robot: FixtureRobot, options: FixtureRun) {
  return runCaseOn(mj, parseCaseFile(kase), caseRobot(robot), {
    ...options,
    partners: options.partners?.map(caseRobot),
  });
}

const LIVE_FRAME_SECONDS = 1 / 60;

function liveController(robot: FixtureRobot, rig: ReturnType<typeof buildRig>, model: TryScoring['model']): Controller {
  const access = driveAccess({ rig, parts: robot.parts, model, robotKey: model.robots[0]?.key, velocity: null });

  if (access.kind !== 'ready') throw new Error(`${robot.id} can’t drive.`);

  return { kind: 'drive', setup: access.setup };
}

export async function referenceTry(mj: MainModule, kase: Case, robot: FixtureRobot) {
  const rig = buildRig(robot.joints, robot.parts);
  const staged = stageCase(kase, { rig, parts: robot.parts }, []);
  const model = buildMjcf({
    parts: robot.parts,
    rig,
    project: DEFAULT_PROJECT,
    measures: fixtureMeasures(robot.parts),
    partTriangles: fixtureTriangles(robot.parts),
    world: staged.kase.world.objects.map(worldItem),
  });
  const controller = liveController(robot, rig, model);
  const engine = new SimEngine(mj, model);
  const script = [...staged.kase.reference.timeline].sort((a, b) => a.at - b.at);

  engine.setController(controller);

  const recorder = new Recorder(engine, controller);
  const start = engine.data.time;

  engine.stepHook = recorder.hook;
  engine.commandHook = recorder.command;

  while (engine.data.time - start < staged.kase.task.seconds) {
    while (script.length && script[0].at <= engine.data.time - start + 1e-9) engine.command(toCommand(script.shift()!));

    engine.step(LIVE_FRAME_SECONDS);
  }

  const recording = recorder.finish();

  engine.dispose();

  const source: TryScoring = {
    kase: staged.kase,
    model,
    recording,
    rig,
    ...stagedEffectors(staged, { rig, parts: robot.parts }),
  };
  const verdict = await scoreTry(source);
  const record: TryRecord = {
    id: 'try-driven',
    caseId: kase.id,
    robot: robot.id,
    at: '2026-11-13T00:00:00.000Z',
    passed: verdict.passed,
    margin: verdict.margin,
    seconds: recording.frames * recording.dt,
    manifest: await tryManifest(staged.kase, model, recording),
  };

  return { source, verdict, record };
}
