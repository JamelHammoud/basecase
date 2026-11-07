import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appResources, launchPackaged, packagedBinary, type RunningApp } from './packagedApp';

let run: RunningApp;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const layerRows = () => run.page.locator(visible('[data-layer-row^="part:"]')).count();

beforeAll(async () => {
  run = await launchPackaged();
});

afterAll(async () => {
  await run?.close();
});

describe('packaged app', () => {
  it('opens one window named Basecase', async () => {
    expect(await run.page.title()).toBe('Basecase');
    expect(run.app.windows()).toHaveLength(1);
  });

  it('draws its own title bar for the platform', async () => {
    const menuButton = run.page.locator(visible('button[aria-label="Menu"]'));

    expect(await menuButton.count()).toBe(process.platform === 'win32' ? 1 : 0);

    if (process.platform !== 'win32') return;

    const overlayShown = await run.page.evaluate(() => {
      const nav = navigator as Navigator & { windowControlsOverlay?: { visible: boolean } };

      return Boolean(nav.windowControlsOverlay?.visible);
    });

    expect(overlayShown).toBe(true);
  });

  it('adds, duplicates and undoes parts', async () => {
    await run.page.locator(visible('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).click();
    await run.page.keyboard.press('a');
    await run.page.getByRole('button', { name: /^Cube/ }).first().click();
    await expect.poll(layerRows).toBe(1);

    await run.page.keyboard.press('ControlOrMeta+d');
    await expect.poll(layerRows).toBe(2);

    await run.page.keyboard.press('ControlOrMeta+z');
    await expect.poll(layerRows).toBe(1);
  });

  it('starts the agent with the Node it ships with', async () => {
    const connected = () =>
      run.page.evaluate(async () => {
        const api = (window as unknown as { electronAPI?: { getAcpStatus: () => Promise<{ connected?: boolean }> } })
          .electronAPI;

        return Boolean((await api?.getAcpStatus())?.connected);
      });

    await expect.poll(connected, { timeout: 60000 }).toBe(true);
  });

  it('ships the CAD kernel as a sandbox bundle, with no Node host', () => {
    const app = appResources(packagedBinary());

    expect(fs.existsSync(path.join(app, 'dist', 'kernel', 'worker.js'))).toBe(true);

    for (const left of ['electron/cad-kernel/nodeHost', 'node_modules/replicad', 'node_modules/openscad-wasm']) {
      expect(fs.existsSync(path.join(app, left)), left).toBe(false);
    }
  });

  it('ran without page errors', () => {
    expect(run.errors).toEqual([]);
  });
});
