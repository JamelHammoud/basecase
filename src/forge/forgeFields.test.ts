import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import { kitJob } from '../skills/kitJob';
import { answer, integrationField, type FieldValue } from './forgeFields';
import { settleStart, type StartJob } from './forgeStart';

interface Exports {
  memory: WebAssembly.Memory;
  forge_alloc: (len: number) => number;
  forge_free: (ptr: number, len: number) => void;
  forge_reset: () => void;
  forge_field: (kind: number, at: number, nameLen: number, dataLen: number) => void;
  forge_prepare: () => bigint;
}

const refuse = () => 1;
const HOST = {
  now_ms: () => 0,
  emit: () => {},
  gpu_workgroup_bytes: () => 32768,
  gpu_open: () => 1,
  gpu_load: refuse,
  gpu_run: refuse,
  gpu_error: () => 0,
};

interface Fs {
  readFileSync: (u: URL, enc?: 'utf8') => string & Uint8Array;
}

const fsName = 'node:fs';
const nodeFs = async () => (await import(/* @vite-ignore */ fsName)) as Fs;
const buildScript = '../../tools/forge/build-web.mjs';

async function forgeExports() {
  const bytes = (await nodeFs()).readFileSync(new URL('./forge.wasm', import.meta.url));
  const { instance } = await WebAssembly.instantiate(new Uint8Array(bytes), { forge: HOST });

  return instance.exports as unknown as Exports;
}

function feed(ex: Exports, value: FieldValue) {
  const name = new TextEncoder().encode(value.name);
  const joined = new Uint8Array(name.length + value.bytes.length);

  joined.set(name);
  joined.set(value.bytes, name.length);

  const at = ex.forge_alloc(joined.length);

  new Uint8Array(ex.memory.buffer, at, joined.length).set(joined);
  ex.forge_field(value.kind, at, name.length, value.bytes.length);
  ex.forge_free(at, joined.length);
}

function prepare(ex: Exports) {
  const packed = ex.forge_prepare();
  const at = Number(packed >> 32n);
  const len = Number(packed & 0xffffffffn);

  return JSON.parse(new TextDecoder().decode(new Uint8Array(ex.memory.buffer, at, len))) as {
    missing?: string[];
    ready?: boolean;
    refused?: string;
  };
}

describe('Forge in a tab', () => {
  it('ships a forge.wasm built from the current Rust sources', async () => {
    const fs = await nodeFs();
    const { sourceHash } = (await import(/* @vite-ignore */ buildScript)) as { sourceHash: () => string };
    const record = JSON.parse(fs.readFileSync(new URL('./forge.build.json', import.meta.url), 'utf8'));

    expect(record.sources, 'Run npm run build:forge-web').toBe(sourceHash());
  });

  it('settles the Kit start on WASM MuJoCo and lowers the model from fields the WASM asks for', async () => {
    const mj = await loadMujoco();
    const model = fixtureModel('quad-servo');
    const job = kitJob(model, 'stand', { minutes: 1, seed: 0 }) as unknown as StartJob;
    const compiled = mj.MjModel.from_xml_string(model.xml);
    const ex = await forgeExports();

    try {
      const start = settleStart(mj, compiled, job);

      expect(start.row).toHaveLength(mj.mj_stateSize(compiled, mj.mjtState.mjSTATE_INTEGRATION.value));
      expect(start.holdsPose).toBe(true);
      expect(start.z0).toBeGreaterThan(0.05);

      ex.forge_reset();
      feed(ex, integrationField(mj));

      let reply = prepare(ex);

      for (let round = 0; reply.missing && round < 600; round++) {
        reply.missing.forEach((key) => feed(ex, answer(mj, compiled, key)));
        reply = prepare(ex);
      }

      expect(reply).toEqual({ ready: true });
    } finally {
      compiled.delete();
    }
  });
});
