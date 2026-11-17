import { afterEach, beforeEach, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { fixtureScene } from '../src/cases/fixtureScenes.fixtures';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT, type CustomModelDefinition, type SavedSceneRecord } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

interface Studio {
  load: (scene: unknown) => void;
  simState: () => { tries: Array<{ id: string; passed: boolean }>; timeline: unknown };
  fixtureTravel: () => number[];
  caseRunSpeed: (speed: number) => void;
}

let app: App;
const saved = new Map<string, SavedSceneRecord>();
const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
const state = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

beforeEach(async () => {
  saved.clear();
  app = await openApp({ scenes: [] });
  await app.page.route(/\/api\/bridge\/(scene|scenes|save-scene)(\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').at(-1);

    if (name === 'save-scene') {
      const payload = route.request().postDataJSON() as SavedSceneRecord;

      saved.set(payload.id, { ...payload, updatedAt: new Date().toISOString(), partCount: payload.parts.length });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(saved.get(payload.id)),
      });

      return;
    }

    const result = name === 'scene' ? saved.get(url.searchParams.get('id') ?? '') : [...saved.values()];

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result ?? null) });
  });
});

afterEach(async () => {
  await app?.close();
});

it('captures an assembly from selection, reuses it in New Case and reopens its recorded chest chore', async () => {
  const built = buildCase({ goal: 'chest', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

  if (!built.ok) throw new Error(built.problem);

  const source = fixtureScene(built.kase, 'Toy chest');
  const { page } = app;

  await page.evaluate((scene) => (window as unknown as { __studio: Studio }).__studio.load(scene), {
    id: 'fixture-source',
    name: source.name,
    parts: source.parts,
    project: { ...DEFAULT_PROJECT, joints: source.joints },
  });
  await expect.poll(() => partCount(page)).toBe(source.parts.length);
  await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).click();
  await page.locator(shown('[data-layer-row="group:fixture-assembly"]')).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Save to Library', exact: true }).click();
  await expect.poll(() => app.posts.filter((post) => post.route === 'save-model').length).toBe(1);
  expect((app.posts.find((post) => post.route === 'save-model')!.body as CustomModelDefinition).caseFixture).toBe(true);
  await page.evaluate((scene) => (window as unknown as { __studio: Studio }).__studio.load(scene), {
    id: 'fixture-robot',
    name: 'Chest robot',
    parts: arm.parts,
    project: { ...DEFAULT_PROJECT, joints: arm.joints },
  });
  await expect.poll(() => partCount(page)).toBe(arm.parts.length);
  await openPlayTab(page, 'Cases');
  await page.locator(shown('button'), { hasText: 'New Case' }).first().click();

  const builder = page.locator(shown('[data-testid="new-case"]'));

  await builder.getByRole('radio', { name: 'Put Away a Block', exact: true }).click();
  await builder.getByRole('radio', { name: 'Toy chest', exact: true }).click();
  await builder.getByLabel('Width').fill('100');
  await builder.getByLabel('Width').press('Enter');
  await builder.getByRole('button', { name: 'Make Case', exact: true }).click();
  await page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.caseRunSpeed(4));
  await page.locator(shown('button'), { hasText: 'Try Reference' }).first().click();
  await expect.poll(async () => (await state()).tries.length).toBe(1);
  expect((await state()).tries[0].passed).toBe(true);
  await expect.poll(() => saved.get('fixture-robot')?.project?.tries?.length).toBe(1);
  await page.getByRole('button', { name: 'New scene', exact: true }).first().click();
  await page.getByRole('button', { name: 'Scenes', exact: true }).first().click();
  await page.locator('[data-scene-row="fixture-robot"]').click();
  await openPlayTab(page, 'Cases');
  await page.locator(shown('[data-testid="try-row"]')).first().click();
  await expect.poll(async () => (await state()).timeline).not.toBeNull();

  const travel = await page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.fixtureTravel());

  expect(Math.max(...travel)).toBeGreaterThan(40);
  expect(Math.abs(travel.at(-1)!)).toBeLessThan(5);
  expect(app.errors).toEqual([]);
});
