import fs from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { openApp } from '../../e2e/harness';

const fixture = vi.hoisted(() => ({ launch: vi.fn() }));

vi.mock('playwright-core', () => ({ chromium: { launch: fixture.launch } }));
vi.mock('./browserWorkerTrace', () => ({ installBrowserWorkerTrace: vi.fn() }));

const directories = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();

  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

it.each(['page', 'navigation', 'readiness'])(
  'releases Chrome and its Library after %s fails during app setup',
  async (stage) => {
    const temporary = fs.mkdtempSync;

    vi.spyOn(fs, 'mkdtempSync').mockImplementation((...args) => {
      const directory = temporary(...args);

      directories.push(directory);

      return directory;
    });

    const error = new Error(`Failed ${stage}`);
    const close = vi.fn().mockResolvedValue(undefined);
    const page = {
      on: vi.fn(),
      context: () => ({ route: vi.fn().mockResolvedValue(undefined) }),
      route: vi.fn().mockResolvedValue(undefined),
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockImplementation(async () => {
        if (stage === 'navigation') throw error;
      }),
      waitForFunction: vi.fn().mockRejectedValue(error),
    };

    fixture.launch.mockResolvedValue({
      close,
      newPage: async () => {
        if (stage === 'page') throw error;

        return page;
      },
    });
    await expect(openApp()).rejects.toBe(error);
    expect(close).toHaveBeenCalledTimes(1);
    expect(directories).toHaveLength(1);
    expect(fs.existsSync(directories[0])).toBe(false);
    expect(page.goto).toHaveBeenCalledTimes(stage === 'page' ? 0 : 1);
    expect(page.waitForFunction).toHaveBeenCalledTimes(stage === 'readiness' ? 1 : 0);
  },
);
