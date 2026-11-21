import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';
import { supportCommand, supportParts } from './sketchSupport.helpers';
import { assertFingerParameterLayout } from './gripperFingers.helpers';
import { fingerFixtures } from '../src/gripperFingers/fixtures';
import { generateFingers } from '../src/gripperFingers/generate';
import { selectedPickTargets } from '../src/cases/selectedPick.fixtures';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import type { RenderedCad } from '../src/utils/platform/types';
import type { FixtureRobot } from '../src/sim/fixtures/parts';
import { readFinger } from '../src/gripperFingers/dimensions';

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
let fixture: FixtureRobot;
let app: App;

beforeAll(async () => {
  fixture = await fingerFixtures(compile);

  generated = await generateFingers(
    { ...fixture, parts: [...fixture.parts, target], target: target.id, style: 'v' },
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

it.each([
  { command: 'Make Flat Fingers', v: 0 },
  { command: 'Make V Fingers', v: 1 },
])('generates editable fingers through $command with readable parameter fields', async ({ command, v }) => {
  await app.page.evaluate((seed) => (window as unknown as StudioWindow).__studio.load(seed), {
    name: 'Finger design',
    parts: [
      ...fixture.parts,
      target,
      {
        ...fixture.parts.find((part) => part.id === 'finger_left')!,
        id: 'spare',
        name: 'Spare carriage',
        position: [2000, 20, 0],
      },
    ],
    project: { ...DEFAULT_PROJECT, joints: fixture.joints },
  });

  const row = app.page.locator(shown('[data-layer-row]')).filter({ hasText: 'Cylinder' }).first();

  await selectPart('Spare carriage');
  await row.click({ modifiers: ['ControlOrMeta'] });
  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.getByRole('textbox', { name: 'Search commands' }).fill(command);
  expect(await app.page.getByRole('button', { name: command, exact: true }).count()).toBe(0);
  await app.page.keyboard.press('Escape');
  await selectPart(fixture.parts.find((part) => part.id === 'finger_left')!.name);
  await row.click({ modifiers: ['ControlOrMeta'] });
  await supportCommand(app.page, command);
  await expect.poll(async () => (await supportParts(app.page)).filter((part) => part.gripperFinger).length).toBe(14);

  const input = app.page.locator(shown('input[aria-label="finger_length"]'));

  await input.fill('30');
  await input.press('Enter');
  await expect
    .poll(async () =>
      (await supportParts(app.page))
        .filter((part) => part.gripperFinger?.role === 'finger')
        .map((part) => ({ length: readFinger(part)?.length, v: readFinger(part)?.v })),
    )
    .toEqual([
      { length: 30, v },
      { length: 30, v },
    ]);
  await assertFingerParameterLayout(app.page);
  expect(app.errors).toEqual([]);
});

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
