import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openApp } from '../../e2e/harness';
import { appAttempt } from '../../e2e/appAttempt';
import { supportSceneStorage } from '../../e2e/sketchSupport.helpers';

const fixture = vi.hoisted(() => ({ launch: vi.fn(), diagnostics: vi.fn() }));

vi.mock('playwright-core', () => ({ chromium: { launch: fixture.launch } }));
vi.mock('./browserWorkerTrace', () => ({ installBrowserWorkerTrace: vi.fn() }));
vi.mock('./browserDiagnostics', () => ({ browserWorkerDiagnostics: fixture.diagnostics }));

const directories = [];

beforeEach(() => {
  const temporary = fs.mkdtempSync;

  vi.spyOn(fs, 'mkdtempSync').mockImplementation((...args) => {
    const directory = temporary(...args);

    directories.push(directory);

    return directory;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllEnvs();

  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function appPage() {
  return {
    on: vi.fn(),
    context: () => ({ route: vi.fn().mockResolvedValue(undefined) }),
    route: vi.fn().mockResolvedValue(undefined),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    locator: () => ({ innerText: vi.fn().mockResolvedValue('Studio') }),
  };
}

function expectLibraryRemoved() {
  expect(directories).toHaveLength(1);
  expect(fs.existsSync(directories[0])).toBe(false);
}

it.each(['launch', 'page', 'navigation', 'readiness'])(
  'releases Chrome and its Library after %s fails during app setup',
  async (stage) => {
    const error = new Error(`Failed ${stage}`);
    const close = vi.fn().mockResolvedValue(undefined);
    const page = appPage();

    if (stage === 'navigation') page.goto.mockRejectedValue(error);

    if (stage === 'readiness') page.waitForFunction.mockRejectedValue(error);

    fixture.launch.mockImplementation(async () => {
      if (stage === 'launch') throw error;

      return {
        close,
        newPage: async () => {
          if (stage === 'page') throw error;

          return page;
        },
      };
    });
    await expect(openApp()).rejects.toBe(error);
    expect(close).toHaveBeenCalledTimes(stage === 'launch' ? 0 : 1);
    expectLibraryRemoved();
    expect(page.goto).toHaveBeenCalledTimes(['launch', 'page'].includes(stage) ? 0 : 1);
    expect(page.waitForFunction).toHaveBeenCalledTimes(stage === 'readiness' ? 1 : 0);
  },
);

it('does not launch Chrome when the temporary Library cannot be created', async () => {
  const error = new Error('Library creation failed');

  fs.mkdtempSync.mockImplementation(() => {
    throw error;
  });
  await expect(openApp()).rejects.toBe(error);
  expect(fixture.launch).not.toHaveBeenCalled();
});

it('preserves the setup failure and removes its Library when Chrome cleanup rejects', async () => {
  const error = new Error('Studio readiness failed');
  const page = appPage();
  const close = vi.fn().mockRejectedValue(new Error('Chrome cleanup failed'));

  page.waitForFunction.mockRejectedValue(error);
  fixture.launch.mockResolvedValue({ close, newPage: async () => page });
  await expect(openApp()).rejects.toBe(error);
  expect(close).toHaveBeenCalledTimes(1);
  expectLibraryRemoved();
});

it.each([false, true])(
  'releases resources when diagnostics fail and Chrome cleanup rejects: %s',
  async (rejectClose) => {
    const error = new Error('Diagnostic capture failed');
    const cleanupError = new Error('Chrome cleanup failed');
    const page = appPage();
    const close = vi.fn().mockResolvedValue(undefined);

    if (rejectClose) close.mockRejectedValue(cleanupError);

    vi.stubEnv('BASECASE_DIAGNOSTIC_BROWSER_TRACE', '1');
    fixture.diagnostics.mockRejectedValue(error);
    fixture.launch.mockResolvedValue({ close, newPage: async () => page });

    const app = await openApp();

    await expect(app.close()).rejects.toBe(rejectClose ? cleanupError : error);
    expect(fixture.diagnostics).toHaveBeenCalledWith(page);
    expect(close).toHaveBeenCalledTimes(1);
    expectLibraryRemoved();
  },
);

it('resets permissions before each fresh browser attempt without retaining cookies or errors', async () => {
  let roles = ['viewer'];
  const open = vi.fn(async () => ({ cookies: [], errors: [], roles: [...roles], close: vi.fn() }));
  const prepare = async () => {
    roles = ['viewer'];
  };
  const first = appAttempt(prepare, open);
  const old = await first.ready;

  old.cookies.push('signed-in');
  old.errors.push('Network changed');
  roles = [];
  await first.close();

  const second = appAttempt(prepare, open);
  const fresh = await second.ready;

  expect(fresh).not.toBe(old);
  expect(fresh).toMatchObject({ cookies: [], errors: [], roles: ['viewer'] });
  await second.close();
  expect(old.close).toHaveBeenCalledOnce();
  expect(fresh.close).toHaveBeenCalledOnce();
});

it.each([false, true])('retires the import app after scene-storage setup fails, cleanup rejects: %s', async (fails) => {
  const setupError = new Error('Scene-storage setup failed');
  const cleanupError = new Error('Browser cleanup failed');
  const page = appPage();
  const close = vi.fn().mockResolvedValue(undefined);

  if (fails) close.mockRejectedValue(cleanupError);

  fixture.launch.mockResolvedValue({ close, newPage: async () => page });

  const attempt = appAttempt(async () => undefined);
  const app = await attempt.ready;

  page.route.mockRejectedValueOnce(setupError);
  await expect(supportSceneStorage(app.page)).rejects.toBe(setupError);

  const closing = attempt.close();

  if (fails) await expect(closing).rejects.toBe(cleanupError);
  else await closing;

  await attempt.close().catch(() => undefined);
  expect(close).toHaveBeenCalledOnce();
  expectLibraryRemoved();
});

it('preserves a failed permission reset without launching a browser', async () => {
  const error = new Error('Grant reset failed');
  const open = vi.fn();
  const attempt = appAttempt(async () => {
    throw error;
  }, open);

  await expect(attempt.ready).rejects.toBe(error);
  await attempt.close();
  expect(open).not.toHaveBeenCalled();
});

it('retires pending permission setup before it can launch a browser', async () => {
  const preparing = Promise.withResolvers();
  const open = vi.fn();
  const attempt = appAttempt(() => preparing.promise, open);
  const closed = attempt.close();

  preparing.resolve();
  await expect(attempt.ready).rejects.toThrow('Studio setup was closed.');
  await closed;
  expect(open).not.toHaveBeenCalled();
});

it.each([false, true])('closes a late browser exactly once and reports cleanup failure: %s', async (fails) => {
  const opening = Promise.withResolvers();
  const open = vi.fn(() => opening.promise);
  const close = vi.fn(async () => {
    if (fails) throw new Error('Browser cleanup failed');
  });
  const attempt = appAttempt(async () => undefined, open);

  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());

  const closed = attempt.close();
  const message = fails ? 'Browser cleanup failed' : 'Studio setup was closed.';
  const rejected = expect(attempt.ready).rejects.toThrow(message);
  const released = fails ? expect(closed).rejects.toThrow(message) : closed;

  opening.resolve({ close });
  await rejected;
  await released;
  await attempt.close().catch(() => undefined);
  expect(close).toHaveBeenCalledOnce();
});
