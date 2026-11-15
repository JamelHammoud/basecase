import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { servoArm } from '../src/sim/fixtures/servoArm';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

interface StudioHook {
  load: (record: { name: string; parts: unknown[]; project: unknown }) => void;
  addCase: (raw: unknown) => string;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  simState: () => { activeCase: string | null; status: string };
}

let app: App;

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
