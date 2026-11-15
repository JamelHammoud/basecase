import { describe, expect, it } from 'vitest';
import { caseWorldItems } from '../cases/importedWorldItems';
import { presetCase } from '../cases/testing';
import type { StoredTry } from '../cases/tryFile';
import { fixtureArm } from '../datasets/labelFixtures';
import { DEFAULT_PROJECT } from '../types/robotics';
import { stageCase } from '../cases/caseCast';
import { buildRig } from '../utils/kinematics';
import { prepareTryScene, type TrySceneInput } from './trySceneJobs';
import { trySceneFloor } from './trySceneFloor';

function fixture(): TrySceneInput {
  const robot = fixtureArm();
  const kase = presetCase(robot, 'touch-the-dots');
  const stored = { case: { id: kase.id } } as StoredTry;

  return {
    scene: { parts: robot.parts, project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [kase] } },
    stored,
    partners: [],
    meshes: {},
    assets: {},
  };
}

describe('saved try scene preparation', () => {
  it('measures the floor from transformed geometry for the simulation lift', async () => {
    const part = {
      ...fixtureArm().parts[0],
      kind: 'box' as const,
      position: [0, -3, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      dimensions: { width: 20, height: 10, depth: 30 },
    };
    const rig = buildRig([], [part]);

    expect(await trySceneFloor([part], rig, undefined)).toBeCloseTo(-8);
    expect(await trySceneFloor([{ ...part, rotation: [0, 0, 90] }], rig, undefined)).toBeCloseTo(-13);
  });

  it('builds calibrated robot geometry with the scaled Case world and camera views', async () => {
    const input = fixture();
    const scene = await prepareTryScene(input);
    const lead = { parts: input.scene.parts, rig: buildRig(input.scene.project!.joints!, input.scene.parts) };
    const staged = stageCase(input.scene.project!.cases![0], lead, []);

    expect(scene.world).toEqual(caseWorldItems(staged.kase));
    expect(scene.kase).toEqual(staged.kase);
    expect(scene.rig!.joints).toHaveLength(lead.rig.joints.length);
    expect(scene.model!.bodies.some((body) => body.parts.includes(input.scene.parts[0].id))).toBe(true);
    expect(scene.views.map((view) => view.key)).toContain('scene');

    const changed = {
      ...input,
      scene: {
        ...input.scene,
        parts: input.scene.parts.map((part, index) =>
          index ? part : { ...part, dimensions: { ...part.dimensions, width: part.dimensions.width + 10 } },
        ),
      },
    };
    const rebuilt = await prepareTryScene(changed);

    expect(rebuilt.model!.xml).not.toEqual(scene.model!.xml);
  });

  it('refuses a missing Case before producing a frame scene', async () => {
    const input = fixture();

    input.stored = { ...input.stored, case: { id: 'missing', name: 'Missing', hash: '' } };

    await expect(prepareTryScene(input)).rejects.toThrow(/Case/);
  });
});
