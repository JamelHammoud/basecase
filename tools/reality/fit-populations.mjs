import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(root, 'src', 'reality', 'servoPopulations.json');
const PARTS = path.join(root, 'scratch', 'populations');
const SEED = 'basecase-servo-populations-1';

async function withModules(entries, work) {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });

  try {
    return await work(await Promise.all(entries.map((e) => server.ssrLoadModule(e))));
  } finally {
    await server.close();
  }
}

async function calibrateFamily(family) {
  const mj = await loadMujoco();

  await withModules(['/verify/twin/evaluate.ts', '/src/reality/calibrate.ts'], async ([twin, reality]) => {
    const fits = [];

    for (const [i, { logs }] of twin.hiddenUnits(SEED, family).entries()) {
      const c = await reality.calibrateServo({ family, logs: logs.calibration, mj });

      fits.push({ verdict: c.verdict, rung: c.rung, volts: c.volts, servo: c.servo, scales: c.scales });
      console.log(`${family} unit ${i + 1}: ${c.verdict} (${c.rung})`);
    }

    fs.mkdirSync(PARTS, { recursive: true });
    fs.writeFileSync(path.join(PARTS, `${family}.json`), JSON.stringify(fits));
  });
}

const run = (family) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), family], { stdio: 'inherit' });

    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${family} exited with ${code}`))));
  });

async function main() {
  const [arg] = process.argv.slice(2);

  if (arg && arg !== '--merge') return calibrateFamily(arg);

  const families = ['sts3215', 'xl330'];

  if (!arg) await Promise.all(families.map(run));

  await withModules(['/src/reality/population.ts'], ([{ fitPopulation }]) => {
    const populations = families.map((f) => {
      const fits = JSON.parse(fs.readFileSync(path.join(PARTS, `${f}.json`), 'utf8'));
      const calibrations = fits.map((fit) => ({ ...fit, conditions: { volts: fit.volts, temperatureC: 25 } }));
      const population = fitPopulation(calibrations, 'emulated');

      if (!population) throw new Error(`${f}: fewer than 8 units read as measured`);

      return { ...population, fits: fits.map(({ verdict, scales }) => ({ verdict, scales })) };
    });

    fs.writeFileSync(OUT, `${JSON.stringify({ seed: SEED, populations }, null, 2)}\n`);
  });
}

await main();
