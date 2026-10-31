import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

  it('compiles a part in the CAD kernel', () => {
    const client = pathToFileURL(path.join(appResources(packagedBinary()), 'electron', 'cad-kernel', 'client.mjs'));
    const script = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-kernel-')), 'kernel.mjs');

    fs.writeFileSync(
      script,
      [
        `const { renderPart, stopKernels } = await import(${JSON.stringify(client.href)});`,
        `const res = await renderPart('openscad', 'cube([10, 20, 30]);');`,
        'stopKernels();',
        'console.log(JSON.stringify({ error: res.error ?? null, volume: res.stats?.volume ?? 0 }));',
      ].join('\n'),
    );

    const out = execFileSync(packagedBinary(), [script], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8',
      timeout: 120000,
    });
    const res = JSON.parse(out.trim().split('\n').pop() ?? '{}');

    expect(res.error).toBeNull();
    expect(res.volume).toBeCloseTo(6000, 0);
  });

  it('ran without page errors', () => {
    expect(run.errors).toEqual([]);
  });
});
