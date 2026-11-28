import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { DEFAULT_PROJECT } from '../types/robotics';
import { encodeSceneFile, decodeSceneFile } from '../utils/sceneFile';
import { galleryBundleOf } from '../gallery/buildBundle';
import { galleryBundleBytes, readGalleryBundleBytes, bundleScene } from '../gallery/galleryBundle';
import { buildCase, builderRobot } from './caseBuilder';
import { selectedPickTargets } from './selectedPick.fixtures';
import { runCase } from './testing';
import { stageCase, stagedEffectors } from './caseCast';
import { decodeRecording, encodeRecording } from './recordingFile';
import { scoreTry, tryManifest } from './tries';
import { storedTryOf } from './tryFile';
import { encodeTryArchive, decodeTryArchive } from './tryArchiveJobs';

it('preserves force requirements, source identity and the saved verdict across scene, gallery and portable try files', async () => {
  const mj = await loadMujoco();
  const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
  const rig = buildRig(arm.joints, arm.parts);
  const built = buildCase(
    { goal: 'pick', world: 'floor', pickTarget: selectedPickTargets()[0], values: { gripForceN: 3 } },
    builderRobot(rig, arm.parts),
  );

  if (!built.ok) throw new Error(built.problem);

  const result = await runCase(mj, built.kase, arm, { controller: 'reference', record: true });
  const kase = result.case;
  const recording = result.recording!;
  const stored = storedTryOf(
    {
      id: 'force-try',
      caseId: kase.id,
      robot: arm.id,
      at: '2026-11-28T00:00:00.000Z',
      passed: result.passed,
      margin: result.margin,
      seconds: recording.frames * recording.dt,
      manifest: await tryManifest(kase, result.model, recording),
    },
    { sceneId: 'force-scene', caseName: kase.name, joints: arm.joints.map((joint) => joint.id), input: 'script' },
  );
  const archived = decodeTryArchive(encodeTryArchive([{ stored, bytes: encodeRecording(recording) }]))[0];
  const scene = {
    name: 'Force scene',
    globalGoal: '',
    annotations: [],
    parts: arm.parts,
    project: { ...DEFAULT_PROJECT, joints: arm.joints, cases: [kase] },
  };
  const reopened = await decodeSceneFile(await encodeSceneFile(scene));
  const bundle = galleryBundleOf({
    slug: 'force-scene',
    title: 'Force scene',
    robotName: arm.id,
    parts: arm.parts,
    joints: arm.joints,
    kase,
  });
  const shared = bundleScene(readGalleryBundleBytes(galleryBundleBytes(bundle)));
  const staged = stageCase(kase, { rig, parts: arm.parts }, []);
  const source = { kase, model: result.model, recording, ...stagedEffectors(staged, { rig, parts: arm.parts }) };

  expect(result.passed).toBe(true);
  expect(archived.recording.forceEvidence).toEqual(recording.forceEvidence);

  for (const restored of [reopened.project!.cases![0], shared.project!.cases![0]]) {
    expect(restored).toEqual(kase);
    expect((await scoreTry({ ...source, kase: restored, recording: archived.recording })).passed).toBe(true);
  }

  const legacy = decodeRecording(
    encodeRecording({ ...recording, forceEvidence: undefined, contactForce: undefined, contactForcePeak: undefined }),
  )!;

  expect(legacy).not.toBeNull();
  await expect(scoreTry({ ...source, recording: legacy })).rejects.toThrow();
  await expect(
    scoreTry({ ...source, model: { ...source.model, xml: source.model.xml.replace('</mujoco>', '\n</mujoco>') } }),
  ).rejects.toThrow();
});
