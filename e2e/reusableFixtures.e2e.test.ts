import { afterEach, expect, it } from 'vitest';
import { buildCase, builderRobot, type CaseSpec } from '../src/cases/caseBuilder';
import { captureCaseFixture } from '../src/cases/fixtureAssembly';
import { fixtureScene } from '../src/cases/fixtureScenes.fixtures';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT, type CustomModelDefinition, type ProjectSettings } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

interface Studio {
  load: (scene: unknown) => void;
  sceneRecord: () => { project: ProjectSettings };
}

let app: App;
const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
const robot = builderRobot(buildRig(arm.joints, arm.parts), arm.parts);
const sceneRecord = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord());

function made(spec: CaseSpec) {
  const result = buildCase(spec, robot);

  if (!result.ok) throw new Error(result.problem);

  return result.kase;
}

const source = fixtureScene(made({ goal: 'chest', world: 'floor' }), 'Toy chest');

async function load(scene: unknown, count: number) {
  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
  await expect.poll(() => partCount(app.page)).toBe(count);
}

afterEach(async () => {
  await app?.close();
});

it('saves a selected passive assembly through the selection menu', async () => {
  app = await openApp({ scenes: [] });
  await load(
    {
      id: 'fixture-source',
      name: source.name,
      parts: source.parts,
      project: { ...DEFAULT_PROJECT, joints: source.joints },
    },
    source.parts.length,
  );

  const { page } = app;

  await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).click();
  await page.locator(shown('[data-layer-row="group:fixture-assembly"]')).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Save to Library', exact: true }).click();
  await expect.poll(() => app.posts.filter((post) => post.route === 'save-model').length).toBe(1);
  expect((app.posts.find((post) => post.route === 'save-model')!.body as CustomModelDefinition).caseFixture).toBe(true);
  expect(app.errors).toEqual([]);
});

it('selects a saved fixture and applies its edited width through New Case', async () => {
  const fixture = await captureCaseFixture(source);

  app = await openApp({ scenes: [], models: [fixture] });
  await load(
    { id: 'fixture-robot', name: 'Chest robot', parts: arm.parts, project: { ...DEFAULT_PROJECT, joints: arm.joints } },
    arm.parts.length,
  );

  const { page } = app;

  await openPlayTab(page, 'Cases');
  await page.locator(shown('button'), { hasText: 'New Case' }).first().click();

  const builder = page.locator(shown('[data-testid="new-case"]'));

  await builder.getByRole('radio', { name: 'Put Away a Block', exact: true }).click();
  await builder.getByRole('radio', { name: 'Toy chest', exact: true }).click();
  await builder.getByLabel('Width').fill('100');
  await builder.getByLabel('Width').press('Enter');
  await builder.getByRole('button', { name: 'Make Case', exact: true }).click();
  await expect
    .poll(async () => (await sceneRecord()).project.cases?.[0]?.world.objects.find((object) => object.joint)?.size[0])
    .toBe(100);
  expect((await sceneRecord()).project.cases![0].world.objects.find((object) => object.joint)!.geometry).toBeDefined();
  expect(app.errors).toEqual([]);
});

it('opens a saved scene containing a resized fixture through Scenes', async () => {
  const fixture = await captureCaseFixture(source);
  const kase = made({ goal: 'chest', world: 'floor', fixture, values: { fixtureWidthMm: 100 } });
  const scene = {
    id: 'fixture-robot',
    name: 'Chest robot',
    globalGoal: '',
    updatedAt: '2026-11-19T00:00:00.000Z',
    partCount: arm.parts.length,
    parts: arm.parts,
    project: { ...DEFAULT_PROJECT, joints: arm.joints, cases: [kase] },
  };

  app = await openApp({ scenes: [scene], scene });

  const { page } = app;

  await page.getByRole('button', { name: 'New scene', exact: true }).first().click();
  await expect.poll(async () => (await sceneRecord()).project.cases ?? []).toEqual([]);
  await page.getByRole('button', { name: 'Scenes', exact: true }).first().click();
  await page.locator('[data-scene-row="fixture-robot"]').click();
  await expect.poll(async () => (await sceneRecord()).project.cases).toEqual([kase]);
  expect(app.errors).toEqual([]);
});
