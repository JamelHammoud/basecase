import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, describe, expect, it } from 'vitest';
import { projectPrinter, roverPlan, roverShapes } from '../../src/print/project.fixtures';
import { projectJobSpec } from '../../src/print/projectJob';
import { threeMfIn } from '../../src/three/analysis/analysisPool';
import { DEFAULT_PROJECT } from '../../src/types/robotics';
import { openJob, writeJob } from './jobs.mjs';
import { findSlicerApp } from './slicers.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-project-'));

const projectPayload = async () => {
  const spec = projectJobSpec(roverPlan(), projectPrinter, DEFAULT_PROJECT);
  const { files } = await threeMfIn(roverShapes(), spec);

  return {
    jobId: 'rover',
    name: 'Rover',
    printer: spec.printer,
    project: true,
    groups: spec.groups.map((g) => ({ ...g, bytes: files[g.material] })),
  };
};

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('writes and opens the project directly without running the CLI', async () => {
  const payload = await projectPayload();
  const written = writeJob(root, payload);
  const opened = [];
  const result = await openJob(written, {}, async (file) => opened.push(file));

  expect(opened).toEqual([result.file]);
  expect(fs.readFileSync(result.file)).toEqual(Buffer.from(payload.groups[0].bytes));
  expect(
    JSON.parse(strFromU8(unzipSync(fs.readFileSync(result.file))['Metadata/project_settings.config'])).filament_type,
  ).toEqual(['PLA', 'TPU']);
});

const bambu = findSlicerApp('bambu');

describe.skipIf(!bambu)('Bambu Studio project compatibility', () => {
  it('loads the unsliced multi-material archive without error', async () => {
    const written = writeJob(root, await projectPayload());

    await promisify(execFile)(
      bambu.binary,
      [
        '--debug',
        '2',
        '--arrange',
        '0',
        '--outputdir',
        root,
        '--export-3mf',
        'roundtrip.3mf',
        written.job.groups[0].layout,
      ],
      { cwd: root },
    );

    const files = unzipSync(fs.readFileSync(path.join(root, 'roundtrip.3mf')));
    const settings = JSON.parse(strFromU8(files['Metadata/project_settings.config']));
    const config = strFromU8(files['Metadata/model_settings.config']);

    expect(settings.filament_type).toEqual(['PLA', 'TPU']);
    expect(settings.filament_colour).toEqual(['#EEEEEE', '#EEEEEE']);
    expect(config).toMatch(/key="name" value="Rover body"[^]*?key="extruder" value="1"/);
    expect(config.match(/key="extruder" value="2"/g)).toHaveLength(4);
    expect(config.match(/<plate>/g)).toHaveLength(2);
    expect(config.match(/<model_instance>/g)).toHaveLength(5);
  });
});
