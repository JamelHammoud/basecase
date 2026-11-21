import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fixtureRobots } from '../../src/sim/fixtures/robots';
import { builderRobot, buildCase } from '../../src/cases/caseBuilder';
import { buildRig } from '../../src/utils/kinematics';
import { DEFAULT_PROJECT } from '../../src/types/robotics';
import { encodeSceneFile } from '../../src/utils/sceneFile';

export const invokeEvaluation = (...args) =>
  new Promise((resolve) => {
    execFile(
      process.execPath,
      [path.resolve('tools/cli/basecase.mjs'), 'evaluation', ...args],
      { maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }),
    );
  });

export async function evaluationFixture(dir) {
  const robot = fixtureRobots().find((r) => r.id === 'rover-diff');
  const made = buildCase(
    { goal: 'reach', world: 'floor' },
    builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
  );

  if (!made.ok) throw new Error(made.problem);

  const scene = (strength) => ({
    name: 'Rover',
    globalGoal: '',
    parts: robot.parts,
    annotations: [],
    project: {
      ...DEFAULT_PROJECT,
      joints: robot.joints.map((j) => ({ ...j, effortNm: 0.25 * strength })),
      cases: [made.kase],
    },
  });
  const baseline = path.join(dir, 'baseline.basecase');
  const candidate = path.join(dir, 'candidate.basecase');
  const weakScene = scene(0.3);

  fs.writeFileSync(baseline, await encodeSceneFile(scene(1)));
  fs.writeFileSync(candidate, await encodeSceneFile(weakScene));

  return {
    baseline,
    candidate,
    package: path.join(dir, 'frozen'),
    output: path.join(dir, 'results'),
    weakScene,
    kase: made.kase,
  };
}
