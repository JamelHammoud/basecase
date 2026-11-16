import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort } from './postgres.mjs';
import { signingKey } from './samlFixture.mjs';

const execute = promisify(execFile);
const directory = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export async function localIdp() {
  const port = await freePort();
  const issuer = `http://127.0.0.1:${port}/issuer`;
  const key = signingKey();
  const config = { port: 8080, host: '0.0.0.0', issuer, key };
  const native = process.platform === 'win32';
  let container;
  let child;

  if (native) {
    child = spawn(process.execPath, [path.join(directory, 'idpServer.mjs')], {
      env: { ...process.env, FLEET_TEST_IDP: JSON.stringify({ ...config, port, host: '127.0.0.1' }) },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
  } else {
    const dependencies = path.resolve(path.dirname(realpathSync(require.resolve('xml-crypto/package.json'))), '..');
    const result = await execute('docker', [
      'run',
      '--rm',
      '-d',
      '-p',
      `127.0.0.1:${port}:8080`,
      '-v',
      `${path.join(directory, 'idpServer.mjs')}:/idp/idpServer.mjs:ro`,
      '-v',
      `${path.join(directory, 'samlFixture.mjs')}:/idp/samlFixture.mjs:ro`,
      '-v',
      `${dependencies}:/idp/node_modules:ro`,
      '-e',
      `FLEET_TEST_IDP=${JSON.stringify(config)}`,
      'node:26-alpine',
      'node',
      '/idp/idpServer.mjs',
    ]);

    container = result.stdout.trim();
    child = spawn('docker', ['logs', '--follow', container]);
  }

  const exited = new Promise((resolve) => child.once('exit', resolve));
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;

    if (native && !child.connected) return;

    if (native) child.send('stop');
    else child.kill();

    await exited;
  };

  try {
    await new Promise((resolve, reject) => {
      let output = '';
      const read = (chunk) => {
        output = (output + String(chunk)).slice(-4096);

        if (output.includes('FLEET_IDP_READY')) resolve();
      };

      child.stdout.on('data', read);
      child.stderr.on('data', read);
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Local IdP exited ${code}: ${output}`)));
    });
  } catch (error) {
    await stop();

    if (container) await execute('docker', ['stop', '--time', '0', container]);

    throw error;
  }

  return {
    issuer,
    entryPoint: `http://127.0.0.1:${port}/sso`,
    key,
    async close() {
      await stop();

      if (container) await execute('docker', ['stop', '--time', '0', container]);
    },
  };
}
