import fs from 'node:fs';
import { workerData } from 'node:worker_threads';
import { strFromU8, strToU8, unzipSync, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { resolveProjectSettings } from './projectSettings.mjs';

const { file, slicer, printer } = workerData;
const LIMIT = 512 * 1024 * 1024;
const badProject = () => new Error('Couldn’t prepare the print project. Export the 3MF instead.');
let expanded = 0;
let entries = 0;

if (fs.statSync(file).size > LIMIT) throw badProject();

const files = unzipSync(fs.readFileSync(file), {
  filter: (entry) => {
    expanded += entry.originalSize;
    entries++;

    if (expanded > LIMIT || entries > 10000) throw badProject();

    return true;
  },
});
const name = 'Metadata/project_settings.config';

if (!files[name] || files[name].byteLength > 1024 * 1024) throw badProject();

const settings = JSON.parse(strFromU8(files[name]));
const presets = settings.filament_settings_id;

if (!Array.isArray(presets) || presets.length < 1 || presets.length > 16) throw badProject();

if (!presets.every((preset) => typeof preset === 'string' && preset.length <= 512)) throw badProject();

files[name] = strToU8(JSON.stringify(resolveProjectSettings(settings, slicer, printer)));
fs.writeFileSync(file, zipSync(files, { level: 6, mtime: new Date(1980, 0, 1) }));
