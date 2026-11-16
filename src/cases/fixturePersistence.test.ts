import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';
import { galleryBundleOf } from '../gallery/buildBundle';
import { galleryBundleBytes, readGalleryBundleBytes } from '../gallery/galleryBundle';
import { docFromParts, pushHistory, trackedOf, travelProject } from '../workspace/docHistory';
import { buildCase, builderRobot } from './caseBuilder';
import { parseCase, worldItem } from './schema';
import { runCase } from './testing';
import { robotFacts } from './robotFit';
import { caseProbeReader, trySignals } from './tries';
import { replayTry } from './tryReplay';
import { scaledToReach } from './scale';
import { probeSignals } from './fixtureTravel';
import { consoleReader } from './console/format';
import { emitWorld } from '../sim/mjcfWorld';
import { buildMjcf } from '../sim/mjcf';
import { caseRobot } from './testing';

const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
const rig = buildRig(arm.joints, arm.parts);
const builder = builderRobot(rig, arm.parts);

function fixture() {
  const built = buildCase({ goal: 'drawer', world: 'floor' }, builder);

  if (!built.ok) throw new Error(built.problem);

  return built.kase;
}

it('keeps topology and bindings in portable scenes, shared bundles and robot undo and redo', async () => {
  const kase = fixture();
  const project = { ...DEFAULT_PROJECT, joints: arm.joints, cases: [kase] };
  const portable = sharedScene({ name: 'Drawer', globalGoal: '', parts: arm.parts, project });
  const restored = await decodeSceneFile(await encodeSceneFile(portable));
  const bundle = readGalleryBundleBytes(
    galleryBundleBytes(
      galleryBundleOf({
        slug: 'drawer',
        title: 'Drawer',
        robotName: arm.id,
        parts: arm.parts,
        joints: arm.joints,
        kase,
      }),
    ),
  );

  expect(parseCase(restored.project!.cases![0]).world).toEqual(kase.world);
  expect(bundle.case).toEqual(parseCase(kase));

  const doc = pushHistory(docFromParts(arm.parts), [...arm.parts], trackedOf(project));
  const undone = travelProject(doc, project, { direction: 'undo' })!;
  const redone = travelProject(undone.doc, undone.project, { direction: 'redo' })!;

  expect(undone.project.cases).toEqual([kase]);
  expect(redone.project.cases).toEqual([kase]);
});

it('replays complete fixture qpos and exposes the same travel to console probes', async () => {
  const mj = await loadMujoco();
  const result = await runCase(mj, fixture(), arm, { controller: 'reference', record: true });
  const source = {
    kase: result.case,
    model: result.model,
    recording: result.recording!,
    rig,
    effector: robotFacts(rig, arm.parts).endEffector,
  };
  const replayed = await replayTry(mj, source, null);
  const trace = trySignals(source);
  const reader = caseProbeReader(source);
  const values: Record<string, number[]> = {};
  const at = (source.recording.frames - 1) * source.recording.nbody * 7;

  reader.sample(Float64Array.from(source.recording.poses.subarray(at)), values);
  expect(values['fixture-travel'][0]).toBeCloseTo(trace.signals['fixture-travel'].at(-1)!, 6);
  expect(replayed.passed).toBe(true);
  expect(replayed.recording.nq).toBe(source.recording.nq);
  expect(Math.max(...trySignals({ ...source, recording: replayed.recording }).signals['fixture-travel'])).toBeCloseTo(
    Math.max(...trace.signals['fixture-travel']),
    1,
  );
  expect(
    consoleReader({ probes: probeSignals(result.case) })(
      {
        input: ['keys'],
        panels: [{ id: 'travel', kind: 'value', signal: 'probe.fixture-travel' }],
        layout: { areas: [{ canvas: true }, { size: 320, panels: ['travel'] }] },
      },
      'console',
    ).panels,
  ).toHaveLength(1);
});

it('scales slide travel and pivots together without scaling hinge angles or inventing actuators', () => {
  const kase = fixture();
  const scaled = scaledToReach(kase, kase.slot!.reachMm! / 2, kase.slot!.anchor!);
  const joint = scaled.world.objects[0].joint!;

  expect(joint.range).toEqual([0, 25]);
  expect(joint.axis).toEqual(kase.world.objects[0].joint!.axis);
  expect(JSON.stringify(scaled.task.contract)).toContain('20');
  expect(parseCase(scaled).world.objects[1].parent).toBe('fixture');
});

it('refuses malformed fixture imports at the MJCF boundary as well as the Case boundary', () => {
  const kase = fixture();
  const objects = kase.world.objects.map(worldItem);
  const input = { ...caseRobot(arm), project: DEFAULT_PROJECT, rig };

  objects[0].joint = { ...objects[0].joint!, axis: [Number.NaN, 0, 0] };
  expect(() => emitWorld({ ...input, world: objects }, 0)).toThrow();
  expect(() => buildMjcf({ ...input, world: [...objects.slice(1)] })).toThrow();
});

it('refuses damaged fixture parameters when opening a portable scene or shared bundle', async () => {
  const kase = fixture();

  kase.world.objects[0].joint!.axis = [0, 0, 0];

  const project = { ...DEFAULT_PROJECT, joints: arm.joints, cases: [kase] };
  const portable = sharedScene({ name: 'Drawer', globalGoal: '', parts: arm.parts, project });

  await expect(decodeSceneFile(await encodeSceneFile(portable))).rejects.toThrow();
  expect(() =>
    readGalleryBundleBytes(
      galleryBundleBytes(
        galleryBundleOf({
          slug: 'drawer',
          title: 'Drawer',
          robotName: arm.id,
          parts: arm.parts,
          joints: arm.joints,
          kase,
        }),
      ),
    ),
  ).toThrow();
});
