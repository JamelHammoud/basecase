import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, type App } from './harness';
import { supportDesign } from '../src/utils/sketch/fixtures/supportDesigns';
import {
  clickSupportPoint,
  drawSupportMount,
  loadSupportScene,
  pickSupportFile,
  supportCommand,
  supportDownload,
  supportFeature,
  supportField,
  supportParts,
  supportPlane,
  supportSceneStorage,
  supportTriangles,
} from './sketchSupport.helpers';

let app: App;

beforeAll(async () => {
  app = await openApp();
  await supportSceneStorage(app.page);
});
afterAll(async () => {
  await app?.close();
});

describe('persistent face Sketch through ordinary editing', () => {
  it('creates on a canvas-picked generated deck, follows Inspector edits, undoes, redoes and reopens the actual file', async () => {
    const { source } = supportDesign(0);

    await loadSupportScene(app.page, [source]);
    await clickSupportPoint(app.page, [60, 3, 30]);
    await drawSupportMount(app.page);
    await expect.poll(async () => (await supportFeature(app.page))?.sketch?.support?.partId).toBe(source.id);

    const original = await supportFeature(app.page);

    expect(original.sketch!.sketch.constraints.find((c) => c.kind === 'distance')).toMatchObject({ value: 8 });

    await clickSupportPoint(app.page, [60, 3, 30]);
    await supportField(app.page, 'Height (Y)', '14');
    await expect.poll(async () => (await supportFeature(app.page))?.position[1]).toBeCloseTo(9.5);
    await supportField(app.page, 'Width (X)', '200');
    await expect.poll(async () => (await supportFeature(app.page))?.position[0]).toBeCloseTo(original.position[0] - 20);

    const resized = await supportFeature(app.page);

    await supportField(app.page, 'Position X', '25');
    await expect.poll(async () => (await supportFeature(app.page))?.position[0]).toBeCloseTo(resized.position[0] + 25);

    const changed = await supportFeature(app.page);

    const authored = changed.sketch!.sketch.points.filter((p) => !p.fixed);

    expect(authored[0].x + 100).toBeCloseTo(8);
    expect(changed.sketch!.sketch.constraints.find((c) => c.kind === 'distance')).toMatchObject({ value: 8 });
    expect(changed.dimensions).toMatchObject({ width: 40, height: 5, depth: 20 });

    const undoPositions = [resized.position, [original.position[0], 9.5, original.position[2]], original.position];

    for (const position of undoPositions) {
      await app.page.keyboard.press('ControlOrMeta+z');
      await expect.poll(async () => (await supportFeature(app.page))?.position).toEqual(position);
    }

    expect((await supportParts(app.page))[0].dimensions).toEqual(source.dimensions);

    for (const position of [...undoPositions.slice(0, 2).toReversed(), changed.position]) {
      await app.page.keyboard.press('ControlOrMeta+Shift+z');
      await expect.poll(async () => (await supportFeature(app.page))?.position).toEqual(position);
    }

    await supportCommand(app.page, 'Export Scene');
    await expect.poll(() => supportDownload(app.page)).not.toBeNull();

    const file = (await supportDownload(app.page))!;

    const tabs = await app.page.locator('[data-tab-close]').count();

    await pickSupportFile(app.page, file);
    await supportCommand(app.page, 'Open Scene File');
    await expect.poll(() => app.page.locator('[data-tab-close]').count()).toBe(tabs + 1);
    await expect.poll(async () => (await supportFeature(app.page))?.sketch?.support?.partId).toBe(source.id);
    await expect.poll(async () => (await supportTriangles(app.page, changed.id)).length).toBeGreaterThan(0);
    expect((await supportFeature(app.page)).position).toEqual(changed.position);

    const triangles = await supportTriangles(app.page, changed.id);

    for (const [axis, span] of [40, 5, 20].entries()) {
      const values = triangles.filter((_, i) => i % 3 === axis);

      expect(Math.max(...values) - Math.min(...values)).toBeCloseTo(span, 4);
    }

    expect((await supportFeature(app.page)).sketch!.sketch.points.filter((p) => !p.fixed)).toEqual(authored);
    expect(app.errors).toEqual([]);
  });

  it('retains geometry after deletion and resolves only after explicit face selection', async () => {
    const { source } = supportDesign(0);
    const replacement = {
      ...source,
      id: 'replacement',
      name: 'Replacement deck',
      position: [0, -30, 0] as [number, number, number],
    };

    await loadSupportScene(app.page, [source, replacement]);
    await clickSupportPoint(app.page, [60, 3, 30]);
    await drawSupportMount(app.page);
    await expect.poll(async () => (await supportFeature(app.page))?.sketch?.support?.partId).toBe(source.id);

    const before = await supportFeature(app.page);

    await clickSupportPoint(app.page, [60, 3, 30]);
    await app.page.keyboard.press('Backspace');
    await expect.poll(async () => (await supportFeature(app.page))?.sketch?.support?.issue).toBe('missing');
    expect((await supportFeature(app.page)).position).toEqual(before.position);
    expect((await supportFeature(app.page)).sketch!.support!.partId).toBe(source.id);
    await supportCommand(app.page, 'Show Build');
    await app.page.locator('[data-check="Sketch"][data-status="fail"] button').first().click();
    await app.page
      .getByText(/supporting part was removed/)
      .first()
      .waitFor();
    await clickSupportPoint(app.page, [before.position[0], before.position[1] + 2.5, before.position[2]], true);
    await supportPlane(app.page).waitFor();
    await app.page.getByRole('button', { name: 'Select Face', exact: true }).click();
    await clickSupportPoint(app.page, [60, -27, 30]);
    await expect.poll(async () => (await supportFeature(app.page))?.sketch?.support?.partId).toBe(replacement.id);
    await expect.poll(async () => (await supportFeature(app.page))?.sketch?.support?.issue).toBeUndefined();
    expect((await supportFeature(app.page)).position[1]).toBeCloseTo(-24.5);
    expect(app.errors).toEqual([]);
  });
});
