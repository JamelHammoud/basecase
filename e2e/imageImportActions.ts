import { expect, inject } from 'vitest';
import { startFakeRoboflow, type FakeRoboflowOptions } from './fakeRoboflow';
import { openApp, shown, type App } from './harness';

type FakeRoboflow = Awaited<ReturnType<typeof startFakeRoboflow>>;

export async function withRoboflowApp(
  options: Partial<FakeRoboflowOptions>,
  work: (app: App, fake: FakeRoboflow) => Promise<void>,
) {
  const fake = await startFakeRoboflow({ key: 'roboflow_e2e_key', port: inject('roboflowPort'), ...options });
  let app: App | undefined;

  try {
    app = await openApp({}, [], { roboflowUrl: fake.url });
    await work(app, fake);
  } finally {
    await Promise.all([app?.close(), fake.close()]);
  }
}

export async function openRobotImport(app: App) {
  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.getByLabel('Search commands').fill('Import Robot');
  await app.page.getByRole('button', { name: 'Import Robot', exact: true }).click();
}

export async function importRoboflowLink(app: App) {
  await openRobotImport(app);
  await app.page.getByLabel('Robot link').fill('https://universe.roboflow.com/workspace/project');
  await app.page.keyboard.press('Enter');
}

export async function connectRoboflow(app: App, fake: FakeRoboflow) {
  await importRoboflowLink(app);

  const key = app.page.locator(shown('input[aria-label="Roboflow API key"]'));

  await key.waitFor();
  expect(await key.evaluate((input) => input === document.activeElement)).toBe(true);
  expect(fake.requests).toEqual([]);
  await key.fill('roboflow_e2e_key');
  await key.press('Enter');
  await expect.poll(() => key.inputValue()).toBe('');
  await app.page.keyboard.press('Escape');
}

export function holdRoboflowExport(fake: FakeRoboflow) {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });

  fake.advance({
    beforeExport: () => {
      started();

      return gate;
    },
  });

  return { requested, release };
}
