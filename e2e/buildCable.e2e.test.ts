import { afterEach, beforeEach, expect, it } from 'vitest';
import type { GuidePlan } from '../src/guide/guideTypes';
import { component, sceneOf, servoJoints } from '../src/wiring/fixtures';
import type { Net } from '../src/wiring/netlist';
import { buildCheckPage, studioLoad } from './buildCheckFixtures';
import { openApp, shown, type App } from './harness';

interface CableStudio {
  openBuildAlong: (plan: GuidePlan) => Promise<unknown>;
  buildAlongRoutes: () => Net[];
  selection: () => string[];
}

const arm = servoJoints({ prefix: 'xl', componentId: 'dynamixel-xl330-m288', count: 2, limb: 'arm' });
const names = ['Elbow', 'Wrist'];
const parts = [
  { ...component('adapter', 'robotis-u2d2'), position: [-60, 40, 0] as [number, number, number] },
  ...arm.parts.map((part, i) => ({
    ...part,
    name: `${names[i]} servo`,
    position: [i * 400, 40, 0] as [number, number, number],
  })),
];
const joints = arm.joints.map((joint, i) => ({
  ...joint,
  name: names[i],
  parent: [i === 0 ? 'adapter' : 'xl1'],
  range: [0, 0] as [number, number],
}));
const plan: GuidePlan = {
  title: 'Cable installation',
  items: [],
  tools: [],
  modules: [],
  partIds: parts.map((part) => part.id),
  steps: [['adapter', 'xl1'], ['xl2']].map((partIds, index) => ({
    kind: 'build',
    number: index + 1,
    moduleId: 'main',
    partIds,
    contextIds: [],
    moves: [],
    arrows: [],
    callout: [],
    tools: [],
  })),
};

let app: App;

const routes = () =>
  app.page.evaluate(() => (window as unknown as { __studio: CableStudio }).__studio.buildAlongRoutes());

beforeEach(async () => {
  app = await openApp();
  await studioLoad(app.page, sceneOf(parts, joints));
});

afterEach(async () => {
  await app?.close();
});

it('selects a Cable reach endpoint and shows incoming routes only during their Build Along step', async () => {
  const check = buildCheckPage(() => app.page);
  const toolbar = app.page.locator(shown('[role=toolbar][aria-label="Build Along"]'));
  const incoming = app.page.locator('[data-build-route]', { hasText: 'Elbow, ID 1 to Wrist, ID 2' });

  await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

  const reach = check.checkRow('Cable reach');

  await expect.poll(() => reach.getAttribute('data-status')).toBe('fail');
  await check.expand(reach, 'Cable reach');
  await reach.getByRole('button', { name: 'Wrist servo', exact: true }).click();
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as { __studio: CableStudio }).__studio.selection()))
    .toEqual(['xl2']);
  await app.page.evaluate(
    (plan) => (window as unknown as { __studio: CableStudio }).__studio.openBuildAlong(plan),
    plan,
  );
  await expect.poll(() => toolbar.getAttribute('data-step')).toBe('1');
  expect(await incoming.count()).toBe(0);
  await toolbar.getByRole('button', { name: /^Next step/ }).click();
  await expect.poll(() => toolbar.getAttribute('data-step')).toBe('2');
  await expect
    .poll(() => incoming.allTextContents())
    .toEqual(['Elbow, ID 1 to Wrist, ID 2ROBOTIS Robot Cable-X3P180 mm']);
  await expect.poll(async () => (await routes()).map((net) => [net.from.id, net.to.id])).toEqual([['xl1', 'xl2']]);
  await toolbar.getByRole('button', { name: /^Previous step/ }).click();
  await expect.poll(() => incoming.count()).toBe(0);
  await toolbar.getByRole('button', { name: /^Next step/ }).click();
  await expect.poll(() => incoming.count()).toBe(1);
  await app.page.keyboard.press('Escape');
  await expect.poll(() => app.page.locator('[data-build-route]').count()).toBe(0);
  await expect.poll(routes).toEqual([]);
  await expect.poll(() => toolbar.count()).toBe(0);
  expect(app.errors).toEqual([]);
});
