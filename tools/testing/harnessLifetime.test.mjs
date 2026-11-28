import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openApp } from '../../e2e/harness';

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
