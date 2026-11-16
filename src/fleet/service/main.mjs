import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { database } from './database.mjs';
import { bootstrap } from './identity.mjs';
import { startService } from './http.mjs';
import { staticAssets } from './static.mjs';
import { insist } from './validation.mjs';
import { localRecoveryCommand } from './recoveryCommand.mjs';

if (['recover', 'recovery-setup', 'recovery-audit'].includes(process.argv[2])) {
  await runRecovery();
} else {
  await runService();
}

async function runRecovery() {
  let pool;

  try {
    insist(process.env.FLEET_DATABASE_URL);
    pool = await database(process.env.FLEET_DATABASE_URL);

    const result = await localRecoveryCommand(pool, process.argv.slice(2));

    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('Fleet recovery refused\n');
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}

async function runService() {
  insist(process.env.FLEET_DATABASE_URL);

  const pool = await database(process.env.FLEET_DATABASE_URL);

  if (process.argv[2] === 'bootstrap') {
    const identity = await bootstrap(pool, {
      name: process.env.FLEET_ORGANIZATION,
      email: process.env.FLEET_EMAIL,
      password: process.env.FLEET_BOOTSTRAP_PASSWORD,
    });

    process.stdout.write(`${JSON.stringify(identity)}\n`);
    await pool.end();
  } else {
    const tls = process.env.FLEET_TLS_CERT
      ? { cert: await readFile(process.env.FLEET_TLS_CERT), key: await readFile(process.env.FLEET_TLS_KEY) }
      : undefined;
    const origin = process.env.FLEET_ORIGIN ?? 'http://127.0.0.1:7440';
    const service = await startService({
      pool,
      origin,
      tls,
      host: process.env.FLEET_BIND,
      assets: staticAssets(path.resolve(process.env.FLEET_WEB_DIRECTORY ?? 'dist-web')),
    });
    const stop = async () => {
      await service.close();
      await pool.end();
    };

    installStopHandlers(stop);

    process.stdout.write(`Basecase Fleet: ${origin}/fleet\n`);
  }
}

function installStopHandlers(stop) {
  if (process.platform === 'win32') return;

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
