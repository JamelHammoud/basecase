import { afterEach, describe, expect, it } from 'vitest';
import { studyQuad } from '../src/sim/fixtures/studyQuad';
import type { StudyKnob, StudyRecord } from '../src/study/types';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

interface StudioHook {
  load: (record: { name: string; parts: ScenePart[]; project: ProjectSettings }) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  configureStudy: (knobs: StudyKnob[]) => void;
  studyState: () => { record: StudyRecord | null; preview: string | null; running: boolean };
}

let app: App | undefined;

afterEach(async () => app?.close());

describe('Study', () => {
  it('grades a two by three quadruped study from commands and applies its complete design in one undo step', async () => {
    app = await openApp();

    const { page } = app;
    const robot = studyQuad();
    const { knobs } = robot;

    await page.evaluate(
      ({ parts, joints, knobs }) => {
        const hook = (window as unknown as { __studio: StudioHook }).__studio;

        hook.load({ name: 'Study quadruped', parts, project: { ...hook.sceneRecord().project, joints } });
        hook.configureStudy(knobs);
      },
      { parts: robot.parts, joints: robot.joints, knobs },
    );
    await expect.poll(() => partCount(page)).toBe(robot.parts.length);
    await page.keyboard.press('Meta+k');
    await page.getByLabel('Search commands').fill('Study');
    await page
      .locator(shown('button[data-idx]'))
      .filter({ hasText: /^Study$/ })
      .click();
    await page.getByRole('button', { name: 'Run Study', exact: true }).click();

    const rows = page.getByRole('table', { name: 'Study designs' }).locator('[data-testid="study-row"]');

    await expect.poll(() => rows.count()).toBe(6);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = (window as unknown as { __studio: StudioHook }).__studio.studyState();

          return state.record?.rows.every((r) => !r.error && r.checks.length > 0) && !state.running;
        }),
      )
      .toBe(true);

    const point = page.getByTestId('study-point').first();
    const bounds = await point.boundingBox();

    expect(bounds?.width).toBeGreaterThanOrEqual(28);
    expect(bounds?.height).toBeGreaterThanOrEqual(28);
    await point.focus();
    await point.press('Enter');
    expect(await point.getAttribute('aria-pressed')).toBe('true');
    await rows.first().click();

    for (let index = 0; index < 5; index++) await rows.nth(index).click({ modifiers: ['Shift'] });

    expect(await page.locator('[data-testid="study-compare"] [data-testid="study-row"]').count()).toBe(4);
    await rows.first().click();

    const before = await page.evaluate(() => (window as unknown as { __studio: StudioHook }).__studio.sceneRecord());
    const other = rows.filter({ hasText: /1\.25× long/ }).filter({ hasText: /1\.5× wide/ });

    await other.hover();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __studio: StudioHook }).__studio.studyState().preview))
      .not.toBeNull();
    await other.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          (ids) =>
            (window as unknown as { __studio: StudioHook }).__studio
              .sceneRecord()
              .parts.filter((part) => ids.includes(part.id))
              .map((part) => part.dimensions),
          robot.feet,
        ),
      )
      .toEqual(robot.feet.map(() => ({ width: 45, height: 8, depth: 56.25 })));
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Meta+z');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __studio: StudioHook }).__studio.sceneRecord()))
      .toEqual(before);
    expect(app.errors).toEqual([]);
  });
});
