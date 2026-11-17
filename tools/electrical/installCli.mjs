import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });

  if (result.error) throw new Error(`${command}: ${result.error.message}`, { cause: result.error });

  if (result.status !== 0) {
    throw new Error(`${command}: exit ${result.status}, signal ${result.signal ?? 'none'}\n${result.stderr}`);
  }

  return result.stdout;
};

async function windowsCli() {
  const folder = path.resolve('scratch', 'kicad-9.0.6');
  const installer = path.resolve('scratch', 'kicad-9.0.6-x86_64.exe');
  const url = 'https://github.com/KiCad/kicad-source-mirror/releases/download/9.0.6/kicad-9.0.6-x86_64.exe';
  const expected = 'f75347945e092df7615d2a3d3acd41d868d13f3b9be031ed00ecdf1c79f9e96c';
  const response = await fetch(url);

  if (!response.ok || !response.body) throw new Error('KiCad download failed.');

  const hash = createHash('sha256');
  let bytes = 0;
  const checked = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      hash.update(chunk);
      callback(bytes > 1_200_000_000 ? new Error('KiCad download is too large.') : null, chunk);
    },
  });

  await fsp.mkdir(path.dirname(installer), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), checked, fs.createWriteStream(installer));

  if (hash.digest('hex') !== expected) throw new Error('KiCad installer checksum differs.');

  run(installer, ['/S', '/currentuser', `/D=${folder}`]);

  const executable = path.join(folder, 'bin', 'kicad-cli.exe');

  if (run(executable, ['version']).trim() !== '9.0.6') throw new Error('KiCad version differs.');

  await fsp.appendFile(process.env.GITHUB_ENV, `BASECASE_KICAD_CLI=${executable}\n`);
  await fsp.appendFile(process.env.GITHUB_PATH, `${path.dirname(executable)}\n`);
  await fsp.rm(installer);
}

function selectedBrowserShard(shard) {
  const files = run(process.execPath, [
    'node_modules/vitest/vitest.mjs',
    'list',
    '--config',
    'vitest.e2e.config.ts',
    '--filesOnly',
    '--shard',
    shard,
  ]);

  return {
    native:
      files.includes('boardRouted.e2e.test.ts') ||
      files.includes('boardRouting.e2e.test.ts') ||
      files.includes('kitElectrical.e2e.test.ts'),
    routing: files.includes('boardRouting.e2e.test.ts'),
  };
}

async function main() {
  const shard = process.argv[process.argv.indexOf('--browser-shard') + 1];

  const selected = process.argv.includes('--browser-shard')
    ? selectedBrowserShard(shard)
    : { native: true, routing: false };

  if (!selected.native) return;

  if (selected.routing) {
    const { installBoardRouter } = await import('./installRouter.mjs');
    const directory = await installBoardRouter(path.resolve('scratch/routing-tools'));

    await fsp.appendFile(process.env.GITHUB_ENV, `BASECASE_ROUTING_TOOLS=${directory}\n`);
  }

  if (process.platform === 'linux') {
    run('docker', ['pull', 'kicad/kicad:9.0.6']);
    await fsp.appendFile(process.env.GITHUB_ENV, 'BASECASE_KICAD_DOCKER=1\n');

    return;
  }

  if (process.platform === 'win32') await windowsCli();
}

await main();
