import type { Page } from 'playwright-core';
import { runNativeBoard } from '../electron/electrical/validate.mjs';
import { boardExecutable, boardProcess } from '../electron/electrical/process.mjs';

export async function routedBoardBackend(page: Page) {
  const active = new Map<string, AbortController>();

  await page.route('**/api/bridge/electrical-cancel', async (route) => {
    active.get(route.request().postDataJSON().arg)?.abort();
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/bridge/electrical-validate', async (route) => {
    const request = route.request().postDataJSON().arg;
    const abort = new AbortController();
    const cli = async (args: string[], cwd: string, signal?: AbortSignal) => {
      if (process.platform !== 'linux') return boardProcess({ command: await boardExecutable(), args, cwd, signal });

      return boardProcess({
        command: 'docker',
        args: [
          'run',
          '--rm',
          '--user',
          '0:0',
          '--volume',
          `${cwd}:/work`,
          '--workdir',
          '/work',
          '--entrypoint',
          'kicad-cli',
          'kicad/kicad:9.0.6',
          ...args,
        ],
        cwd,
        signal,
      });
    };

    active.set(request.id, abort);

    try {
      const result = await runNativeBoard(request, { cli, signal: abort.signal });

      await route.fulfill({ json: result });
    } catch (error) {
      await route.fulfill({ json: { error: error instanceof Error ? error.message : String(error) } });
    } finally {
      active.delete(request.id);
    }
  });

  return () => active.forEach((abort) => abort.abort());
}
