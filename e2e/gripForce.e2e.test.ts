import { afterEach, beforeEach, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

interface Studio {
  load: (scene: unknown) => void;
  caseRunSpeed: (speed: number) => void;
  gripForceEvidence: () => { passed: boolean | null; force: number[]; peaks: number[]; evidence: unknown };
  simState: () => { drive: string; tries: Array<{ id: string; passed: boolean }>; timeline: unknown };
}

let app: App;
const state = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

beforeEach(async () => {
  app = await openApp();
});
afterEach(async () => app?.close());

it('authors a grip ceiling and reopens the retained force trace and verdict', async () => {
  const robot = fixtureRobots().find((arm) => arm.id === 'arm-6dof')!;
  const { page } = app;

  await page.evaluate((scene) => (window as unknown as { __studio: Studio }).__studio.load(scene), {
    name: 'Force-limited grasp',
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(page)).toBe(robot.parts.length);
  await openPlayTab(page, 'Cases');
  await page.locator(shown('button'), { hasText: 'New Case' }).first().click();

  const builder = page.locator(shown('[data-testid="new-case"]'));

  await builder.getByRole('radio', { name: 'Pick Up a Block', exact: true }).click();
  await builder.getByRole('switch', { name: 'Limit grip force' }).click();
  await builder.getByLabel('Grip force ceiling').fill('20');
  await builder.getByLabel('Grip force ceiling').press('Enter');
  await builder.getByRole('button', { name: 'Make Case', exact: true }).click();
  await page.locator(shown('button'), { hasText: 'Try Reference' }).first().click();
  await expect.poll(async () => (await state()).drive).toBe('on');
  await page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.caseRunSpeed(4));
  await expect.poll(async () => (await state()).tries.length).toBe(1);
  expect((await state()).tries[0].passed).toBe(true);
  await page.locator(shown('[data-testid="try-row"]')).first().click();
  await expect.poll(async () => (await state()).timeline).not.toBeNull();

  const evidence = await page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.gripForceEvidence());

  expect(evidence.passed).toBe(true);
  expect(Math.max(...evidence.force)).toBeGreaterThan(0);
  expect(Math.max(...evidence.peaks)).toBeLessThanOrEqual(20);
  expect(evidence.evidence).not.toBeNull();
  expect(await page.getByTestId('trace-probe.gripForcePeak').getAttribute('d')).toBeTruthy();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await page.locator(shown('[data-testid="library-tries"] button')).first().click();
  await page.locator(shown('[data-testid="try-tile"]')).first().click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.gripForceEvidence()))
    .toEqual(evidence);
  expect(app.errors).toEqual([]);
});
