import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { box } from '../src/sim/fixtures/parts';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../src/types/robotics';
import { openApp, shown, type App } from './harness';

interface StudioHook {
  load: (record: { parts: ScenePart[]; project: ProjectSettings }) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
}

type Studio = { __studio: StudioHook };

let app: App;

const record = () => app.page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord());

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Lighten', () => {
  it('opens Lighten from the part menu and cancels without changing the part', async () => {
    const source = box('bracket', [0, 10, 0], [20, 10, 6], 2);
    const scene = { parts: [source], project: DEFAULT_PROJECT };

    await app.page.evaluate((seed) => (window as unknown as Studio).__studio.load(seed), scene);
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).first().click();
    await app.page
      .locator(shown(`[data-layer-row="part:${source.id}"]`))
      .first()
      .click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Lighten', exact: true }).click();

    const sheet = app.page.locator(shown('[role="dialog"][aria-label="Lighten"]'));

    expect(await sheet.getByLabel('Target mass').inputValue()).toBe('50');
    await sheet.getByRole('button', { name: 'Expert' }).click();
    expect(await sheet.getByLabel('Min. wall').inputValue()).toBe('1.5');
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect.poll(() => sheet.count()).toBe(0);
    expect((await record()).parts).toEqual([source]);
    expect(app.errors).toEqual([]);
  }, 15000);
});
