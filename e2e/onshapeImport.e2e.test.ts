import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { box } from '../src/sim/fixtures/parts';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../src/types/robotics';
import { fakeArm, ONSHAPE_LINK, signedIn, type ArmOptions } from './fakeOnshape';
import { fakeLegs } from './fakeOnshapeLegs';
import { openApp, partCount, type App } from './harness';

let app: App;

const lists: Record<string, unknown> = {};

interface Studio {
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  load: (record: unknown) => void;
}

const record = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord());

const project = async () => (await record()).project;

const armOf = async () => (await record()).parts.find((p) => p.name === 'Arm')!;

async function recordedImport(options: ArmOptions = {}, assembly = fakeArm(options)) {
  const account = await signedIn(assembly);
  const { model, files } = await account.importAssembly({ link: ONSHAPE_LINK });

  return {
    model,
    files: Object.fromEntries(
      Object.entries(files as Record<string, Uint8Array>).map(([k, v]) => [k, Buffer.from(v).toString('base64')]),
    ),
  };
}

beforeEach(async () => {
  lists['onshape-import'] = await recordedImport();
  app = await openApp(lists);
}, 120000);

afterEach(async () => {
  await app?.close();
});

async function command(label: string) {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type(label);
  await app.page.keyboard.press('Enter');
}

async function importFromLink() {
  await command('Import Robot');
  await app.page.getByLabel('Robot link').fill(ONSHAPE_LINK);
  await app.page.getByRole('button', { name: 'Import', exact: true }).click();
}

describe('Onshape import', () => {
  it('imports an assembly from its link as a rig whose hinge Pose moves', async () => {
    await importFromLink();

    await expect.poll(async () => (await project()).joints?.length ?? 0, { timeout: 30000 }).toBe(1);
    expect(app.posts.find((p) => p.route === 'onshape-import')?.body).toMatchObject({ arg: { link: ONSHAPE_LINK } });

    const [hinge] = (await project()).joints!;

    expect(hinge.type).toBe('revolute');

    await app.page.getByRole('status').getByRole('button', { name: 'Pose', exact: true }).click();

    const slider = app.page.locator(`[data-joint="${hinge.id}"] input[type="range"]`);

    await slider.focus();

    for (let i = 0; i < 5; i++) await slider.press('ArrowRight');

    await expect.poll(async () => (await project()).pose?.values[hinge.id] ?? 0, { timeout: 10000 }).toBe(5);
  });

  it('updates a longer arm in place from Onshape, keeps its servo, and undoes in one step', async () => {
    await importFromLink();
    await expect.poll(async () => (await project()).joints?.length ?? 0).toBe(1);

    const scene = await record();
    const [hinge] = scene.project.joints!;
    const servo = { ...box('elbow-servo', hinge.origin, [24, 32, 45], 55), componentId: 'feetech-sts3215' };
    const joints = [{ ...hinge, parent: [...hinge.parent, servo.id], actuators: [servo.id] }];
    const before = await armOf();

    await app.page.evaluate((r) => (window as unknown as { __studio: Studio }).__studio.load(r), {
      name: 'Desk Arm',
      parts: [...scene.parts, servo],
      project: { ...scene.project, joints },
    });
    await expect.poll(() => partCount(app.page)).toBe(scene.parts.length + 1);

    lists['onshape-import'] = await recordedImport({ armMm: 160 });
    await command('Update from Onshape');

    await expect.poll(async () => (await armOf()).dimensions.height, { timeout: 30000 }).toBeGreaterThan(150);
    expect((await armOf()).id).toBe(before.id);
    expect((await project()).joints).toMatchObject([{ id: hinge.id, actuators: [servo.id] }]);
    expect(app.posts.filter((p) => p.route === 'onshape-import').at(-1)?.body).toMatchObject({
      arg: { link: ONSHAPE_LINK },
    });

    await app.page.keyboard.press('Meta+z');

    await expect.poll(async () => (await armOf()).dimensions.height).toBeCloseTo(before.dimensions.height, 1);
    expect(await partCount(app.page)).toBe(scene.parts.length + 1);
    expect(app.errors).toEqual([]);
  });

  it('imports ranged knees and cylindrical axles inside a subassembly from the link', async () => {
    await app.page.evaluate(
      (project) => (window as unknown as { __studio: Studio }).__studio.load({ name: 'Leg', parts: [], project }),
      DEFAULT_PROJECT,
    );

    lists['onshape-import'] = await recordedImport({}, fakeLegs({ count: 1, cylindrical: true }));
    await importFromLink();
    await expect.poll(async () => (await project()).joints?.length ?? 0).toBe(3);

    const joints = (await project()).joints!;

    expect(joints.find((j) => j.name === 'Knee')).toMatchObject({ type: 'revolute', range: [-60, 80] });
    expect(joints.find((j) => j.name === 'Axle')).toMatchObject({ type: 'revolute', range: [-30, 30] });
    expect((await record()).parts.flatMap((p) => p.robotLink?.fixedMates ?? [])).toEqual(['Axle slide']);
    expect(app.errors).toEqual([]);
  });
});
