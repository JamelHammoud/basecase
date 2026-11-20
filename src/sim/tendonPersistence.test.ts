import { expect, it } from 'vitest';
import { tendonMechanism } from './fixtures/tendonMechanisms';
import { capturedJoints, placedJoints } from '../utils/libraryJoints';
import { uniqueJointIds, buildRig } from '../utils/kinematics';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';
import { withTendons } from '../joints/tendons';
import { docFromParts, pushHistory, trackedOf, travelProject } from '../workspace/docHistory';
import { declareJoints } from '../workspace/agentBuildRequests';
import { getRig } from '../agent/agentPose';
import { box } from './fixtures/parts';

it('preserves tendon identity through scene bytes, Library placement and repeated joint IDs', async () => {
  const { input } = tendonMechanism();
  const scene = sharedScene({ name: 'Remote elbow', globalGoal: '', parts: input.parts, project: input.project });
  const reopened = await decodeSceneFile(await encodeSceneFile(scene));

  expect(reopened.project?.joints).toEqual(input.project.joints);

  const captured = capturedJoints(input.project.joints, input.parts, [0, 0, 0]);
  const ids = new Map(input.parts.map((p) => [`node-${p.id}`, `copy-${p.id}`]));
  let serial = 0;
  const placed = placedJoints(captured, ids, [0, 0, 0], (id = '') => `${id}-${serial++}`);
  const motor = placed.find((j) => j.tendon)!;

  expect(motor.tendon!.terms[0].joint).toBe(placed.find((j) => j.actuation === 'passive')!.id);
  expect(motor.tendon).not.toBe(captured.find((j) => j.tendon)!.tendon);

  const repeated = uniqueJointIds([...input.project.joints, ...input.project.joints]);

  expect(repeated.find((j) => j.id === 'motor_0_2')!.tendon!.terms[0].joint).toBe('output_0_2');
  expect(() =>
    capturedJoints(
      input.project.joints,
      input.parts.filter((p) => p.id !== 'link_0'),
      [0, 0, 0],
    ),
  ).toThrow(/complete assembly/i);
});

it('refuses partial tendon geometry even when the selection includes no complete joint', () => {
  const { input } = tendonMechanism();

  for (const id of ['link_0', 'spool_0', 'servo_0', 'base']) {
    const selected = input.parts.filter((part) => part.id === id);

    expect(() => capturedJoints(input.project.joints, selected, [0, 0, 0])).toThrow(/complete assembly/i);
  }

  expect(capturedJoints(input.project.joints, [box('unrelated', [0, 0, 0], [10, 10, 10], 10)], [0, 0, 0])).toEqual([]);
});

it('uses one atomic transaction for agent declarations and the joint undo history', () => {
  const { input } = tendonMechanism();
  const before = withTendons(input.project, input.parts, [{ motor: 'motor_0', tendon: null }]);
  const motor = input.project.joints.find((j) => j.id === 'motor_0')!;
  const result = declareJoints(
    { joints: [{ ...motor, origin: [0, 0, 0], axis: [0, 0, 1] }] },
    input.parts,
    before,
    () => null,
  );

  expect(result.next.joints.find((j) => j.id === motor.id)!.tendon).toEqual(motor.tendon);

  const doc = pushHistory(docFromParts(input.parts), input.parts, trackedOf(before));
  const undo = travelProject(doc, result.next, { direction: 'undo' })!;
  const redo = travelProject(undo.doc, { ...result.next, ...undo.project }, { direction: 'redo' })!;

  expect(undo.project.joints).toEqual(before.joints);
  expect(redo.project.joints).toEqual(result.next.joints);
  expect(() =>
    declareJoints(
      {
        joints: [{ ...motor, tendon: { ...motor.tendon!, terms: [{ ...motor.tendon!.terms[0], joint: 'missing' }] } }],
      },
      input.parts,
      before,
      () => null,
    ),
  ).toThrow(/tendon/i);
  expect(buildRig(before.joints!, input.parts).byId.get('motor_0')!.tendon).toBeUndefined();
});

it('reports authored motor coefficients through the existing agent rig readout', () => {
  const { input } = tendonMechanism();
  const reply = getRig({
    parts: input.parts,
    project: input.project,
    viewport: null,
    selectedIds: [],
    setPose: () => {},
    savePose: () => {},
    addAnimation: (animation) => animation,
    play: () => {},
  });
  const declaration = input.project.joints.find((joint) => joint.tendon)!.tendon!;

  expect(reply.text).toContain(`motor_0: ideal tendon ${JSON.stringify(declaration)}`);
});
