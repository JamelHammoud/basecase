import { expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../../utils/sceneFile';
import { docFromParts, pushHistory, trackedOf, travelProject } from '../../workspace/docHistory';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { buildRig } from '../../utils/kinematics';
import { buildCase, builderRobot } from '../caseBuilder';
import { caseRobot } from '../testing';
import { placementIdentity, retainPlacement } from './retention';

it('undoes and redoes per-unit placement without editing the authored Case and preserves it in a scene file', async () => {
  const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
  const made = buildCase({ goal: 'drawer', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

  if (!made.ok) throw new Error(made.problem);

  const project = { ...DEFAULT_PROJECT, joints: arm.joints, cases: [made.kase] };
  const identity = placementIdentity({
    unit: 'bench-a',
    kase: made.kase,
    robot: caseRobot(arm),
    pose: { position: [10, 20, 30], yawDeg: 15 },
  });
  const record = retainPlacement(identity, { passed: true, margin: 1, failed: [] });
  const changed = { ...project, workbenchPlacements: [record] };
  const history = pushHistory(docFromParts(arm.parts), arm.parts, trackedOf(project));
  const undo = travelProject(history, changed, { direction: 'undo' })!;
  const redo = travelProject(undo.doc, undo.project, { direction: 'redo' })!;

  expect(undo.project.workbenchPlacements).toBeUndefined();
  expect(redo.project.workbenchPlacements).toEqual([record]);
  expect(redo.project.cases).toEqual(project.cases);

  const opened = await decodeSceneFile(
    await encodeSceneFile(sharedScene({ name: 'Workbench', globalGoal: '', parts: arm.parts, project: redo.project })),
  );

  expect(opened.project!.workbenchPlacements).toEqual([record]);
  expect(opened.project!.cases).toEqual(project.cases);
});
