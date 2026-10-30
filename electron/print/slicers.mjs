import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slicerVersion } from './profiles.mjs';

export const SLICERS = {
  bambu: { name: 'Bambu Studio', app: 'BambuStudio.app', binary: 'BambuStudio', env: 'BASECASE_BAMBU_STUDIO' },
  orca: { name: 'OrcaSlicer', app: 'OrcaSlicer.app', binary: 'OrcaSlicer', env: 'BASECASE_ORCA_SLICER' },
  prusa: { name: 'PrusaSlicer', app: 'PrusaSlicer.app', binary: 'PrusaSlicer', env: 'BASECASE_PRUSA_SLICER' },
};

export const DOWNLOAD_PAGES = {
  bambu: 'https://bambulab.com/en/download/studio',
  orca: 'https://github.com/SoftFever/OrcaSlicer/releases',
  prusa: 'https://www.prusa3d.com/page/prusaslicer_424/',
};

function candidates(spec) {
  return [
    process.env[spec.env],
    path.join('/Applications', spec.app),
    path.join(os.homedir(), 'Applications', spec.app),
  ].filter(Boolean);
}

export function findSlicerApp(kind) {
  const spec = SLICERS[kind];

  if (!spec) return null;

  const found = candidates(spec).find((p) => fs.existsSync(path.join(p, 'Contents', 'MacOS', spec.binary)));

  if (!found) return null;

  return {
    kind,
    name: spec.name,
    path: found,
    binary: path.join(found, 'Contents', 'MacOS', spec.binary),
    profiles: path.join(found, 'Contents', 'Resources', 'profiles'),
    version: slicerVersion(found),
  };
}

export function detectSlicers() {
  return Object.keys(SLICERS)
    .map((kind) => findSlicerApp(kind))
    .filter(Boolean);
}
