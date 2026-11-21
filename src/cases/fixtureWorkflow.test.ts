import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { DEFAULT_PROJECT } from '../types/robotics';
import { sharedScene, encodeSceneFile, decodeSceneFile } from '../utils/sceneFile';
import { galleryBundleOf } from '../gallery/buildBundle';
import { galleryBundleBytes, readGalleryBundleBytes } from '../gallery/galleryBundle';
import { episodeData, datasetJoints } from '../datasets/episodes';
import { buildCase, builderRobot } from './caseBuilder';
import { captureCaseFixture } from './fixtureAssembly';
import { projectFingerprint } from '../workspace/runReadiness';
import { resolvePrinter } from '../data/printers';
import { fixtureCaptureHandlers } from './fixtureCaptureHandlers';
import { fixtureScene } from './fixtureScenes.fixtures';
import { decodeRecording, encodeRecording } from './recordingFile';
import { scoreTry, tryManifest } from './tries';
import { robotFacts } from './robotFit';
import { runCase } from './testing';

it.each(['scene', 'gallery'] as const)(
  'keeps a reused chest chore physical through %s, recorded scoring and dataset extraction',
  async (format) => {
    const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
    const rig = buildRig(arm.joints, arm.parts);
    const builder = builderRobot(rig, arm.parts);
    const base = buildCase({ goal: 'chest', world: 'floor' }, builder);

    if (!base.ok) throw new Error(base.problem);

    const fixture = await captureCaseFixture(fixtureScene(base.kase, 'Chest'));
    const { result: made } = fixtureCaptureHandlers.build(
      structuredClone({
        spec: { goal: 'chest', world: 'floor', fixture, values: { fixtureWidthMm: 100 } },
        robot: builder,
      }),
    );

    if (!made.ok) throw new Error(made.problem);

    const scene = await decodeSceneFile(
      await encodeSceneFile(
        sharedScene({
          name: 'Chest',
          globalGoal: '',
          parts: arm.parts,
          project: { ...DEFAULT_PROJECT, joints: arm.joints, cases: [made.kase] },
        }),
      ),
    );
    const bundle = readGalleryBundleBytes(
      galleryBundleBytes(
        galleryBundleOf({
          slug: 'chest',
          title: 'Chest',
          robotName: arm.id,
          parts: arm.parts,
          joints: arm.joints,
          kase: made.kase,
        }),
      ),
    );
    const mj = await loadMujoco();
    const kase = format === 'scene' ? scene.project!.cases![0] : bundle.case;

    expect(kase.world).toEqual(made.kase.world);

    const original = await runCase(mj, kase, arm, { controller: 'reference', record: true });

    expect(original.passed).toBe(true);

    const recording = decodeRecording(encodeRecording(original.recording!))!;
    const verdict = await scoreTry({
      kase: original.case,
      model: original.model,
      recording,
      rig,
      effector: robotFacts(rig, arm.parts).endEffector,
    });
    const episode = episodeData(recording, original.model, made.kase.brief);
    const width = datasetJoints(original.model).joints.length;

    expect(verdict.passed).toBe(true);
    expect(episode.frames.length).toBeGreaterThan(100);
    expect(episode.action).toHaveLength(episode.frames.length * width);
    expect(episode.state.every(Number.isFinite)).toBe(true);
    expect(episode.action.every(Number.isFinite)).toBe(true);
    expect(recording.nq).toBeGreaterThan(recording.nu);

    const before = await tryManifest(made.kase, original.model, recording);
    const edited = structuredClone(made.kase);

    edited.world.objects.find((object) => object.joint)!.joint!.frictionloss *= 2;
    expect((await tryManifest(edited, original.model, recording)).caseHash).not.toBe(before.caseHash);

    const fingerprint = (kase: typeof made.kase) =>
      projectFingerprint(
        arm.parts,
        { ...DEFAULT_PROJECT, joints: arm.joints, cases: [kase] },
        resolvePrinter('default', []),
        { purchases: {}, money: { code: 'USD', ratesDate: '2026-11-16' } },
      );

    expect(fingerprint(edited)).not.toBe(fingerprint(made.kase));
  },
);
