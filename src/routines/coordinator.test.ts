import { describe, expect, it } from 'vitest';
import { CoordinatorRun } from './coordinator';

type Fs = {
  readFileSync: (u: URL, enc?: 'utf8') => string & Uint8Array;
  readdirSync: (u: URL, o: { withFileTypes: true }) => { name: string; isDirectory(): boolean }[];
};

type Hash = {
  update(t: string | Uint8Array): Hash;

  digest(e: 'hex'): string;
};

type Crypto = { createHash: (a: string) => Hash };

const CRATE = new URL('../../hw/coordinator/', import.meta.url);
const SOURCE = /^(Cargo\.toml|Cargo\.lock|src\/.*\.rs)$/;

async function node() {
  const fsName = 'node:fs';
  const cryptoName = 'node:crypto';

  return {
    fs: (await import(/* @vite-ignore */ fsName)) as Fs,
    crypto: (await import(/* @vite-ignore */ cryptoName)) as Crypto,
  };
}

function sources(fs: Fs, dir = CRATE, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) return entry.name === 'target' ? [] : sources(fs, new URL(`${entry.name}/`, dir), rel);

    return SOURCE.test(rel) ? [rel] : [];
  });
}

function applyLine(run: CoordinatorRun, line: string): string {
  const [op, ...rest] = line.split(' ');
  const n = rest.map(Number);
  const inputs: Record<string, () => unknown> = {
    publish: () => run.publish(n[0], { num: n[1], sym: n[2] }, n[3]),
    complete: () => run.complete(n[0], n[1] === 1, { num: n[2], sym: n[3] }),
    answer: () => run.answer(n[0], n[1]),
    phase: () => run.phase(n[0]),
  };

  if (inputs[op]) {
    inputs[op]();

    return '';
  }

  const json = run.tickJson(n[0]);

  return json ? `${n[0]} ${json}\n` : '';
}

async function replay(plan: string, inputs: string): Promise<string> {
  const run = await CoordinatorRun.start(plan);

  return inputs
    .split('\n')
    .filter(Boolean)
    .map((line) => applyLine(run, line))
    .join('');
}

describe('the coordinator WASM', () => {
  it('was rebuilt from the current Rust sources', async () => {
    const { fs, crypto } = await node();
    const hash = crypto.createHash('sha256');

    for (const rel of sources(fs).sort()) {
      hash.update(`${rel}\n${fs.readFileSync(new URL(rel, CRATE), 'utf8').replace(/\r\n/g, '\n')}\n`);
    }

    const record = JSON.parse(fs.readFileSync(new URL('./coordinator.build.json', import.meta.url), 'utf8'));
    const wasm = crypto
      .createHash('sha256')
      .update(fs.readFileSync(new URL('./coordinator.wasm', import.meta.url)))
      .digest('hex');

    expect(hash.digest('hex'), 'Run npm run build:routines').toBe(record.sources);
    expect(wasm, 'Run npm run build:routines').toBe(record.wasm);
  });

  it('gives the same trace as the native build for the same inputs', async () => {
    const { fs } = await node();
    const read = (name: string) => fs.readFileSync(new URL(`tests/fixtures/${name}`, CRATE), 'utf8');
    const trace = await replay(read('plan.json'), read('parity.inputs.txt'));

    expect(trace).toBe(read('parity.trace.txt'));
  });

  it('refuses plans it cannot run', async () => {
    await expect(CoordinatorRun.start('{"schema":2}')).rejects.toThrow();
    await expect(CoordinatorRun.start('<script>')).rejects.toThrow();
  });
});
