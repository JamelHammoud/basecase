import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slicerVersion } from './profiles.mjs';

export const SLICERS = {
  bambu: {
    name: 'Bambu Studio',
    app: 'BambuStudio.app',
    binary: 'BambuStudio',
    windows: { folder: 'Bambu Studio', exe: 'bambu-studio.exe' },
    env: 'BASECASE_BAMBU_STUDIO',
  },
  orca: {
    name: 'OrcaSlicer',
    app: 'OrcaSlicer.app',
    binary: 'OrcaSlicer',
    windows: { folder: 'OrcaSlicer', exe: 'orca-slicer.exe' },
    env: 'BASECASE_ORCA_SLICER',
  },
  prusa: {
    name: 'PrusaSlicer',
    app: 'PrusaSlicer.app',
    binary: 'PrusaSlicer',
    windows: { folder: path.join('Prusa3D', 'PrusaSlicer'), exe: 'prusa-slicer-console.exe' },
    env: 'BASECASE_PRUSA_SLICER',
  },
};

export const DOWNLOAD_PAGES = {
  bambu: 'https://bambulab.com/en/download/studio',
  orca: 'https://github.com/SoftFever/OrcaSlicer/releases',
  prusa: 'https://www.prusa3d.com/page/prusaslicer_424/',
};

function macApp(spec, env) {
  const found = [env[spec.env], path.join('/Applications', spec.app), path.join(os.homedir(), 'Applications', spec.app)]
    .filter(Boolean)
    .find((p) => fs.existsSync(path.join(p, 'Contents', 'MacOS', spec.binary)));

  if (!found) return null;

  return {
    path: found,
    binary: path.join(found, 'Contents', 'MacOS', spec.binary),
    profiles: path.join(found, 'Contents', 'Resources', 'profiles'),
    version: slicerVersion(found),
  };
}

function windowsApp(spec, env) {
  const roots = [
    env.ProgramFiles,
    env['ProgramFiles(x86)'],
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs'),
  ];
  const found = [env[spec.env], ...roots.filter(Boolean).map((root) => path.join(root, spec.windows.folder))]
    .filter(Boolean)
    .find((p) => fs.existsSync(path.join(p, spec.windows.exe)));

  if (!found) return null;

  return {
    path: found,
    binary: path.join(found, spec.windows.exe),
    profiles: path.join(found, 'resources', 'profiles'),
    version: null,
  };
}

export function findSlicerApp(kind, { platform = process.platform, env = process.env } = {}) {
  const spec = SLICERS[kind];

  if (!spec) return null;

  const found = platform === 'win32' ? windowsApp(spec, env) : macApp(spec, env);

  return found && { kind, name: spec.name, ...found };
}

export function detectSlicers() {
  return Object.keys(SLICERS)
    .map((kind) => findSlicerApp(kind))
    .filter(Boolean);
}

const DEFAULT_ORDER = ['orca', 'bambu'];

export const slicerOrder = (printer) => (printer?.slicers?.length ? printer.slicers : DEFAULT_ORDER);

export function slicerFor(printer, { wanted, platform, env } = {}) {
  for (const kind of wanted ? [wanted] : slicerOrder(printer)) {
    const app = findSlicerApp(kind, { platform, env });

    if (app) return app;
  }

  return null;
}
