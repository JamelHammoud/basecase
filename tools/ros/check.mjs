import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const IMAGE =
  process.env.ROS_IMAGE ?? 'ros:jazzy@sha256:00b8d47a6e6384a2834e3d01fa87ae767876543baa574f2d64a75c04ea33c698';

async function loadModules() {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });

  try {
    const load = (file) => server.ssrLoadModule(file);
    const [robots, jobs, build] = await Promise.all([
      load('/src/sim/fixtures/robots.ts'),
      load('/src/sim/fixtures/robotPackage.ts'),
      load('/src/sim/robotPackage/buildRobotPackage.ts'),
    ]);

    return { fixtureRobots: robots.fixtureRobots, fixturePackageJob: jobs.fixturePackageJob, ...build };
  } finally {
    await server.close();
  }
}

function writeZip(zip, dir) {
  for (const [name, bytes] of Object.entries(unzipSync(zip))) {
    const file = path.join(dir, ...name.split('/'));

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
}

async function main() {
  const only = process.argv.slice(2);
  const { fixtureRobots, fixturePackageJob, buildRobotPackage } = await loadModules();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-ros-'));
  const robots = fixtureRobots().filter((r) => !only.length || only.includes(r.id));

  for (const robot of robots) writeZip(buildRobotPackage(fixturePackageJob(robot).job), path.join(ws, 'src'));

  console.log(`Exported ${robots.length} robot packages to ${ws}`);

  const owner = ['-e', `HOST_UID=${process.getuid?.() ?? 0}`, '-e', `HOST_GID=${process.getgid?.() ?? 0}`];
  const mounts = ['-v', `${ws}:/ws`, '-v', `${here}:/check:ro`];

  try {
    execFileSync('docker', ['run', '--rm', ...owner, ...mounts, IMAGE, 'bash', '/check/check.sh'], {
      stdio: 'inherit',
    });
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

await main();
