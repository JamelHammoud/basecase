import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, type App } from './harness';
import { insertClosedLinkage, runClosedLinkage, reopenClosedRecording } from './closedLinkageSteps';

let app: App;

beforeAll(async () => {
  app = await openApp();
});

afterAll(async () => {
  await app?.close();
});

it('inserts a Sketch Path four-bar, simulates its joined links and reopens articulated recording', async () => {
  const joints = await insertClosedLinkage(app);
  const recording = await runClosedLinkage(app, joints);

  expect(recording).not.toBeNull();
  await reopenClosedRecording(app, recording!);
  expect(app.errors).toEqual([]);
});
