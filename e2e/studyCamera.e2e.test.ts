import { afterEach, expect, it } from 'vitest';
import { visibilityDesign } from '../src/study/visibilityFixtures';
import type { StudyRecord } from '../src/study/types';
import type { ScenePart, ProjectSettings } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

interface StudyHook {
  load: (record: { id: string; name: string; parts: ScenePart[]; project: ProjectSettings }) => void;
  keepStudyTry: () => Promise<string>;
  configureStudy: (knobs: StudyRecord['knobs']) => void;
}

let app: App | undefined;

afterEach(async () => app?.close());

it('configures a lightweight saved camera try in Study and returns to ordinary Study', { retry: 0 }, async () => {
  app = await openApp();

  const { page } = app;
  const design = visibilityDesign(0);
  const eye = design.cameras[0];

  await page.evaluate(
    ({ eye, project }) => {
      const hook = (window as unknown as { __studio: StudyHook }).__studio;

      hook.load({ id: 'camera-study', name: 'Camera', parts: [eye], project: { ...project, joints: [] } });
      hook.configureStudy([
        {
          id: 'eye-pose',
          label: 'Camera pose',
          kind: 'camera_pose',
          part: eye.id,
          values: [{ position: eye.position, rotation: eye.rotation }],
        },
      ]);
    },
    { eye, project: design.project },
  );
  await expect.poll(() => partCount(page)).toBe(1);
  await page.getByTestId('camera-strip').getByRole('button', { name: 'Collapse', exact: true }).click();

  const tryId = await page.evaluate(() => (window as unknown as { __studio: StudyHook }).__studio.keepStudyTry());

  await page.keyboard.press('Meta+k');
  await page.getByLabel('Search commands').fill('Study');
  await page
    .locator(shown('button[data-idx]'))
    .filter({ hasText: /^Study$/ })
    .click();
  await page.getByRole('combobox', { name: 'Try', exact: true }).selectOption(tryId);
  await page.getByRole('textbox', { name: 'Samples', exact: true }).fill('2');
  await page.getByRole('textbox', { name: 'Samples', exact: true }).press('Tab');
  await page.getByRole('textbox', { name: 'Camera pose values', exact: true }).fill('-2.47 200 5.12 -90 0 0');
  await page.getByRole('textbox', { name: 'Camera pose values', exact: true }).press('Tab');

  const run = page.getByRole('button', { name: 'Run Study', exact: true });
  const camera = page.getByRole('switch', { name: eye.name, exact: true });
  const target = page.getByRole('switch', { name: design.kase.world.objects[0].name, exact: true });

  expect(await page.getByRole('combobox', { name: 'Try', exact: true }).inputValue()).toBe(tryId);
  expect(await page.getByRole('textbox', { name: 'Samples', exact: true }).inputValue()).toBe('2');
  expect(await page.getByRole('textbox', { name: 'Camera pose values', exact: true }).inputValue()).toBe(
    '-2.47 200 5.12 -90 0 0',
  );
  await expect.poll(() => run.isEnabled()).toBe(true);
  await camera.click();
  await expect.poll(() => run.isDisabled()).toBe(true);
  await camera.click();
  await target.click();
  await expect.poll(() => run.isDisabled()).toBe(true);
  await target.click();
  await expect.poll(() => run.isEnabled()).toBe(true);
  await page.getByRole('combobox', { name: 'Try', exact: true }).selectOption('');
  await expect.poll(() => page.getByRole('textbox', { name: 'Samples', exact: true }).count()).toBe(0);
  await expect.poll(() => run.isEnabled()).toBe(true);
  expect(app.errors).toEqual([]);
});
