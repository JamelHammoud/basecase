import { afterEach, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT, type ProjectSettings } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, openPlayTab, shown, type App } from './harness';
import { routedSceneBackend } from './boardRoutedScene.mjs';

let app: App;
let cleanScenes: (() => Promise<void>) | null = null;
const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
const built = buildCase({ goal: 'drawer', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

if (!built.ok) throw new Error(built.problem);

const scene = {
  id: 'bench-placement',
  name: 'Drawer workbench',
  globalGoal: '',
  updatedAt: '2026-11-20T00:00:00.000Z',
  partCount: arm.parts.length,
  parts: arm.parts,
  project: { ...DEFAULT_PROJECT, joints: arm.joints, cases: [built.kase] },
};

async function openWorkbench() {
  app = await openApp({ scenes: [scene], scene });
  await app.page.getByRole('button', { name: 'New scene', exact: true }).first().click();
  await app.page.getByRole('button', { name: 'Scenes', exact: true }).first().click();
  await app.page.locator('[data-scene-row="bench-placement"]').click();
  await openPlayTab(app.page, 'Cases');
  await app.page
    .locator(shown('[data-testid="cases-panel"] button'), { hasText: built.ok ? built.kase.name : '' })
    .click();

  return app.page.locator(shown('[data-testid="workbench-placement"]'));
}

afterEach(async () => {
  await app?.close();
  await cleanScenes?.();
  cleanScenes = null;
});

it('rehearses an existing arm Case at an entered placement and refuses an unreachable base without daemon commands', async () => {
  const panel = await openWorkbench();

  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.getByPlaceholder('Search commands').fill('Edit Workbench Placement');
  await app.page.locator('button[data-idx]').filter({ hasText: 'Edit Workbench Placement' }).first().click();

  await panel.getByLabel('Unit', { exact: true }).fill('bench-arm');
  await panel.getByRole('button', { name: 'Rehearse', exact: true }).click();
  await expect
    .poll(() => panel.locator('[data-workbench-evidence="entered"]').getAttribute('data-passed'))
    .toBe('true');
  expect(await panel.locator('[data-workbench-evidence="entered"]').getAttribute('data-unit')).toBe('bench-arm');
  await panel.locator('[data-workbench-evidence="entered"]').focus();
  await expect.poll(() => app.page.getByRole('tooltip').textContent()).toMatch(/Case [0-9a-f]{8}Robot [0-9a-f]{8}/);
  await panel.getByLabel('X', { exact: true }).fill('10000');
  await panel.getByLabel('X', { exact: true }).press('Enter');
  await panel.getByRole('button', { name: 'Rehearse', exact: true }).click();
  await expect
    .poll(() => panel.locator('[data-workbench-evidence="entered"]').getAttribute('data-passed'))
    .toBe('false');
  expect(await panel.textContent()).toMatch(/reach/i);
  expect(app.posts.filter((post) => /robot-(command|connect|network-connect|calibrate)/.test(post.route))).toEqual([]);
  expect(app.errors).toEqual([]);
});

it('undoes an entered placement and reopens it through scene persistence', async () => {
  const panel = await openWorkbench();

  cleanScenes = await routedSceneBackend(app.page);

  await panel.getByLabel('Unit', { exact: true }).fill('bench-arm');

  await panel.getByRole('button', { name: 'Rehearse', exact: true }).click();
  await expect.poll(() => panel.locator('[data-workbench-evidence="entered"]').count()).toBe(1);
  await app.page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => panel.locator('[data-workbench-evidence="entered"]').count()).toBe(0);
  await app.page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => panel.locator('[data-workbench-evidence="entered"]').count()).toBe(1);
  await expect
    .poll(() =>
      app.page.evaluate(async () => {
        const saved = (await fetch('/api/bridge/scene?id=bench-placement').then((response) => response.json())) as {
          project?: ProjectSettings;
        } | null;

        return saved?.project?.workbenchPlacements?.[0].evidence;
      }),
    )
    .toBe('entered');
  await app.page.reload();
  await openPlayTab(app.page, 'Cases');
  await app.page
    .locator(shown('[data-testid="cases-panel"] button'), { hasText: built.ok ? built.kase.name : '' })
    .click();
  await expect.poll(() => app.page.locator(shown('[data-workbench-evidence="entered"]')).count()).toBe(1);
  expect(await app.page.locator(shown('[data-workbench-evidence="entered"]')).getAttribute('data-unit')).toBe(
    'bench-arm',
  );
  expect(app.errors).toEqual([]);
});
