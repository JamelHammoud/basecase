import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fail, pass, ROOT, sh } from '../lib/gate.mjs';
import { leakCount, redact } from './leak.mjs';

const VITEST = ['vitest', 'run', '--config', 'verify/vitest.config.ts'];

const tail = (text, lines = 14) => text.trim().split('\n').slice(-lines).join('\n');

export function zooRun(mode) {
  const seed = process.env.ZOO_SEED ?? randomBytes(32).toString('hex');
  const dir = path.join(ROOT, 'verify', 'out', 'zoo', `${mode}-${seed.slice(0, 12)}`);
  const env = { ...process.env, ZOO_MODE: mode, ZOO_SEED: seed, ZOO_RUN_DIR: dir };

  return { seed, dir, env };
}

const secretsIn = (dir) => {
  const file = path.join(dir, 'secrets.json');

  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
};

export function zooCheck(name, run, file) {
  return {
    name,
    run: () => {
      const r = sh('npx', [...VITEST, file], { env: run.env });
      const output = `${r.stdout}\n${r.stderr}`;
      const secrets = secretsIn(run.dir);
      const leaks = leakCount(output, secrets);

      if (leaks) return fail(`The run printed ${leaks} hidden judge secrets; its log is withheld`);

      return r.ok ? pass(`${r.seconds.toFixed(0)} s`) : fail(redact(tail(output), secrets));
    },
  };
}
