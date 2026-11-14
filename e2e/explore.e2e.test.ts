import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import { servoArm } from '../src/sim/fixtures/servoArm';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, partCount, shown, type App } from './harness';

interface StudioHook {
  load: (record: { name: string; parts: unknown[]; project: unknown }) => void;
  addCase: (raw: unknown) => string;
  exploreLimit: (designs: number) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  simState: () => { activeCase: string | null; status: string };
}

const EXPLORED = 2;

let app: App;

const section = (title: RegExp) => app.page.locator(shown('section'), { hasText: title }).first();

const bomText = async () => {
  const bom = section(/^Bill of materials/);
  const components = bom.getByRole('button', { name: /^Components/ }).first();

  if ((await components.getAttribute('aria-expanded')) === 'false') await components.click();

  return (await bom.textContent()) ?? '';
};

const variants = () =>
  app.page.evaluate(() =>
    (window as unknown as { __studio: StudioHook }).__studio
      .sceneRecord()
      .parts.flatMap((p) => p.componentVariant ?? [])
      .join(','),
  );

const simStatus = () =>
  app.page.evaluate(() => (window as unknown as { __studio: StudioHook }).__studio.simState().status);

const runCommand = async (label: string) => {
  await app.page.keyboard.press('Meta+k');
  await app.page.getByLabel('Search commands').fill(label);
  await app.page
    .locator(shown('button[data-idx]'))
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();
};

const showTab = (name: string) => app.page.locator(shown('[role=tab]'), { hasText: name }).first().click();

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Simulate from ⌘K', () => {
  it('starts and stops the simulation', async () => {
    const arm = servoArm();

    await app.page.evaluate(
      ({ parts, joints }) => {
        const hook = (window as unknown as { __studio: StudioHook }).__studio;

        hook.load({ name: 'Servo arm', parts, project: { ...hook.sceneRecord().project, joints } });
      },
      { parts: arm.parts, joints: arm.joints },
    );
    await expect.poll(() => partCount(app.page)).toBe(arm.parts.length);
    await runCommand('Simulate');
    await expect.poll(simStatus, { timeout: 60000 }).toBe('ready');
    await runCommand('Stop Simulation');
    await expect.poll(simStatus).toBe('off');
    expect(app.errors).toEqual([]);
  }, 120000);
});

describe('Explore', () => {
  it('runs servo versions on the open Case from ⌘K, applies a row in one undo step, and the BOM follows', async () => {
    const arm = servoArm();
    const kase = presetCase('touch-the-dots', buildRig(arm.joints, arm.parts), arm.parts);

    await app.page.evaluate(
      ({ parts, joints, designs }) => {
        const hook = (window as unknown as { __studio: StudioHook }).__studio;

        hook.exploreLimit(designs);
        hook.load({ name: 'Servo arm', parts, project: { ...hook.sceneRecord().project, joints } });
      },
      { parts: arm.parts, joints: arm.joints, designs: EXPLORED },
    );
    await expect.poll(() => partCount(app.page)).toBe(arm.parts.length);

    const caseId = await app.page.evaluate(
      (raw) => (window as unknown as { __studio: StudioHook }).__studio.addCase(raw),
      kase,
    );

    await expect
      .poll(() =>
        app.page.evaluate(() => (window as unknown as { __studio: StudioHook }).__studio.simState().activeCase),
      )
      .toBe(caseId);
    expect(await variants()).toBe('c001,c044,c044');

    await app.page.keyboard.press('Meta+k');
    await app.page.getByLabel('Search commands').fill('Explore');
    await expect.poll(() => app.page.getByText(/^Explore$/).count(), { timeout: 15000 }).toBeGreaterThan(0);
    await app.page.keyboard.press('Enter');

    const rows = app.page.locator(shown('[data-testid="explore-row"]'));

    await expect.poll(() => rows.count(), { timeout: 150000 }).toBe(EXPLORED);

    const passes = await rows.locator('[data-testid="explore-passes"]').allInnerTexts();

    passes.forEach((text) => expect(text).toMatch(/^\d of 8$/));

    const built = rows.filter({ hasText: 'Servo arm' });
    const other = rows.filter({ hasNotText: 'Servo arm' });

    expect(await built.getAttribute('data-current')).toBe('true');

    await showTab('Build');
    await expect.poll(bomText, { timeout: 30000 }).toContain('C044');
    await showTab('Simulate');
    await other.hover();
    await other.getByRole('button', { name: 'Apply' }).click();
    await expect.poll(variants).toBe('c001,c001,c001');
    expect(await other.getAttribute('data-current')).toBe('true');

    await showTab('Build');
    await expect.poll(bomText, { timeout: 30000 }).not.toContain('C044');

    await app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await app.page.keyboard.press('Meta+z');
    await expect.poll(variants).toBe('c001,c044,c044');
    await expect.poll(bomText, { timeout: 30000 }).toContain('C044');
    expect(app.errors).toEqual([]);
  }, 240000);
});
