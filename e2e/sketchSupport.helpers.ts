import type { Page } from 'playwright-core';
import type { SavedSceneRecord, ScenePart } from '../src/types/robotics';
import { shown } from './harness';

interface SketchStudio {
  load: (record: { parts: ScenePart[]; name?: string }) => void;
  sceneRecord: () => { parts: ScenePart[] };
  triangleCount: (id: string) => number;
  partTriangles: (id: string) => number[];
  project: (points: Array<[number, number, number]>) => Array<{ x: number; y: number; visible: boolean }>;
  pickFiles: (files: Array<{ name: string; base64: string }>) => void;
  lastDownload: () => { name: string; base64: string } | null;
}

type StudioWindow = { __studio: SketchStudio };

export async function supportSceneStorage(page: Page) {
  const saved = new Map<string, SavedSceneRecord>();

  await page.route(/\/api\/bridge\/(scene|save-scene)(\?|$)/, async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith('/save-scene')) {
      const record = route.request().postDataJSON() as SavedSceneRecord;
      const stored = { ...record, updatedAt: new Date().toISOString(), partCount: record.parts.length };

      saved.set(record.id, stored);
      await route.fulfill({ json: stored });

      return;
    }

    await route.fulfill({ json: saved.get(url.searchParams.get('id') ?? '') ?? null });
  });
}

export const supportParts = (page: Page) =>
  page.evaluate(() => (window as unknown as StudioWindow).__studio.sceneRecord().parts);
export const supportFeature = async (page: Page) => (await supportParts(page)).find((p) => p.sketch)!;
export const supportPlane = (page: Page) => page.locator(shown('[data-testid="sketch-plane"]'));

export async function supportCommand(page: Page, name: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
}

export async function loadSupportScene(page: Page, parts: ScenePart[]) {
  await page.evaluate(
    (input) => (window as unknown as StudioWindow).__studio.load({ parts: input, name: 'Rover deck' }),
    parts,
  );
  await page.waitForFunction((id) => (window as unknown as StudioWindow).__studio.triangleCount(id) > 0, parts[0].id);
}

export async function clickSupportPoint(page: Page, point: [number, number, number], double = false) {
  const projected = await page.evaluate((p) => (window as unknown as StudioWindow).__studio.project([p])[0], point);
  const box = (await page.locator(shown('.canvas-cursor')).first().boundingBox())!;

  if (double) await page.mouse.dblclick(box.x + projected.x, box.y + projected.y);
  else await page.mouse.click(box.x + projected.x, box.y + projected.y);
}

export async function setSupportEdgeOffset(page: Page) {
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();

  const locations = await supportPlane(page)
    .locator(':scope > svg')
    .evaluate((svg: SVGSVGElement) => {
      const corner = svg.querySelector('circle')!;
      const edge = svg.querySelectorAll<SVGPathElement>('path[stroke-dasharray]')[3];
      const a = new DOMPoint(Number(corner.getAttribute('cx')), Number(corner.getAttribute('cy')));
      const b = edge.getPointAtLength(edge.getTotalLength() / 2);
      const pixel = (p: DOMPoint) => {
        const result = p.matrixTransform(svg.getScreenCTM()!);

        return { x: result.x, y: result.y };
      };

      return { corner: pixel(a), edge: pixel(new DOMPoint(b.x, b.y)), distance: Math.abs(a.x - b.x) };
    });

  await page.mouse.click(locations.corner.x, locations.corner.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(locations.edge.x, locations.edge.y);
  await page.keyboard.up('Shift');
  await page.getByRole('button', { name: 'Distance', exact: true }).click();
  await supportPlane(page)
    .getByRole('button', { name: String(Number(locations.distance.toFixed(2))), exact: true })
    .last()
    .click();
  await supportPlane(page).locator('input').fill('8');
  await supportPlane(page).locator('input').press('Enter');
}

export async function drawSupportMount(page: Page) {
  await supportCommand(page, 'Sketch');
  await supportPlane(page).waitFor();
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();

  const box = (await supportPlane(page).boundingBox())!;

  await page.mouse.click(box.x + box.width * 0.32, box.y + box.height * 0.6);
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.4);
  await page.keyboard.type('40');
  await page.keyboard.press('Tab');
  await page.keyboard.type('20');
  await page.keyboard.press('Enter');
  await setSupportEdgeOffset(page);
  await supportField(page, 'Thickness', '5');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}

export async function supportField(page: Page, name: string, value: string) {
  const field = page.locator(shown(`input[aria-label="${name}"]`));

  await field.fill(value);
  await field.press('Enter');
}

export const supportTriangles = (page: Page, id: string) =>
  page.evaluate((partId) => (window as unknown as StudioWindow).__studio.partTriangles(partId), id);
export const supportDownload = (page: Page) =>
  page.evaluate(() => (window as unknown as StudioWindow).__studio.lastDownload());
export const pickSupportFile = (page: Page, file: { name: string; base64: string }) =>
  page.evaluate((input) => (window as unknown as StudioWindow).__studio.pickFiles([input]), file);
