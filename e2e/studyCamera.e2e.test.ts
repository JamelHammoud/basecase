import { afterEach, expect, it } from 'vitest';
import { visibilityDesign } from '../src/study/visibilityFixtures';
import type { StudyRecord } from '../src/study/types';
import type { ScenePart, ProjectSettings } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

interface StudyHook {
  load: (record: { id: string; name: string; parts: ScenePart[]; project: ProjectSettings }) => void;
  keepStudyTry: () => Promise<string>;
  configureStudy: (knobs: StudyRecord['knobs']) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  studyState: () => { record: StudyRecord | null; preview: string | null; running: boolean };
}

let app: App | undefined;

afterEach(async () => app?.close());

it(
  'compares two rover camera orientations from Study, previews and applies visibility, then undoes the edit',
  { retry: 0 },
  async () => {
    app = await openApp();

    const { page } = app;
    const design = visibilityDesign(0);
    const parts = design.parts.map((part) =>
      part.id === 'eye' ? { ...part, rotation: [-90, 0, 0] as [number, number, number] } : part,
    );

    await page.evaluate(
      ({ parts, project }) => {
        const hook = (window as unknown as { __studio: StudyHook }).__studio;

        hook.load({ id: 'camera-study', name: 'Camera rover', parts, project });
      },
      { parts, project: design.project },
    );
    await expect.poll(() => partCount(page)).toBe(parts.length);

    await page.getByTestId('camera-strip').getByRole('button', { name: 'Collapse', exact: true }).click();

    const tryId = await page.evaluate(async () => {
      const hook = (window as unknown as { __studio: StudyHook }).__studio;
      const id = await hook.keepStudyTry();
      const eye = hook.sceneRecord().parts.find((part) => part.id === 'eye')!;

      hook.configureStudy([
        {
          id: 'eye-pose',
          label: 'Camera pose',
          kind: 'camera_pose',
          part: eye.id,
          values: [{ position: eye.position, rotation: eye.rotation }],
        },
      ]);

      return id;
    });

    await page.keyboard.press('Meta+k');
    await page.getByLabel('Search commands').fill('Study');
    await page
      .locator(shown('button[data-idx]'))
      .filter({ hasText: /^Study$/ })
      .click();
    await page.getByRole('combobox', { name: 'Try', exact: true }).selectOption(tryId);
    await page
      .getByRole('textbox', { name: 'Camera pose values' })
      .fill('-2.47 200 5.12 -90 0 0, -2.47 200 5.12 90 0 0');
    await page.getByRole('button', { name: 'Run Study', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = (window as unknown as { __studio: StudyHook }).__studio.studyState();

          return !state.running && state.record?.rows.map((row) => row.visibility?.coverage);
        }),
      )
      .toEqual([0, 0.5]);

    const before = await page.evaluate(() => (window as unknown as { __studio: StudyHook }).__studio.sceneRecord());
    const record = before.project.study!;
    const better = page
      .getByRole('table', { name: 'Study designs' })
      .getByTestId('study-row')
      .filter({ hasText: /200 5\.12 mm \/ 90 0 0°/ });

    await better.click();
    await expect.poll(() => better.getByTestId('study-visibility').count()).toBe(1);
    await better.hover();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __studio: StudyHook }).__studio.studyState().preview))
      .toBe(record.rows[1].key);
    await better.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __studio: StudyHook }).__studio
              .sceneRecord()
              .parts.find((part) => part.id === 'eye')!.rotation,
        ),
      )
      .toEqual([90, 0, 0]);
    expect(
      await page.evaluate(
        () => (window as unknown as { __studio: StudyHook }).__studio.studyState().record?.rows[1].visibility?.key,
      ),
    ).toBe(record.rows[1].visibility!.key);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Meta+z');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __studio: StudyHook }).__studio.sceneRecord()))
      .toEqual(before);
    expect(app.errors).toEqual([]);
  },
);
