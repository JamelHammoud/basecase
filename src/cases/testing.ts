import type { MainModule } from '@mujoco/mujoco';
import { rigForWorker } from '../sim/drive';
import { driveAccess } from '../sim/driveAccess';
import type { DriveCommand } from '../sim/driveTypes';
import { SimEngine } from '../sim/engine';
import { fixtureMeasures, fixtureTriangles, type FixtureRobot } from '../sim/fixtures/parts';
import { buildMjcf } from '../sim/mjcf';
import { Recorder } from '../sim/recorder';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { presetCase as builtPreset, type PresetId } from './caseBuilder';
import { stageCase, stagedEffectors } from './caseCast';
import { toCommand } from './caseDrives';
import type { MultiplyJob } from './multiply';
import { RECORD_DT, runCase as runCaseOn, type CaseRobot, type RunOptions } from './runCase';
import { parseCase as parseCaseFile, worldItem, type Case } from './schema';
import { scoreTry } from './tries';

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

export interface DrivenTry {
  job: MultiplyJob;
  passed: boolean;
}

type Script = Array<{ at: number; command: DriveCommand }>;

const referenceScript = (kase: Case): Script =>
  kase.reference.timeline.map((c) => ({ at: c.at, command: toCommand(c) })).sort((a, b) => a.at - b.at);

export async function drivenTry(
  mj: MainModule,
  robot: FixtureRobot,
  options: { kase: Case; script?: (staged: Case) => Script },
): Promise<DrivenTry> {
  const rig = buildRig(robot.joints, robot.parts);
  const scene = { rig, parts: robot.parts };
  const staged = stageCase(parseCaseFile(options.kase), scene, []);
  const world = staged.kase.world.objects.map(worldItem);
  const model = buildMjcf({ ...caseRobot(robot), rig, project: DEFAULT_PROJECT, world });
  const access = driveAccess({ rig, parts: robot.parts, model, robotKey: model.robots[0]?.key });

  if (access.kind !== 'ready') throw new Error(`${robot.id} has no scripted drive.`);

  const engine = new SimEngine(mj, model);

  engine.setController({ kind: 'drive', setup: access.setup });

  const recorder = new Recorder(engine);
  const script = (options.script ?? referenceScript)(staged.kase);

  engine.stepHook = recorder.hook;

  for (let tick = 0; tick < Math.round(staged.kase.task.seconds / RECORD_DT); tick++) {
    while (script.length && script[0].at <= tick * RECORD_DT + 1e-9) engine.command(script.shift()!.command);

    engine.step(RECORD_DT);
  }

  const source = recorder.finish();

  engine.dispose();

  const effectors = stagedEffectors(staged, scene);
  const verdict = await scoreTry({ kase: staged.kase, model, recording: source, rig, ...effectors });
  const job: MultiplyJob = { model, kase: staged.kase, source, rig: rigForWorker(rig), ...effectors };

  return { job, passed: verdict.passed };
}
