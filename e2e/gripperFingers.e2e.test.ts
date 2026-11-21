import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';
import { supportCommand } from './sketchSupport.helpers';
import { fingerFixtures } from '../src/gripperFingers/fixtures';
import { generateFingers } from '../src/gripperFingers/generate';
import { selectedPickTargets } from '../src/cases/selectedPick.fixtures';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import type { RenderedCad } from '../src/utils/platform/types';

interface Kernel {
  renderPart: (language: string, code: string) => Promise<RenderedCad>;
  stopKernels: () => void;
}

interface Studio {
  load: (record: unknown) => void;
  simState: () => { activeCase: string | null; tries: Array<{ id: string; passed: boolean }>; timeline: unknown };
  graspEvidence: () => { target: string | null; passed: boolean; gripFrames: number; contactPairs: number };
  caseRunSpeed: (speed: number) => void;
}

type StudioWindow = { __studio: Studio };

const load = (name: string) => import(/* @vite-ignore */ name);
const { createNodeKernel } = await load(new URL('../electron/cad-kernel/nodeHost/client.mjs', import.meta.url).href);
const kernel: Kernel = createNodeKernel();
const compile = (code: string) => kernel.renderPart('openscad', code);
const target = { ...selectedPickTargets()[5], name: 'Cylinder' };
let generated: Awaited<ReturnType<typeof generateFingers>>;
let app: App;

beforeAll(async () => {
  const source = await fingerFixtures(compile);

  generated = await generateFingers(
    { ...source, parts: [...source.parts, target], target: target.id, style: 'v' },
    { compile, current: () => true },
  );
});
beforeEach(async () => {
  app = await openApp();
  await app.page.route('**/api/bridge/cad-render', async (route) =>
    route.fulfill({ json: await compile(route.request().postDataJSON().code) }),
  );
});
afterEach(async () => app?.close());
afterAll(() => kernel.stopKernels());

async function selectPart(name: string) {
  const layers = app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]'));

  if ((await layers.getAttribute('aria-pressed')) !== 'true') await layers.click();

  const row = app.page.locator(shown('[data-layer-row]')).filter({ hasText: name }).first();

  await row.click();
}

it('runs the selected-cylinder reference and opens its saved grasp evidence', async () => {
  await app.page.evaluate((seed) => (window as unknown as StudioWindow).__studio.load(seed), {
    name: 'Gripper grasp',
    parts: generated.parts,
    project: { ...DEFAULT_PROJECT, joints: generated.joints, designParameters: generated.parameters },
  });
  await app.page.waitForFunction(() => performance.getEntriesByName('parameters:commit').length > 0);
  await selectPart('Cylinder');
  await supportCommand(app.page, 'Test Grasp');
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simState().activeCase))
    .not.toBeNull();
  await app.page.evaluate(() => (window as unknown as StudioWindow).__studio.caseRunSpeed(4));
  await supportCommand(app.page, 'Try Reference');
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simState().tries.length))
    .toBe(1);
  await app.page.locator(shown('[data-testid="try-row"]')).first().click();
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.graspEvidence().target))
    .toBe(target.id);

  const evidence = await app.page.evaluate(() => (window as unknown as StudioWindow).__studio.graspEvidence());

  expect(evidence.passed).toBe(true);
  expect(evidence.gripFrames).toBeGreaterThan(0);
  expect(evidence.contactPairs).toBeGreaterThan(0);
  expect(app.errors).toEqual([]);
});
