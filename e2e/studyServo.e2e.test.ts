import { afterEach, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import { componentSize } from '../src/data/components';
import { servoArm } from '../src/sim/fixtures/servoArm';
import type { StudyKnob, StudyRecord } from '../src/study/types';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, partCount, shown, type App } from './harness';

interface StudioHook {
  load: (record: { name: string; parts: ScenePart[]; project: ProjectSettings }) => void;
  addCase: (raw: unknown) => string;
  configureStudy: (knobs: StudyKnob[]) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  studyState: () => { record: StudyRecord | null; running: boolean };
}

let app: App;

const variants = () =>
  app.page.evaluate(() =>
    (window as unknown as { __studio: StudioHook }).__studio
      .sceneRecord()
      .parts.flatMap((part) => part.componentVariant ?? [])
      .join(','),
  );
const showTab = (name: string) => app.page.locator(shown('[role=tab]'), { hasText: name }).first().click();
const bomText = async () => {
  const bom = app.page.locator(shown('section'), { hasText: /^Bill of materials/ }).first();
  const components = bom.getByRole('button', { name: /^Components/ }).first();

  if ((await components.getAttribute('aria-expanded')) === 'false') await components.click();

  return (await bom.textContent()) ?? '';
};

afterEach(async () => app?.close());

describe('Study servo choices', () => {
  it('runs a Case on servo versions, applies the chosen BOM, and undoes the whole change', async () => {
    app = await openApp();

    const arm = servoArm();
    const parts = arm.parts.map((part) =>
      part.componentId ? { ...part, dimensions: componentSize(part.componentId), massG: undefined } : part,
    );
    const kase = presetCase('touch-the-dots', buildRig(arm.joints, parts), parts);

    await app.page.evaluate(
      ({ parts, joints, kase }) => {
        const hook = (window as unknown as { __studio: StudioHook }).__studio;

        hook.load({ name: 'Servo arm', parts, project: { ...hook.sceneRecord().project, joints } });
        hook.addCase(kase);
        hook.configureStudy([
          {
            id: 'servos',
            label: 'Servo',
            kind: 'servo',
            joints: joints.slice(1).map((joint) => joint.id),
            values: ['component:feetech-sts3215|c044', 'component:feetech-sts3215|c001'],
          },
        ]);
      },
      { parts, joints: arm.joints, kase },
    );
    await expect.poll(() => partCount(app.page)).toBe(parts.length);
    expect(await variants()).toBe('c001,c044,c044');
    await app.page.keyboard.press('Meta+k');
    await app.page.getByLabel('Search commands').fill('Study');
    await app.page
      .locator(shown('button[data-idx]'))
      .filter({ hasText: /^Study$/ })
      .click();
    await app.page.getByRole('button', { name: 'Run Study', exact: true }).click();
    await expect
      .poll(() =>
        app.page.evaluate(() => {
          const state = (window as unknown as { __studio: StudioHook }).__studio.studyState();

          return !state.running && state.record?.rows.map((row) => [row.error ?? null, row.runs?.runs]);
        }),
      )
      .toEqual([
        [null, 8],
        [null, 8],
      ]);

    const rows = app.page.getByRole('table', { name: 'Study designs' }).locator('[data-testid="study-row"]');
    const other = rows.filter({ hasText: 'C001' });

    expect(await app.page.getByRole('button', { name: 'Case passes', exact: true }).count()).toBe(1);
    expect(await rows.filter({ hasText: 'C044' }).getAttribute('data-current')).toBe('true');
    await showTab('Build');
    await expect.poll(bomText).toContain('C044');
    await showTab('Simulate');
    await other.hover();
    await other.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect.poll(variants).toBe('c001,c001,c001');
    expect(await other.getAttribute('data-current')).toBe('true');
    await showTab('Build');
    await expect.poll(bomText).not.toContain('C044');
    await app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await app.page.keyboard.press('Meta+z');
    await expect.poll(variants).toBe('c001,c044,c044');
    await expect.poll(bomText).toContain('C044');
    expect(app.errors).toEqual([]);
  });
});
