import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT, type ProjectSettings, type RobotJoint } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

interface Studio {
  load: (record: unknown) => void;
  sceneRecord: () => { project: ProjectSettings };
}

interface Tabs {
  list: () => { ids: string[]; activeId: string };
  select: (id: string) => void;
}

const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
const movable = (joints: RobotJoint[] = []) => joints.filter((j) => j.type !== 'fixed').map((j) => j.id);

const tabs = () => app.page.evaluate(() => (window as unknown as { __studioTabs: Tabs }).__studioTabs.list());
const project = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord().project);

beforeAll(async () => {
  app = await openApp();
  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: 'Desk Arm',
    parts: arm.parts,
    project: { ...DEFAULT_PROJECT, joints: arm.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(arm.parts.length);
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Make a Leader', () => {
  it('opens the leader in a new tab from ⌘K, with the same joints and plates in Build', async () => {
    const before = await tabs();

    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Make a Leader');
    await app.page.keyboard.press('Enter');

    await expect.poll(async () => (await tabs()).ids.length).toBe(before.ids.length + 1);
    expect((await tabs()).activeId).not.toBe(before.activeId);
    await expect.poll(async () => (await project()).leads?.robot ?? null).not.toBeNull();

    const leader = await project();

    expect(movable(leader.joints)).toEqual(movable(arm.joints));
    expect(Object.values(leader.leads!.joints)).toEqual(movable(arm.joints));

    await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

    const printing = app.page.locator(shown('section'), { hasText: /^Printing/ }).first();

    await expect.poll(() => printing.textContent(), { timeout: 30000 }).toMatch(/^Printing\d+ plates?/);
  });

  it('offers Make a Leader on a part of the arm', async () => {
    const [first] = (await tabs()).ids;

    await app.page.evaluate((id) => (window as unknown as { __studioTabs: Tabs }).__studioTabs.select(id), first);
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).first().click();
    await app.page.locator(shown('li'), { hasText: 'link3' }).first().click({ button: 'right' });
    await expect.poll(() => app.page.getByRole('menuitem', { name: 'Make a Leader' }).count()).toBe(1);
    await app.page.keyboard.press('Escape');
    expect(app.errors).toEqual([]);
  });
});
