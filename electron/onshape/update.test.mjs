import { describe, expect, it, vi } from 'vitest';
import { fakeArm, KEYS, ONSHAPE_LINK, signedIn } from '../../e2e/fakeOnshape.ts';
import { assemblyRobot } from '../../src/onshape/assemblyRobot.ts';
import { fetchOnshapeUpdate, onshapeTarget } from '../../src/onshape/onshapeTarget.ts';
import { goneMateFindings } from '../../src/readiness/buildChecks.ts';
import { placeRobot } from '../../src/workspace/robotPlacement.ts';
import { NOT_AN_ASSEMBLY_LINK } from './link.mjs';

async function onshape(options = {}) {
  const account = await signedIn(fakeArm(options));

  return assemblyRobot(ONSHAPE_LINK, await account.importAssembly({ link: ONSHAPE_LINK }));
}

const SERVO = {
  id: 'elbow-servo',
  name: 'STS3215',
  kind: 'box',
  category: 'actuators',
  role: 'solid',
  position: [150, 60, -40],
  rotation: [0, 0, 0],
  dimensions: { width: 24, height: 32, depth: 45 },
  color: '#222222',
  note: '',
  mechanicalTag: '',
  visible: true,
  locked: false,
  componentId: 'feetech-sts3215',
};

async function sceneOf(options = {}) {
  const robot = await onshape(options);
  const placed = placeRobot({ parts: robot.parts, joints: robot.joints, shift: [150, 0, -40], takenJointIds: [] });
  const joints = placed.joints.map((j) => ({ ...j, parent: [...j.parent, SERVO.id], actuators: [SERVO.id] }));

  return { parts: [...placed.parts, SERVO], joints, groupId: placed.parts[0].group.id };
}

const update = (scene, fresh) =>
  fetchOnshapeUpdate({ groupId: scene.groupId, current: () => scene, load: async () => fresh });

const named = (parts, name) => parts.find((p) => p.name === name);
const bottom = (p) => p.position[1] - p.dimensions.height / 2;

describe('Update from Onshape', () => {
  it('replaces a resized link in place and keeps its servo', async () => {
    const scene = await sceneOf();
    const plan = await update(scene, await onshape({ armMm: 160 }));
    const [before, after] = [named(scene.parts, 'Arm'), named(plan.parts, 'Arm')];

    expect(plan.changes).toBe(1);
    expect(after.id).toBe(before.id);
    expect(after.dimensions.height).toBeCloseTo(160, 1);
    expect(bottom(after)).toBeCloseTo(bottom(before), 1);
    expect(named(plan.parts, 'Base')).toBe(named(scene.parts, 'Base'));
    expect(plan.parts.map((p) => p.id)).toEqual(scene.parts.map((p) => p.id));
    expect(plan.changed.map((p) => p.id)).toEqual([before.id]);
    expect(plan.joints).toHaveLength(1);
    expect(plan.joints[0]).toBe(scene.joints[0]);
    expect(plan.joints[0].actuators).toEqual([SERVO.id]);
    expect(plan.joints[0].parent).toContain(SERVO.id);
  });

  it('adds a new link as a part in the same group, with its joint', async () => {
    const scene = await sceneOf();
    const plan = await update(scene, await onshape({ wrist: true }));
    const wrist = named(plan.parts, 'Wrist');
    const [elbow, added] = plan.joints;

    expect(plan.parts).toHaveLength(scene.parts.length + 1);
    expect(wrist.group).toEqual(named(scene.parts, 'Arm').group);
    expect(added).toMatchObject({ name: 'Wrist', type: 'revolute', child: [wrist.id], parentJoint: elbow.id });
    expect(added.parent).toEqual([named(plan.parts, 'Arm').id]);
    expect(elbow).toBe(scene.joints[0]);
    expect(plan.changes).toBe(2);
  });

  it('keeps a joint whose mate is gone and names it in Checks', async () => {
    const scene = await sceneOf();
    const plan = await update(scene, await onshape({ elbow: false }));
    const rows = goneMateFindings(plan.joints);

    expect(plan.joints).toHaveLength(1);
    expect(plan.joints[0]).toMatchObject({ actuators: [SERVO.id], onshape: { mate: 'Melbow', gone: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ level: 'note', ids: plan.joints[0].child });
    expect(rows[0].text).toContain('Elbow');

    const back = await update({ ...scene, ...plan }, await onshape());

    expect(goneMateFindings(back.joints)).toEqual([]);
  });

  it('takes a mate’s new limits onto the same joint', async () => {
    const scene = await sceneOf();
    const plan = await update(scene, await onshape({ limits: ['-60 deg', '60 deg'] }));

    expect(plan.changes).toBe(1);
    expect(plan.joints[0]).toMatchObject({ id: scene.joints[0].id, range: [-60, 60], actuators: [SERVO.id] });
    expect(plan.joints[0].axis).toEqual(scene.joints[0].axis);
  });

  it('changes nothing when the document hasn’t changed', async () => {
    const scene = await sceneOf();
    const plan = await update(scene, await onshape());

    expect(plan.changes).toBe(0);
    expect(plan.changed).toEqual([]);
    plan.parts.forEach((p, i) => expect(p).toBe(scene.parts[i]));
    plan.joints.forEach((j, i) => expect(j).toBe(scene.joints[i]));
  });

  it('finds the robot to update from the selection, or the only one in the scene', async () => {
    const scene = await sceneOf();

    expect(onshapeTarget(scene.parts, [])?.link).toBe(ONSHAPE_LINK);
    expect(onshapeTarget(scene.parts, [SERVO.id])?.link).toBe(ONSHAPE_LINK);
    expect(onshapeTarget([SERVO], [])).toBeNull();
  });
});

describe('exploits', () => {
  const crafted = (scene, did) => ({
    ...scene,
    parts: scene.parts.map((p) =>
      p.group?.onshape ? { ...p, group: { ...p.group, onshape: { ...p.group.onshape, did } } } : p,
    ),
  });

  it.each(['../../users/sessioninfo', 'd0c0000000000000000000d1/../../x', 'D0C0000000000000000000D1', ''])(
    'won’t fetch for a scene file whose stored document id is %j',
    async (did) => {
      const load = vi.fn(async () => onshape());
      const scene = crafted(await sceneOf(), did);

      expect(await fetchOnshapeUpdate({ groupId: scene.groupId, current: () => scene, load })).toBeNull();
      expect(load).not.toHaveBeenCalled();
      expect(onshapeTarget(scene.parts, [])).toBeNull();
    },
  );

  it('refuses the same crafted id in the main process too, before any request', async () => {
    const seen = [];
    const account = await signedIn(fakeArm(), seen);
    const before = seen.length;
    const link = `https://cad.onshape.com/documents/../../users/sessioninfo/w/${'e'.repeat(24)}/e/${'a'.repeat(24)}`;

    await expect(account.importAssembly({ link })).rejects.toThrow(NOT_AN_ASSEMBLY_LINK);
    expect(seen).toHaveLength(before);
  });

  it('keeps the keys out of the scene it writes', async () => {
    const scene = await sceneOf();
    const plan = await update(scene, await onshape({ armMm: 160, wrist: true }));
    const written = JSON.stringify({ parts: plan.parts, joints: plan.joints });

    for (const secret of [KEYS.access, KEYS.secret]) expect(written).not.toContain(secret);

    expect(JSON.stringify(plan.parts.find((p) => p.group?.onshape).group)).not.toMatch(/key|secret|token/i);
  });
});
