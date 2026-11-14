import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

async function exportFixture() {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });

  try {
    const [fixtures, exporter] = await Promise.all([
      server.ssrLoadModule('/src/datasets/fixtures.ts'),
      server.ssrLoadModule('/src/datasets/lerobotExport.ts'),
    ]);

    return exporter.datasetFiles(await fixtures.fixtureSpec());
  } finally {
    await server.close();
  }
}

function writeFiles(files, dir) {
  for (const [name, bytes] of Object.entries(files)) {
    const file = path.join(dir, ...name.split('/'));

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-lerobot-'));

  try {
    writeFiles(await exportFixture(), dir);
    console.log(`Exported the fixture dataset to ${dir}`);
    execFileSync('uv', ['run', '--script', path.join(here, 'check_dataset.py'), dir], { stdio: 'inherit' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

await main();
