import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PolicySpec } from '../../src/sim/policy';

export const FORGE_BIN = path.resolve(
  'forge',
  'target',
  'release',
  process.platform === 'win32' ? 'forge-train.exe' : 'forge-train',
);

export interface ForgeJob {
  name: string;
  xml: string;
  job: Record<string, unknown>;
}

export interface ForgeOutcome {
  ok: boolean;
  policy: PolicySpec | null;
  events: Array<Record<string, unknown>>;
  stderr: string;
}

export interface ForgeCheckSample {
  obs: number[];
  action: number[];
}

export interface ForgeRecord {
  dir: string;
  name: string;
  steps: number;
  policy: PolicySpec | null;
  check: ForgeCheckSample[];
}

const readJson = <T>(file: string): T | null =>
  fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as T) : null;

function parseLines(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
}

function runBinary(dir: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(FORGE_BIN, ['--job', dir], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-20000);
    });
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}` }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const slug = (name: string) => name.replace(/[^a-z0-9-]+/gi, '-').slice(0, 48);

export function forgeRunner(root: string) {
  const records: ForgeRecord[] = [];

  const run = async (job: ForgeJob): Promise<ForgeOutcome> => {
    const dir = path.join(root, `${String(records.length).padStart(3, '0')}-${slug(job.name)}`);

    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'model.xml'), job.xml);
    fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job.job));

    const r = await runBinary(dir);
    const events = parseLines(r.stdout);
    const done = events.find((e) => e.type === 'done');
    const policy = readJson<PolicySpec>(path.join(dir, 'policy.json'));
    const check = readJson<{ samples: ForgeCheckSample[] }>(path.join(dir, 'policy-check.json'))?.samples ?? [];

    records.push({ dir, name: job.name, steps: Number(done?.steps ?? 0), policy, check });

    return { ok: r.code === 0 && !!done, policy, events, stderr: r.stderr };
  };

  return { run, records };
}

export const forgeSteps = (records: ForgeRecord[]) => records.reduce((sum, r) => sum + r.steps, 0);

const sameWeights = (a: PolicySpec, b: PolicySpec) =>
  JSON.stringify([a.layers, a.obsMean, a.obsStd]) === JSON.stringify([b.layers, b.obsMean, b.obsStd]);

export const forgeRecordFor = (records: ForgeRecord[], policy: PolicySpec) =>
  records.find((r) => r.policy && sameWeights(r.policy, policy)) ?? null;
