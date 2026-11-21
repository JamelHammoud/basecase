import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';
import { endTryAt } from './driveChecks';
import { personEncounterFixture } from '../src/cases/personEncounters.fixtures';
import { encodeSceneFile, sharedScene } from '../src/utils/sceneFile';
import { bytesToBase64 } from '../src/utils/base64';
import { supportSceneStorage } from './sketchSupport.helpers';
import { LAYOUT } from '../src/design-system/theme';
import type { Locator } from 'playwright-core';

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

async function narrowPersonFields(editor: Locator) {
  const { page } = app;
  const divider = page.locator(shown(`[role="separator"][aria-valuemin="${LAYOUT.rightPanelMin}"]`));
  const width = Number(await divider.getAttribute('aria-valuenow'));
  const box = (await divider.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + width - LAYOUT.rightPanelMin, box.y + box.height / 2);
  await page.mouse.up();
  await expect.poll(() => divider.getAttribute('aria-valuenow')).toBe(String(LAYOUT.rightPanelMin));
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const fields = [
    ['Width', '1000'],
    ['Height', '2400'],
    ['Depth', '800'],
    ['Speed', '3000'],
    ['Start', '600'],
    ['Waypoint 1 X', '-50000'],
    ['Waypoint 1 Z', '-50000'],
    ['Waypoint 1 pause', '10'],
  ];

  for (const [name, value] of fields) {
    const input = editor.getByLabel(name, { exact: true });

    await input.fill(value);

    const bounds = await input.evaluate((element) => {
      const input = element as HTMLInputElement;
      const field = input.parentElement!;
      const unit = field.lastElementChild!;
      const label = field.querySelector('span:not(:last-child)');
      const row = field.closest('label');
      const textLabel = label ?? row?.firstElementChild;
      const range = document.createRange();

      if (textLabel) range.selectNodeContents(textLabel);

      const style = getComputedStyle(input);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      const rect = input.getBoundingClientRect();
      const parent = field.closest('[data-testid="person-editor"]')!.getBoundingClientRect();
      const frame = field.getBoundingClientRect();
      const valueLeft = rect.left + parseFloat(style.paddingLeft);

      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

      return {
        labelRight: textLabel ? range.getBoundingClientRect().right : valueLeft - 4,
        valueLeft,
        valueRight: valueLeft + context.measureText(input.value).width,
        unitLeft: unit.getBoundingClientRect().left,
        contained: frame.left >= parent.left && frame.right <= parent.right,
        height: frame.height,
      };
    });

    expect(bounds.contained).toBe(true);
    expect(bounds.labelRight).toBeLessThanOrEqual(bounds.valueLeft - 4);
    expect(bounds.valueRight).toBeLessThanOrEqual(bounds.unitLeft - 4);
    expect(bounds.height).toBe(32);
    await input.press('Escape');
  }
}

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

      await narrowPersonFields(editor);
      await editor.getByLabel('Start').fill('1');
      await editor.getByLabel('Start').press('Enter');
      await editor.getByLabel('Waypoint 2 X').fill('1200');
      await editor.getByLabel('Waypoint 2 X').press('Enter');
      await page.locator(shown('button'), { hasText: /^Try It$/ }).click();
      await expect.poll(async () => (await state()).drive).toBe('on');
      expect(await editor.getByLabel('Start').isDisabled()).toBe(true);
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

  it('adds route points and confirms keyboard deletion without removing a person on cancel', { retry: 0 }, async () => {
    const { page } = app;
    const fixture = personEncounterFixture(0);

    await page.evaluate((scene) => (window as unknown as StudioWindow).__studio.load(scene), {
      name: 'Route editing',
      parts: fixture.robot.parts,
      project: { ...DEFAULT_PROJECT, joints: fixture.robot.joints, cases: [fixture.kase] },
    });
    await expect.poll(() => partCount(page)).toBe(fixture.robot.parts.length);
    await openPlayTab(page, 'Cases');
    await page.locator(shown('[data-testid="cases-panel"] button'), { hasText: fixture.kase.name }).first().click();

    const editor = page.getByTestId('person-editor').first();

    await editor.getByRole('button', { name: 'Add Waypoint', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => editor.getByLabel('Waypoint 4 X').count()).toBe(1);
    await editor.getByRole('button', { name: 'Delete', exact: true }).last().click();

    const waypoint = page.getByRole('dialog', { name: 'Delete waypoint 4?' });

    await waypoint.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await editor.getByLabel('Waypoint 4 X').count()).toBe(1);
    await editor.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await waypoint.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => editor.getByLabel('Waypoint 4 X').count()).toBe(0);
    await editor.getByRole('button', { name: 'Delete', exact: true }).first().click();

    const person = page.getByRole('dialog', { name: 'Delete Person 1?' });

    await person.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await page.getByTestId('person-editor').count()).toBe(1);
    await editor.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await person.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => page.getByTestId('person-editor').count()).toBe(0);
    expect(await page.locator(shown('button'), { hasText: /^Add Person$/ }).isEnabled()).toBe(true);
    expect(app.errors).toEqual([]);
  });

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
