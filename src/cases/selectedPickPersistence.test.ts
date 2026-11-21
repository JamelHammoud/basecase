import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { decodeSceneFile, encodeSceneFile } from '../utils/sceneFile';
import { galleryBundleOf } from '../gallery/buildBundle';
import { bundleScene, galleryBundleBytes, readGalleryBundleBytes } from '../gallery/galleryBundle';
import { buildCase, builderRobot } from './caseBuilder';
import { selectedPickTargets } from './selectedPick.fixtures';
import { jitteredWorld, worldRandom } from './caseRandom';
import { parseCase } from './schema';

describe('selected-object Case persistence', () => {
  it('retains all ten selected objects in native scene files and ordinary gallery bundles', async () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const rig = buildRig(arm.joints, arm.parts);

    for (const target of selectedPickTargets()) {
      const built = buildCase({ goal: 'pick', world: 'floor', pickTarget: target }, builderRobot(rig, arm.parts));

      if (!built.ok) throw new Error(built.problem);

      const kase = built.kase;
      const scene = {
        name: target.id,
        globalGoal: '',
        annotations: [],
        parts: [...arm.parts, target],
        project: { ...DEFAULT_PROJECT, joints: arm.joints, cases: [kase] },
      };
      const reopened = await decodeSceneFile(await encodeSceneFile(scene));
      const bundle = galleryBundleOf({
        slug: `pick-${target.id}`,
        title: target.name,
        robotName: arm.id,
        parts: scene.parts,
        joints: arm.joints,
        kase,
      });
      const shared = bundleScene(readGalleryBundleBytes(galleryBundleBytes(bundle)));

      for (const restored of [reopened.project!.cases![0], shared.project!.cases![0]]) {
        expect(restored.world.pickTarget).toBe(target.id);
        expect(restored.world.objects.find((item) => item.id === target.id)?.geometry).toEqual(target);
        expect(restored).toEqual(kase);
      }
    }
  });

  it('retains a fixed target snapshot when seeded staging changes its starting position', () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const target = selectedPickTargets()[0];
    const built = buildCase(
      { goal: 'pick', world: 'floor', pickTarget: target },
      builderRobot(buildRig(arm.joints, arm.parts), arm.parts),
    );

    if (!built.ok) throw new Error(built.problem);

    const jittered = jitteredWorld(built.kase, worldRandom(7));
    const reopened = parseCase(JSON.parse(JSON.stringify(jittered)));
    const object = reopened.world.objects.find((item) => item.id === target.id)!;

    expect(object.position).not.toEqual(target.position);
    expect(object.geometry).toEqual(target);
    expect(object.size).toEqual([20, 20, 20]);
    expect(object.massG).toBe(target.massG);
    expect(object.friction).toBe(target.physics!.friction);
  });
});
