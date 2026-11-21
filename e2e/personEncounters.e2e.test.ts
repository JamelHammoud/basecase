import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';
import { endTryAt } from './driveChecks';
import { personEncounterFixture } from '../src/cases/personEncounters.fixtures';
import { encodeSceneFile, sharedScene } from '../src/utils/sceneFile';
import { bytesToBase64 } from '../src/utils/base64';
import { supportSceneStorage } from './sketchSupport.helpers';

let app: App;

type Studio = {
  load: (scene: unknown) => void;
  dropFiles: (files: Array<{ name: string; base64: string }>) => Promise<void>;
  worldAt: () => Record<string, number[]>;
  simState: () => {
    activeCase: string | null;
    drive: string;
    tries: unknown[];
    timeline: { sought: number | null } | null;
  };
};

type StudioWindow = { __studio: Studio };

const state = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simState());

beforeEach(async () => {
  app = await openApp();
});

afterEach(async () => {
  await app?.close();
});

describe('crossing person encounters', () => {
  it(
    'authors a delayed crossing in a generated rover Case and saves its recorded encounter',
    { retry: 0 },
    async () => {
      const { page } = app;
      const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;

      await page.evaluate((scene) => (window as unknown as StudioWindow).__studio.load(scene), {
        name: 'Crossing rover',
        parts: rover.parts,
        project: { ...DEFAULT_PROJECT, joints: rover.joints },
      });
      await expect.poll(() => partCount(page)).toBe(rover.parts.length);
      await openPlayTab(page, 'Cases');
      await page.locator(shown('button'), { hasText: /^New Case$/ }).click();
      await page.getByTestId('new-case').getByRole('button', { name: 'Make Case' }).click();
      await expect.poll(async () => (await state()).activeCase).toBe('reach-a-spot');
      await page.locator(shown('button'), { hasText: /^Add Person$/ }).click();

      const editor = page.getByTestId('person-editor').first();

      await editor.getByLabel('Start').fill('1');
      await editor.getByLabel('Start').press('Enter');
      await editor.getByLabel('Waypoint 2 X').fill('1200');
      await editor.getByLabel('Waypoint 2 X').press('Enter');
      await page.locator(shown('button'), { hasText: /^Try It$/ }).click();
      await expect.poll(async () => (await state()).drive).toBe('on');
      await endTryAt(page, 3);
      await expect.poll(async () => (await state()).tries.length).toBe(1);
      await page.getByTestId('try-row').first().click();
      await expect.poll(async () => (await state()).timeline?.sought).toBe(0);
      await page.keyboard.press('End');
      await expect.poll(async () => (await state()).timeline?.sought).toBeGreaterThan(100);
      await page.keyboard.press('Escape');
      await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
      await page.locator(shown('[data-testid="library-tries"] button')).first().click();
      await page.locator(shown('[data-testid="try-tile"]')).first().click();
      await expect.poll(async () => (await state()).timeline?.sought).toBe(0);
      await expect
        .poll(() => page.evaluate(() => (window as unknown as StudioWindow).__studio.worldAt().person[0]))
        .toBe(-1000);
      await page.keyboard.press('End');
      await expect
        .poll(() => page.evaluate(() => (window as unknown as StudioWindow).__studio.worldAt().person[0]))
        .toBeGreaterThan(500);
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('Shift+ArrowRight');
      await expect.poll(async () => (await state()).timeline?.sought).toBe(100);
      await expect
        .poll(() => page.evaluate(() => Math.abs((window as unknown as StudioWindow).__studio.worldAt().person[0])))
        .toBeLessThan(20);
      expect(app.errors).toEqual([]);
    },
  );

  it('reopens a saved Case with its person dimensions, route and delayed start', { retry: 0 }, async () => {
    await supportSceneStorage(app.page);

    const fixture = personEncounterFixture(0);
    const saved = await encodeSceneFile(
      sharedScene({
        name: 'Saved crossing',
        globalGoal: '',
        parts: fixture.robot.parts,
        project: { ...DEFAULT_PROJECT, joints: fixture.robot.joints, cases: [fixture.kase] },
      }),
    );

    await app.page.evaluate((file) => (window as unknown as StudioWindow).__studio.dropFiles([file]), {
      name: 'crossing.basecase',
      base64: bytesToBase64(saved),
    });
    await expect.poll(() => partCount(app.page)).toBe(fixture.robot.parts.length);
    await openPlayTab(app.page, 'Cases');
    await app.page
      .locator(shown('[data-testid="cases-panel"] button'), { hasText: 'Kitchen crossing' })
      .first()
      .click();

    const editor = app.page.getByTestId('person-editor').first();

    await expect.poll(() => editor.getByLabel('Height').inputValue()).toBe('1100');
    expect(await editor.getByLabel('Start').inputValue()).toBe('0.2');
    expect(await editor.getByLabel('Waypoint 1 X').inputValue()).toBe('-1200');
    expect(await editor.getByLabel('Waypoint 3 X').inputValue()).toBe('1200');
    expect(app.errors).toEqual([]);
  });
});
