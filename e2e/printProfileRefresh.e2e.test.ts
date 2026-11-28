import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Locator } from 'playwright-core';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { writeJob } from '../electron/print/jobs.mjs';
import { prepareProject } from '../electron/print/projectFile.mjs';
import { profileFixture } from '../tools/printers/profileRefresh.fixtures.mjs';
import { roverParts } from '../src/print/project.fixtures';
import type { JobPayload } from '../src/print/printBridge';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, shown, type App } from './harness';

let app: App;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-project-'));
const opened: string[] = [];

beforeAll(async () => {
  app = await openApp({
    'print-printers': [
      { id: 'saved-printer', modelId: 'bambu-lab-h3c', nickname: 'Old printer', nozzle: 0.6, isDefault: true },
    ],
    'print-status': { slicers: [{ kind: 'orca', name: 'OrcaSlicer', version: '2.5.2' }], downloads: {} },
  });
  await app.page.route('**/api/bridge/print-open', async (route) => {
    const payload = (
      route.request().postDataJSON() as {
        arg: Omit<JobPayload, 'groups'> & {
          groups: Array<Omit<JobPayload['groups'][number], 'bytes'> & { bytes: string }>;
        };
      }
    ).arg;
    const written = writeJob(root, {
      ...payload,
      groups: payload.groups.map((g) => ({ ...g, bytes: Buffer.from(g.bytes, 'base64') })),
    });
    const source = profileFixture(path.join(root, 'profiles'))[1];
    const file = written.job.groups[0].layout;

    await prepareProject(file, { profiles: source.profiles }, written.job.printer);
    opened.push(file);

    const result = { file, opened: 'OrcaSlicer' };

    await route.fulfill({ json: result });
  });
}, 120000);

afterAll(async () => {
  try {
    await app?.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function assertRecoveryLayout(dialog: Locator) {
  for (const select of await dialog.locator('select').all()) {
    const bounds = await select.evaluate((element: HTMLSelectElement) => {
      const row = element.parentElement!.parentElement!.parentElement!.parentElement!;
      const label = row.firstElementChild!.firstElementChild!;
      const range = document.createRange();
      const style = getComputedStyle(element);
      const context = document.createElement('canvas').getContext('2d')!;

      range.selectNodeContents(label);
      context.font = style.font;

      return {
        row: row.getBoundingClientRect().toJSON(),
        label: range.getBoundingClientRect().toJSON(),
        select: element.getBoundingClientRect().toJSON(),
        valueWidth: context.measureText(element.selectedOptions[0].text).width,
        padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
      };
    });

    expect(bounds.label.left).toBeGreaterThanOrEqual(bounds.row.left);
    expect(bounds.label.right).toBeLessThanOrEqual(bounds.select.left);
    expect(bounds.select.right).toBeLessThanOrEqual(bounds.row.right);
    expect(bounds.valueWidth + bounds.padding).toBeLessThanOrEqual(bounds.select.width);
    expect(bounds.select.height).toBe(32);
  }
}

it(
  'selects a refreshed CORE One in Settings and opens the robot project with its preset identities',
  { retry: 0 },
  async () => {
    await app.page.setViewportSize({ width: 1240, height: 720 });
    await app.page.route('**/api/bridge/print-save-printers', (route) =>
      route.fulfill({ json: (route.request().postDataJSON() as { arg: unknown }).arg }),
    );
    await app.page.evaluate(
      ({ parts, project }) => {
        (window as unknown as { __studio: { load: (scene: unknown) => void } }).__studio.load({ parts, project });
      },
      {
        parts: roverParts().map((part) => ({
          ...part,
          printMaterial: part.id === 'tire' ? 'PETG' : 'PLA',
          mechanicalTag: `3D Printed ${part.id === 'tire' ? 'PETG' : 'PLA'}`,
        })),
        project: { ...DEFAULT_PROJECT, labelParts: false },
      },
    );
    await app.page.keyboard.press('Meta+,');

    const settingsDialog = app.page.getByRole('dialog', { name: 'Settings' });

    await settingsDialog.getByRole('navigation').getByRole('button', { name: 'Printers' }).click();
    await settingsDialog.getByRole('button', { name: 'Old printer', exact: true }).click();
    expect(await settingsDialog.locator('select[aria-label="Model"]').inputValue()).toBe('bambu-lab-h3c');
    expect(await settingsDialog.locator('option:checked').first().isDisabled()).toBe(true);
    await assertRecoveryLayout(settingsDialog);
    await settingsDialog.locator('select[aria-label="Model"]').selectOption({ label: 'Prusa CORE One' });
    expect(await settingsDialog.locator('select[aria-label="Nozzle"]').inputValue()).toBe('0.6');
    expect(await settingsDialog.locator('select[aria-label="Nozzle"] option:checked').isDisabled()).toBe(true);
    await assertRecoveryLayout(settingsDialog);
    await settingsDialog.locator('select[aria-label="Model"]').focus();
    await app.page.keyboard.press('Tab');
    expect(
      await settingsDialog.locator('select[aria-label="Nozzle"]').evaluate((e) => e === document.activeElement),
    ).toBe(true);
    await app.page.keyboard.press('ArrowDown');
    await app.page.keyboard.press('Tab');
    await expect.poll(() => settingsDialog.getByText('Prusa CORE One, 0.4 mm nozzle, Export only').count()).toBe(1);
    expect(await settingsDialog.locator('select[aria-label="Nozzle"]').count()).toBe(0);
    await app.page.keyboard.press('Escape');
    await expect.poll(() => settingsDialog.count()).toBe(0);
    await app.page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await app.page.keyboard.press('Meta+p');
    await app.page
      .locator(shown('button'))
      .filter({ hasText: /^Open in OrcaSlicer$/ })
      .click();
    await expect.poll(() => opened.length).toBe(1);

    const files = unzipSync(fs.readFileSync(opened[0]));
    const settings = JSON.parse(strFromU8(files['Metadata/project_settings.config']));
    const config = strFromU8(files['Metadata/model_settings.config']);

    expect(settings.printer_settings_id).toBe('Prusa CORE One 0.4 nozzle');
    expect(settings.print_settings_id).toBe('0.20mm SPEED @CORE One 0.4');
    expect(settings.nozzle_diameter).toEqual(['0.4']);
    expect(settings.overhang_4_4_speed).toBe('15');
    expect(settings.filament_type).toEqual(['PLA', 'PETG']);
    expect(config).toMatch(/key="name" value="Rover body"[^]*?key="extruder" value="1"/);
    expect(config).toMatch(/key="name" value="Rover tire"[^]*?key="extruder" value="2"/);
    expect(config.match(/<plate>/g)).toHaveLength(2);
    expect(app.posts.some((p) => p.route === 'print-slice')).toBe(false);
    expect(app.errors).toEqual([]);
  },
);
