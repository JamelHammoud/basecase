import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { galleryBundleOf } from '../gallery/buildBundle';
import { galleryBundleBytes, readGalleryBundleBytes } from '../gallery/galleryBundle';
import { DEFAULT_PROJECT } from '../types/robotics';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { CaseCheckSession, type WireRobot } from './caseCheckJob';
import { personEncounterFixture, PERSON_ENCOUNTERS } from './personEncounters.fixtures';
import { parseCase } from './schema';
import { caseSensorKey } from './sensorIdentity';

describe('portable person encounters', () => {
  it.each(PERSON_ENCOUNTERS.map((name, index) => ({ name, index })))(
    '$name retains body dimensions, identities, timing, routes and contract guards',
    async ({ index }) => {
      const { kase, robot } = personEncounterFixture(index);
      const scene = sharedScene({
        name: kase.name,
        globalGoal: '',
        parts: robot.parts,
        project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [kase] },
      });
      const reopened = await decodeSceneFile(await encodeSceneFile(scene));
      const bundle = readGalleryBundleBytes(
        galleryBundleBytes(
          galleryBundleOf({
            slug: `encounter-${index}`,
            title: kase.name,
            robotName: robot.id,
            parts: robot.parts,
            joints: robot.joints,
            kase,
          }),
        ),
      );

      expect(parseCase(reopened.project!.cases![0])).toEqual(kase);
      expect(bundle.case).toEqual(kase);
    },
  );

  it('refuses malformed routes through native scene and gallery readers', async () => {
    const { kase, robot } = personEncounterFixture(0);

    kase.world.objects.find((object) => object.person)!.person!.route = [];

    const scene = sharedScene({
      name: kase.name,
      globalGoal: '',
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [kase] },
    });

    await expect(decodeSceneFile(await encodeSceneFile(scene))).rejects.toThrow();
    expect(() =>
      readGalleryBundleBytes(
        galleryBundleBytes(
          galleryBundleOf({
            slug: 'bad-encounter',
            title: kase.name,
            robotName: robot.id,
            parts: robot.parts,
            joints: robot.joints,
            kase,
          }),
        ),
      ),
    ).toThrow();
  });

  it('invalidates Case worker identities after camera lens or sensor component edits', async () => {
    const { robot } = personEncounterFixture(0);
    const mj = await loadMujoco();
    const session = new CaseCheckSession();
    const triangles = fixtureTriangles(robot.parts);
    const input: WireRobot = {
      id: robot.id,
      parts: robot.parts,
      joints: robot.joints,
      measures: fixtureMeasures(robot.parts),
      triangles: Object.fromEntries(robot.parts.map((part) => [part.id, triangles(part.id)!])),
    };
    const hash = async (wire: WireRobot) => {
      const reply = await session.run(mj, { type: 'model', robot: wire, walks: [] });

      if (reply.type !== 'model') throw new Error('Expected a model reply');

      return reply.modelHash;
    };
    const original = await hash(input);
    const lens = {
      ...input,
      parts: input.parts.map((part, index) =>
        index ? part : { ...part, cameraLens: { model: 'pinhole' as const, hfovDeg: 80 } },
      ),
    };
    const component = {
      ...input,
      parts: input.parts.map((part, index) => (index ? part : { ...part, componentId: 'changed-sensor' })),
    };

    expect(caseSensorKey(lens.parts)).not.toBe(caseSensorKey(input.parts));
    expect(caseSensorKey(component.parts)).not.toBe(caseSensorKey(input.parts));
    expect(await hash(lens)).not.toBe(original);
    expect(await hash(component)).not.toBe(original);
  });
});
