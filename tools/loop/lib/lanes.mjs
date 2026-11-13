import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = path.join(import.meta.dirname, '..', 'lanes');

export const laneNames = () =>
  fs
    .readdirSync(DIR)
    .filter((file) => file.endsWith('.mjs') && !file.endsWith('.test.mjs'))
    .map((file) => file.slice(0, -'.mjs'.length))
    .sort();

export const laneModule = (name) => import(pathToFileURL(path.join(DIR, `${name}.mjs`)).href);
