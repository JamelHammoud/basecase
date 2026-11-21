import fs from 'node:fs';
import loadMujoco from '@mujoco/mujoco';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const destination = path.resolve(process.argv[2]);
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});

async function evaluate() {
  const directory = path.join(destination, '8');
  const model = JSON.parse(fs.readFileSync(path.join(directory, 'sim.json'), 'utf8'));
  const policy = JSON.parse(fs.readFileSync(path.join(directory, 'policy.json'), 'utf8'));
  const { kitEnvironment } = await server.ssrLoadModule('/src/skills/kitEnvironment.ts');
  const { runArena } = await server.ssrLoadModule('/src/skills/arena.ts');
  const environment = kitEnvironment(model, 'settle-to-neutral');
  const evidence = await runArena({
    mj: await loadMujoco(),
    model,
    environment,
    contract: environment.contract,
    controller: { kind: 'policy', policy, robot: model.robots[0].key },
    salt: new Uint8Array(32),
  });

  fs.writeFileSync(path.join(directory, 'arena.json'), JSON.stringify(evidence));
}

async function generate() {
  const { closedLinkage, closedLinkages } = await server.ssrLoadModule('/src/sim/fixtures/closedLinkages.ts');
  const { trainingJob } = await server.ssrLoadModule('/src/sim/trainingJob.ts');
  const manifest = [];

  for (const [i, spec] of closedLinkages.entries()) {
    const started = performance.now();
    const { model, builds } = closedLinkage(spec);
    const directory = path.join(destination, String(i));

    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'model.xml'), model.xml);
    fs.writeFileSync(path.join(directory, 'sim.json'), JSON.stringify(model));
    manifest.push({
      name: spec.name,
      directory: String(i),
      actions: builds.length,
      floating: !!spec.floating,
      preparationMs: performance.now() - started,
    });

    if (!spec.floating) continue;

    const job = trainingJob(model, model.robots[0].key, { task: 'stand', minutes: 1, command: [0, 0, 0] }, 'Four-bar');

    fs.writeFileSync(
      path.join(directory, 'job.json'),
      JSON.stringify({
        ...job,
        backend: 'metal',
        envs: 4,
        threads: 1,
        maxIterations: 1,
        gateEvery: 1,
        evalSeeds: 2,
        seed: 14,
      }),
    );
  }

  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest));
}

try {
  if (process.argv[3] === '--evaluate') await evaluate();
  else await generate();
} finally {
  await server.close();
}
