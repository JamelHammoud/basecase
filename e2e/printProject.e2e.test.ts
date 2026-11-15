import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openJob, writeJob } from '../electron/print/jobs.mjs';
import { roverParts } from '../src/print/project.fixtures';
import type { JobPayload } from '../src/print/printBridge';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, shown, type App } from './harness';

let app: App;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-project-'));
const opened: string[] = [];

beforeAll(async () => {
  app = await openApp({
    'print-status': { slicers: [{ kind: 'bambu', name: 'Bambu Studio', version: null }], downloads: {} },
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
    const result = await openJob(written, {}, async (file: string) => {
      opened.push(file);
    });

    await route.fulfill({ json: result });
  });
}, 120000);

afterAll(async () => {
  await app?.close();
  fs.rmSync(root, { recursive: true, force: true });
});

it('opens every rover plate as one written Bambu project with each object’s filament', async () => {
  await app.page.evaluate(
    ({ parts, project }) => {
      (window as unknown as { __studio: { load: (scene: unknown) => void } }).__studio.load({ parts, project });
    },
    { parts: roverParts(), project: { ...DEFAULT_PROJECT, labelParts: false } },
  );
  await app.page
    .locator('main')
    .first()
    .click({ position: { x: 20, y: 20 } });
  await app.page.keyboard.press('Meta+p');
  await app.page
    .locator(shown('button'))
    .filter({ hasText: /^Open in Bambu Studio$/ })
    .click();
  await expect.poll(() => opened.length).toBe(1);

  const files = unzipSync(fs.readFileSync(opened[0]));
  const settings = JSON.parse(strFromU8(files['Metadata/project_settings.config']));
  const config = strFromU8(files['Metadata/model_settings.config']);

  expect(settings.filament_type).toEqual(['PLA', 'TPU']);
  expect(config).toMatch(/key="name" value="Rover body"[^]*?key="extruder" value="1"/);
  expect(config).toMatch(/key="name" value="Rover tire"[^]*?key="extruder" value="2"/);
  expect(config.match(/<plate>/g)).toHaveLength(2);
  expect(app.posts.some((p) => p.route === 'print-slice')).toBe(false);
  expect(app.errors).toEqual([]);
});
