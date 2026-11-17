import { routeToolStatus } from '../electron/electrical/routeTools.mjs';
import { routeNativeBoard } from '../electron/electrical/route.mjs';
import { routingExecute, nativeElectricalCli } from '../tools/electrical/routingExecute.mjs';
import type { Page } from 'playwright-core';
import { runNativeBoard } from '../electron/electrical/validate.mjs';

export async function routedBoardBackend(page: Page) {
  const active = new Map<string, AbortController>();

  await page.route('**/api/bridge/electrical-tools', async (route) => route.fulfill({ json: await routeToolStatus() }));
  await page.route('**/api/bridge/electrical-cancel', async (route) => {
    active.get(route.request().postDataJSON().arg)?.abort();
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/bridge/electrical-route', async (route) => {
    const input = route.request().postDataJSON().arg;
    const abort = new AbortController();

    active.set(input.request.id, abort);

    try {
      await route.fulfill({
        json: await routeNativeBoard(input, {
          signal: abort.signal,
          execute: routingExecute,
          cli: process.env.BASECASE_KICAD_DOCKER === '1' ? nativeElectricalCli : undefined,
        }),
      });
    } catch (error) {
      await route.fulfill({ json: { error: error instanceof Error ? error.message : String(error) } });
    } finally {
      active.delete(input.request.id);
    }
  });
  await page.route('**/api/bridge/electrical-validate', async (route) => {
    const request = route.request().postDataJSON().arg;
    const abort = new AbortController();

    active.set(request.id, abort);

    try {
      const result = await runNativeBoard(request, { cli: nativeElectricalCli, signal: abort.signal });

      await route.fulfill({ json: result });
    } catch (error) {
      await route.fulfill({ json: { error: error instanceof Error ? error.message : String(error) } });
    } finally {
      active.delete(request.id);
    }
  });

  return () => active.forEach((abort) => abort.abort());
}
