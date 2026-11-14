import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

interface Part {
  id: string;
  name: string;
  group?: { id: string; name: string };
}

interface Studio {
  sceneRecord: () => { parts: Part[] };
  load: (record: { parts: unknown[]; name?: string; project?: unknown }) => void;
  select: (ids: string[]) => void;
  simState: () => { activeCase: string | null };
}

const box = (id: string, name: string, extra: object = {}) => ({
  id,
  name,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 10, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 20, depth: 20 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const studio = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord().parts);

const select = (ids: string[]) =>
  app.page.evaluate((list) => (window as unknown as { __studio: Studio }).__studio.select(list), ids);

const renameField = (label = 'Name') => app.page.locator(shown(`input[aria-label="${label}"]`)).first();

async function runCommand(label: string) {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type(label);
  await app.page.keyboard.press('Enter');
}

async function typeName(name: string, label?: string) {
  await expect.poll(() => renameField(label).evaluate((el) => el === document.activeElement)).toBe(true);
  await app.page.keyboard.type(name);
  await app.page.keyboard.press('Enter');
}

beforeAll(async () => {
  app = await openApp();
  await app.page.evaluate(
    (parts) => (window as unknown as { __studio: Studio }).__studio.load({ parts }),
    [
      box('plate', 'Plate'),
      box('thigh', 'Thigh', { group: { id: 'leg', name: 'Group 1' } }),
      box('shin', 'Shin', { group: { id: 'leg', name: 'Group 1' } }),
    ],
  );
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Rename', () => {
  it('renames the selected part from ⌘K in its Layers row', async () => {
    await select(['plate']);
    await runCommand('Rename');

    await expect.poll(() => renameField().inputValue()).toBe('Plate');
    await typeName('Base');

    await expect.poll(async () => (await studio()).find((p) => p.id === 'plate')?.name).toBe('Base');
    await expect
      .poll(() => app.page.locator(shown('[data-layer-row="part:plate"]')).first().innerText())
      .toContain('Base');
  });

  it('renames a whole group from its right-click menu', async () => {
    await app.page.locator(shown('[data-layer-row="group:leg"]')).first().click({ button: 'right' });
    await app.page.locator(shown('[role="menuitem"]:has-text("Rename")')).first().click();

    await expect.poll(() => renameField().inputValue()).toBe('Group 1');
    await typeName('Leg');

    await expect.poll(async () => (await studio()).map((p) => p.group?.name ?? null)).toEqual([null, 'Leg', 'Leg']);
  });

  it('renames the scene from ⌘K in its tab', async () => {
    await select([]);
    await runCommand('Rename Scene');
    await typeName('Rover', 'Scene name');

    await expect
      .poll(() => app.page.locator('[aria-label="Open scenes"] [role="tab"]').first().innerText())
      .toContain('Rover');
    expect(app.errors).toEqual([]);
  });

  it('makes a Case with ↩, then renames it from ⌘K and from its right-click menu', async () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
    const caseRow = (name: string) => app.page.locator(shown('[data-testid="cases-panel"] button'), { hasText: name });

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: arm.id,
      parts: arm.parts,
      project: { ...DEFAULT_PROJECT, joints: arm.joints },
    });
    await expect.poll(() => partCount(app.page)).toBe(arm.parts.length);
    await runCommand('New Case');
    await expect.poll(() => app.page.evaluate(() => document.activeElement?.textContent ?? '')).toBe('Make Case');
    await app.page.keyboard.press('Enter');
    await expect
      .poll(() => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().activeCase))
      .toMatch(/^touch-a-point/);

    await runCommand('Rename Case');
    await typeName('Touch Test');
    await expect.poll(() => caseRow('Touch Test').count()).toBe(1);

    await caseRow('Touch Test').click({ button: 'right' });
    await app.page.locator(shown('[role="menuitem"]:has-text("Rename")')).first().click();
    await expect.poll(() => renameField().inputValue()).toBe('Touch Test');
    await typeName('Bench Touch');
    await expect.poll(() => caseRow('Bench Touch').count()).toBe(1);
    expect(app.errors).toEqual([]);
  });
});
