import { embeddedTargetParts, fingerPhysics, fingerTargetFixture } from './physics.fixtures';
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RenderedCad } from '../utils/platform/types';
import { fingerFixtures } from './fixtures';
import { generateFingers } from './generate';
import { selectedPickTargets } from '../cases/selectedPick.fixtures';
import { buildRig } from '../utils/kinematics';
import { builderRobot, buildCase } from '../cases/caseBuilder';
import { runCase } from '../cases/runCase';
import { DEFAULT_PROJECT } from '../types/robotics';
import { decodeRecording, encodeRecording } from '../cases/recordingFile';
import { scoreTry, trySignals, tryManifest } from '../cases/tries';
import { stageCase, stagedEffectors } from '../cases/caseCast';
import { replayTry } from '../cases/tryReplay';
import { fingerCollisionPieces } from './collision';
import type { FixtureRobot } from '../sim/fixtures/parts';
import { frameContacts } from '../sim/recorder';
import { decodeSceneFile, encodeSceneFile } from '../utils/sceneFile';
import { galleryBundleOf } from '../gallery/buildBundle';
import { galleryBundleBytes, readGalleryBundleBytes } from '../gallery/galleryBundle';

interface Kernel {
  renderPart: (language: string, code: string) => Promise<RenderedCad>;
  stopKernels: () => void;
}

const load = (name: string) => import(/* @vite-ignore */ name);
const { createNodeKernel } = await load(new URL('../../electron/cad-kernel/nodeHost/client.mjs', import.meta.url).href);
const kernel: Kernel = createNodeKernel();
const compile = (code: string) => kernel.renderPart('openscad', code);
let mj: MainModule;
let standard: FixtureRobot;
let alternate: FixtureRobot;

beforeAll(async () => {
  mj = await loadMujoco();
  standard = await fingerFixtures(compile);
  alternate = await fingerFixtures(compile, { height: 28, depth: 24, spacing: 14 }, 21);
});
afterAll(() => kernel.stopKernels());

const cases = selectedPickTargets().flatMap((target, index) =>
  (['flat', 'v'] as const).map((style) => ({ target, style, index, name: `${target.id}-${style}` })),
);

function firstContact(run: Awaited<ReturnType<typeof runCase>>, target: string) {
  const body = run.model.bodies.findIndex((item) => item.world?.includes(target));

  for (let frame = 0; frame < run.recording!.frames; frame++) {
    const pairs = frameContacts(run.recording!, frame);

    for (let index = 0; index < pairs.length; index += 2) {
      const other = pairs[index] === body ? pairs[index + 1] : -1;
      const reverse = pairs[index + 1] === body ? pairs[index] : -1;
      const contact = run.model.bodies[Math.max(other, reverse)];

      if (contact?.robot) return { at: frame * run.recording!.dt, joint: contact.joint, name: contact.name };
    }
  }

  return null;
}

describe('replacement-finger production pipeline', () => {
  it.each(cases)(
    '$name retains geometry, simulated grasp evidence and archive identity',
    async ({ target, style, index }) => {
      const fixture = fingerTargetFixture(index % 2 ? alternate : standard, target, index % 3 === 0 ? 30 : 0);
      const result = await generateFingers({ ...fixture, target: target.id, style }, { compile, current: () => true });
      const modelParts = embeddedTargetParts(result.parts, target.id);
      const physics = fingerPhysics(modelParts);
      const rig = buildRig(result.joints, result.parts);
      const built = buildCase(
        { goal: 'pick', world: 'floor', pickTarget: fixture.target },
        builderRobot(rig, result.parts),
      );

      if (!built.ok) throw new Error(built.problem);

      const targetSnapshot = structuredClone(
        built.kase.world.objects.find((object) => object.id === target.id)!.geometry,
      );
      const started = performance.now();
      const run = await runCase(
        mj,
        built.kase,
        { id: 'fingers', parts: modelParts, joints: result.joints, ...physics },
        { controller: 'reference', record: true },
      );
      const executionMs = performance.now() - started;
      const recording = decodeRecording(encodeRecording(run.recording!))!;
      const staged = stageCase(run.case, { rig, parts: result.parts }, []);
      const source = {
        kase: run.case,
        model: run.model,
        recording,
        ...stagedEffectors(staged, { rig, parts: result.parts }),
      };
      const trace = trySignals(source);
      const fingers = result.parts.filter((part) => part.gripperFinger?.role === 'finger');
      const pieces = fingers.map((part) => fingerCollisionPieces(part)!.length);
      const targetBodies = run.model.bodies.filter(
        (body) => body.parts.includes(target.id) || body.world?.includes(target.id),
      );

      process.stdout.write(
        `finger-matrix ${JSON.stringify({ name: `${target.id}-${style}`, preparationMs: result.metrics.preparationMs, executionMs, pieces, frames: recording.frames, passed: run.passed, firstContact: firstContact(run, target.id), targetBodies: targetBodies.length, targetGeom: run.passed ? undefined : run.model.xml.split('\n').find((line) => line.includes(`name="wg_${target.id.replaceAll('-', '_')}"`)), gripFrames: trace.signals.grip.filter(Boolean).length, liftMm: Math.max(...trace.signals.lift) - trace.signals.lift[0], finalSpotMm: trace.signals.spot.at(-1) })}\n`,
      );
      expect(targetBodies).toHaveLength(1);
      expect(targetBodies[0].world).toEqual([target.id]);
      expect(run.case.world.objects.find((object) => object.id === target.id)!.geometry).toEqual(targetSnapshot);
      expect(run.passed, JSON.stringify({ margin: run.margin, failed: run.failed })).toBe(true);
      expect((await scoreTry(source)).passed).toBe(true);
      expect(trace.signals.grip.some((value) => value === 1)).toBe(true);

      const replayed = await replayTry(mj, source, null);

      expect(replayed.passed).toBe(true);
      expect(trySignals({ ...source, recording: replayed.recording }).signals.grip).toEqual(trace.signals.grip);
      expect(fingers).toHaveLength(2);
      expect(pieces).toEqual(style === 'flat' ? [3, 3] : [7, 7]);
      expect(run.case.world.objects.find((object) => object.id === target.id)?.size).toEqual([
        target.dimensions.width,
        target.dimensions.height,
        target.dimensions.depth,
      ]);

      const scene = {
        name: target.id,
        globalGoal: '',
        annotations: [],
        parts: result.parts,
        project: {
          ...DEFAULT_PROJECT,
          joints: result.joints,
          designParameters: result.parameters,
          cases: [built.kase],
        },
      };
      const reopened = await decodeSceneFile(await encodeSceneFile(scene));
      const shared = readGalleryBundleBytes(
        galleryBundleBytes(
          galleryBundleOf({
            slug: target.id,
            title: target.name,
            robotName: 'fingers',
            parts: result.parts,
            joints: result.joints,
            kase: built.kase,
          }),
        ),
      );

      expect(reopened.parts.filter((part) => part.gripperFinger)).toEqual(
        result.parts.filter((part) => part.gripperFinger),
      );
      expect(shared.case.world).toEqual(built.kase.world);

      const previous = await tryManifest(built.kase, run.model, recording);
      const changed = structuredClone(built.kase);

      changed.world.objects.find((object) => object.id === target.id)!.friction = 0;
      expect((await tryManifest(changed, run.model, recording)).caseHash).not.toBe(previous.caseHash);
    },
  );
});
