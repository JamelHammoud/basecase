import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, type App } from './harness';
import { command, fall, makePassive, openFinger, sceneJoints } from './passiveJointSteps';

let app: App;

beforeAll(async () => {
  app = await openApp();
});

afterAll(async () => {
  await app?.close();
});

describe('passive joints in Pose', () => {
  it('changes a powered finger to passive with undo and redo, then falls without a motor', async () => {
    await openFinger(app);
    await makePassive(app);
    await app.page.keyboard.press('Meta+z');
    await expect.poll(async () => (await sceneJoints(app))[0]?.actuation).toBe('powered');
    await app.page.keyboard.press('Meta+Shift+z');
    await expect.poll(async () => (await sceneJoints(app))[0]?.actuation).toBe('passive');
    await fall(app);
    await command(app, 'Stop Simulation');
  });
});
