import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, type App } from './harness';
import { command, fall, makePassive, openFinger, reopenExport, sceneJoints } from './passiveJointSteps';

let app: App;

beforeAll(async () => {
  app = await openApp();
});

afterAll(async () => {
  await app?.close();
});

describe('passive joints in Pose', () => {
  it('changes a powered finger to passive, falls, exports and reopens, then undoes and redoes the original edit', async () => {
    await openFinger(app);
    await makePassive(app);
    await fall(app);
    await command(app, 'Stop Simulation');
    await reopenExport(app);
    await app.page.keyboard.press('Meta+w');
    await expect.poll(async () => (await sceneJoints(app))[0]?.actuation).toBe('passive');
    await app.page.keyboard.press('Meta+z');
    await expect.poll(async () => (await sceneJoints(app))[0]?.actuation).toBe('powered');
    await app.page.keyboard.press('Meta+Shift+z');
    await expect.poll(async () => (await sceneJoints(app))[0]?.actuation).toBe('passive');
  });
});
