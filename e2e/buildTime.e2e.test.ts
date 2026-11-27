import { afterAll, beforeAll, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import { isPrinted } from '../src/utils/bom';
import { openApp, partCount, type App } from './harness';
import { visible } from './buildCheckFixtures';

interface TimeStudio {
  load: (record: { parts: ScenePart[]; project: Partial<ProjectSettings> }) => void;
  select: (ids: string[]) => void;
  selection: () => string[];
  buildTime: () => { hours: number; status: string } | null;
}

let app: App;

beforeAll(async () => {
  app = await openApp();
});

afterAll(async () => {
  await app?.close();
});

it('holds the rover to an hours budget and updates after deleting a printed part', async () => {
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;

  await app.page.evaluate((robot) => {
    const studio = (window as unknown as { __studio: TimeStudio }).__studio;

    studio.load({ parts: robot.parts, project: { joints: robot.joints } });
  }, rover);
  await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();

  const budget = app.page.getByRole('textbox', { name: 'Time budget' });
  const row = app.page.locator(visible('[data-check=Time]'));
  const reading = () => app.page.evaluate(() => (window as unknown as { __studio: TimeStudio }).__studio.buildTime());

  await budget.fill('1');
  await budget.press('Enter');
  await expect.poll(() => row.getAttribute('data-status')).toBe('fail');

  const before = (await reading())!.hours;
  const printed = rover.parts.find(isPrinted)!;

  await app.page.locator(visible('canvas')).first().click();
  await app.page.evaluate((id) => (window as unknown as { __studio: TimeStudio }).__studio.select([id]), printed.id);
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as { __studio: TimeStudio }).__studio.selection()))
    .toEqual([printed.id]);
  await app.page.keyboard.press('Backspace');
  await expect.poll(() => partCount(app.page)).toBe(rover.parts.length - 1);
  await expect.poll(async () => (await reading())?.hours ?? before).toBeLessThan(before);
  await budget.fill('1000');
  await budget.press('Enter');
  await expect.poll(() => row.getAttribute('data-status')).toBe('pass');
  expect(app.errors).toEqual([]);
});

it('keeps the time label clear of its value and unit', async () => {
  await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();

  const budget = app.page.getByRole('textbox', { name: 'Time budget' });

  await budget.fill('1000');
  await budget.press('Enter');

  const layout = await budget.evaluate((element) => {
    const input = element as HTMLInputElement;
    const field = input.parentElement!;
    const label = [...field.querySelectorAll('span')].find(
      (span) => span.textContent === 'Time' && span.childElementCount === 0,
    )!;
    const unit = [...field.querySelectorAll('span')].find((span) => span.textContent === 'h')!;
    const range = document.createRange();

    range.selectNodeContents(label);

    const text = range.getBoundingClientRect();
    const value = input.getBoundingClientRect();
    const suffix = unit.getBoundingClientRect();
    const style = getComputedStyle(input);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;

    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    return {
      labelRight: text.right,
      valueLeft: value.left + parseFloat(style.paddingLeft),
      valueRight: value.left + parseFloat(style.paddingLeft) + context.measureText(input.value).width,
      unitLeft: suffix.left,
      height: value.height,
    };
  });

  expect(layout.labelRight).toBeLessThanOrEqual(layout.valueLeft - 4);
  expect(layout.valueRight).toBeLessThanOrEqual(layout.unitLeft - 4);
  expect(layout.height).toBe(32);
});
