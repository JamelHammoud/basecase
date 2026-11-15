import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findPort, worldPort } from '../src/agent/ports';
import { shapeKey } from '../src/print/shapeKey';
import { COXA, coxaScene } from '../src/strength/fixtures/coxa';
import { measureTriangles } from '../src/three/meshMeasure';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import { filamentGrams } from '../src/utils/bom';
import type { CheckRow } from '../src/utils/engineeringTypes';
import { openApp, shown, type App } from './harness';
import { lightenTimings, recordLightenTiming, waitForLighten } from './lightenWorker';

interface StudioHook {
  load: (record: { parts: ScenePart[]; project: ProjectSettings }) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  partTriangles: (id: string) => number[];
  lightenState: () => { partId: string | null; busy: boolean; problem: string | null };
  lightenChecks: () => Promise<CheckRow[]>;
}

type Studio = { __studio: StudioHook };

let app: App;

const record = () => app.page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord());
const triangles = () => app.page.evaluate((id) => (window as unknown as Studio).__studio.partTriangles(id), COXA);

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Lighten', () => {
  it('lightens a loaded printed part from its menu, keeps its mounts and undoes the geometry in one step', async () => {
    const scene = coxaScene(100);
    const source = scene.parts.find((p) => p.id === COXA)!;

    await app.page.evaluate((seed) => (window as unknown as Studio).__studio.load(seed), scene);
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).first().click();
    await expect.poll(async () => (await triangles()).length).toBeGreaterThan(0);

    const before = await triangles();
    const originalMeasure = measureTriangles(new Float32Array(before));
    const originalGrams = filamentGrams(originalMeasure, 'PLA', scene.project.infillPct);
    const originalChecks = await app.page.evaluate(() => (window as unknown as Studio).__studio.lightenChecks());

    expect(originalChecks.some((row) => row.check === 'Strength')).toBe(true);

    await app.page
      .locator(shown(`[data-layer-row="part:${COXA}"]`))
      .first()
      .click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Lighten', exact: true }).click();

    const sheet = app.page.locator(shown('[role="dialog"][aria-label="Lighten"]'));

    expect(await sheet.getByLabel('Target mass').inputValue()).toBe('50');
    await recordLightenTiming(app.page);
    await sheet.getByRole('button', { name: 'Lighten', exact: true }).click();
    await waitForLighten(app.page);
    await expect.poll(async () => (await record()).parts.find((p) => p.id === COXA)?.kind).toBe('sculpt_mesh');

    const changed = (await record()).parts.find((p) => p.id === COXA)!;
    const after = await triangles();
    const portName = source.cad!.ports![0].name;

    const changedMeasure = measureTriangles(new Float32Array(after));
    const grams = filamentGrams(changedMeasure, 'PLA', scene.project.infillPct);
    const timings = await lightenTimings(app.page);

    expect(timings).toHaveLength(1);
    expect(timings[0]).toBeLessThanOrEqual(20000);
    console.log(`Lighten 100 mm coxa worker: ${timings[0].toFixed(1)} ms`);
    expect(changedMeasure.volumeMm3).toBeLessThanOrEqual(originalMeasure.volumeMm3 * 0.7);
    expect(grams).toBeLessThanOrEqual(originalGrams * 0.7);
    expect(changed.id).toBe(source.id);
    expect(changed.mates).toEqual(source.mates);
    expect(worldPort(changed, findPort(changed, portName)!)).toEqual(worldPort(source, findPort(source, portName)!));
    expect(shapeKey(changed)).not.toBe(shapeKey(source));
    expect((await record()).project.joints).toEqual(scene.project.joints);

    await app.page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await record()).parts.find((p) => p.id === COXA)).toEqual(source);
    await expect.poll(triangles).toEqual(before);
    expect(await app.page.evaluate(() => (window as unknown as Studio).__studio.lightenChecks())).toEqual(
      originalChecks,
    );
    expect(app.errors).toEqual([]);
  }, 30000);
});
