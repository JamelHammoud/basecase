import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { packagedBinary } from './packagedApp';
import { startProbeWorld } from './probeServer';

export const UNSANDBOXED = process.env.BASECASE_CADIMPORT_UNSANDBOXED === '1';

const FIXTURES = path.resolve('verify', 'fixtures', 'cadimport');
const ENV_SECRET = 'BASECASE_PROBE_ENV_SECRET';
const SELF_TEST_MS = 600000;

export interface ImportOutcome {
  sha256?: string;
  error?: string;
  result?: Record<string, unknown>;
}

export interface ProbeOutcome {
  ok: boolean;
  error?: string;
  ms: number;
  probes?: Record<string, string>;
}

export interface OpenOutcome {
  error?: string;
  bodies?: Array<{ name: string; size: number[] }>;
}

export interface SelfTestReport {
  imports: Record<string, ImportOutcome>;
  opens: Record<string, OpenOutcome>;
  reach: ProbeOutcome;
  hang: { stopped: ProbeOutcome; next: ImportOutcome } | null;
  memory: { stopped: ProbeOutcome; next: ImportOutcome } | null;
}

export const expectedImports = (): Record<string, ImportOutcome> =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, 'expected.json'), 'utf8'));

export interface CadImportWorld {
  targets: Record<string, unknown>;
  hits: string[];
  leftBehind: () => string[];
  close: () => Promise<void>;
}

export async function startCadImportWorld(): Promise<CadImportWorld> {
  const server = await startProbeWorld('http://127.0.0.1:9/never');
  const home = fs.mkdtempSync(path.join(os.homedir(), '.basecase-probe-'));
  const secretPath = path.join(home, 'secret.txt');
  const secretModule = path.join(home, 'secret.mjs');
  const writePath = path.join(home, 'written.txt');
  const spawnMarker = path.join(home, 'spawned.txt');
  const { secretMarker, localUrl, wsUrl, externalUrl, otherOriginUrl } = server.targets;

  fs.writeFileSync(secretPath, `${secretMarker}\n`);
  fs.writeFileSync(secretModule, `export default ${JSON.stringify(secretMarker)};\n`);

  return {
    hits: server.hits,
    targets: {
      secretPath,
      secretUrl: pathToFileURL(secretPath).href,
      secretModuleUrl: pathToFileURL(secretModule).href,
      secretMarker,
      traversalUrl: `basecase-kernel://kernel/..%2f..%2f..%2f..%2f..%2f..${secretPath}`,
      writePath,
      spawnCommand: process.execPath,
      spawnArgs: ['-e', `require('fs').writeFileSync(${JSON.stringify(spawnMarker)}, 'spawned')`],
      envMarker: `env-${randomUUID()}`,
      localUrl,
      wsUrl,
      externalUrl,
      otherOriginUrl,
    },
    leftBehind: () => [writePath, `${writePath}.2`, spawnMarker].filter((f) => fs.existsSync(f)),
    close: async () => {
      await server.close();
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

const importModule = (...parts: string[]) => import(pathToFileURL(path.resolve(...parts)).href);

async function runUnsandboxed(spec: Record<string, unknown>): Promise<SelfTestReport> {
  const { createNodeConverter } = await importModule('electron', 'cadImport', 'nodeHost', 'client.mjs');
  const { runCadImportSelfTest } = await importModule('electron', 'cadImport', 'selfTest.mjs');

  return runCadImportSelfTest(createNodeConverter(), { ...spec, memoryMs: 0 });
}

const stoppedAt = (report: { running?: string } | null) =>
  report?.running ? `stopped during ${report.running}` : 'wrote no report';

function runPackaged(spec: Record<string, unknown>, dir: string): Promise<SelfTestReport> {
  const specFile = path.join(dir, 'spec.json');
  const out = path.join(dir, 'report.json');

  fs.writeFileSync(specFile, JSON.stringify({ ...spec, out }));

  return new Promise((resolve, reject) => {
    const app = spawn(packagedBinary(), [], {
      env: {
        ...process.env,
        BASECASE_CADIMPORT_SELFTEST: specFile,
        BASECASE_USER_DATA: path.join(dir, 'user-data'),
        STUDIO_AGENT_OFFLINE: '1',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    const timer = setTimeout(() => app.kill(), SELF_TEST_MS);

    app.stderr.on('data', (d) => {
      stderr = `${stderr}${d}`.slice(-4000);
    });
    app.once('exit', (code) => {
      clearTimeout(timer);

      const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;

      if (code === 0 && report && !report.running) resolve(report);
      else reject(new Error(`The packaged self-test ${stoppedAt(report)} (exit ${code}). ${stderr}`));
    });
  });
}

export async function runConverterSelfTest(
  world: CadImportWorld,
  { hangMs, memoryMs }: { hangMs: number; memoryMs: number },
): Promise<SelfTestReport> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-cadimport-test-'));
  const twoBodies = path.join(FIXTURES, 'two-bodies-inch.step');
  const broken = path.join(dir, 'broken.step');

  fs.writeFileSync(broken, fs.readFileSync(twoBodies).subarray(0, 3000));

  const spec = {
    partId: 'fixture-plate',
    url: 'https://example.com/plate',
    imports: [
      { name: 'plate.step', file: path.join(FIXTURES, 'plate.step'), ext: '.step' },
      { name: 'plate.zip', file: path.join(FIXTURES, 'plate.zip'), ext: '.zip' },
      { name: 'tetra.stl', file: path.join(FIXTURES, 'tetra.stl'), ext: '.stl' },
    ],
    opens: [
      { name: 'broken.step', file: broken },
      { name: 'two-bodies-inch.step', file: twoBodies },
    ],
    targets: world.targets,
    hangMs,
    memoryMs,
  };

  process.env[ENV_SECRET] = String(world.targets.envMarker);

  try {
    return await (UNSANDBOXED ? runUnsandboxed(spec) : runPackaged(spec, dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
