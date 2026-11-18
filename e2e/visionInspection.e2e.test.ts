import { afterEach, expect, it } from 'vitest';
import { openApp, type App } from './harness';
import { openVisionInspection, followVisionSource } from './visionInspectionFlow';

let app: App;

afterEach(async () => {
  await app?.close();
});

it('opens a frozen comparison image’s source try at its saved frame', { retry: 0 }, async () => {
  app = await openApp();

  await openVisionInspection(app);
  await followVisionSource(app);
  expect(app.errors).toEqual([]);
});
