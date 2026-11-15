import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COXA, coxaScene } from '../src/strength/fixtures/coxa';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import { openApp, shown, type App } from './harness';

interface StudioHook {
  load: (record: { parts: ScenePart[]; project: ProjectSettings }) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  partTriangles: (id: string) => number[];
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
  it('lightens from the part menu and restores the original part with one undo', async () => {
    const scene = coxaScene();
    const source = scene.parts.find((part) => part.id === COXA)!;
    const triangles = () =>
      app.page.evaluate((id) => (window as unknown as Studio).__studio.partTriangles(id), source.id);

    await app.page.evaluate((seed) => (window as unknown as Studio).__studio.load(seed), scene);
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).first().click();
    await expect.poll(async () => (await triangles()).length).toBeGreaterThan(0);

    const before = await triangles();

    await app.page
      .locator(shown(`[data-layer-row="part:${source.id}"]`))
      .first()
      .click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Lighten', exact: true }).click();

    const sheet = app.page.locator(shown('[role="dialog"][aria-label="Lighten"]'));

    expect(await sheet.getByLabel('Target mass').inputValue()).toBe('50');
    await sheet.getByRole('button', { name: 'Expert' }).click();
    expect(await sheet.getByLabel('Min. wall').inputValue()).toBe('1.5');
    await sheet.getByRole('button', { name: 'Lighten', exact: true }).click();
    await expect.poll(async () => (await record()).parts.find((part) => part.id === COXA)?.kind).toBe('sculpt_mesh');

    const changed = (await record()).parts.find((part) => part.id === COXA)!;

    expect(changed.sculptMesh!.positions.length).toBeGreaterThan(0);
    await expect.poll(() => sheet.count()).toBe(0);
    await app.page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await record()).parts.find((part) => part.id === COXA)).toEqual(source);
    await expect.poll(triangles).toEqual(before);
    expect(app.errors).toEqual([]);
  }, 15000);
});
