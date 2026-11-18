import fs from 'node:fs';
import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { selfContactArm } from '../sim/fixtures/selfContactArm';
import { answer, integrationField, type FieldValue } from './forgeFields';

interface Exports {
  memory: WebAssembly.Memory;
  forge_alloc: (length: number) => number;
  forge_free: (pointer: number, length: number) => void;
  forge_reset: () => void;
  forge_field: (kind: number, pointer: number, nameLength: number, dataLength: number) => void;
  forge_prepare: () => bigint;
}

function feed(exports: Exports, value: FieldValue) {
  const name = new TextEncoder().encode(value.name);
  const bytes = new Uint8Array(name.length + value.bytes.length);

  bytes.set(name);
  bytes.set(value.bytes, name.length);

  const pointer = exports.forge_alloc(bytes.length);

  new Uint8Array(exports.memory.buffer, pointer, bytes.length).set(bytes);
  exports.forge_field(value.kind, pointer, name.length, value.bytes.length);
  exports.forge_free(pointer, bytes.length);
}

function prepare(exports: Exports): { missing?: string[]; refused?: string; ready?: boolean } {
  const packed = exports.forge_prepare();
  const pointer = Number(packed >> 32n);
  const length = Number(packed & 0xffffffffn);

  return JSON.parse(new TextDecoder().decode(new Uint8Array(exports.memory.buffer, pointer, length)));
}

it('refuses self-contact exclusions in the shipped accelerated engine instead of changing physics', async () => {
  const mj = await loadMujoco();
  const model = mj.MjModel.from_xml_string(selfContactArm(true).xml);
  const bytes = fs.readFileSync(new URL('./forge.wasm', import.meta.url));
  const refuse = () => 1;
  const { instance } = await WebAssembly.instantiate(bytes, {
    forge: {
      now_ms: () => 0,
      emit: () => {},
      gpu_workgroup_bytes: () => 32768,
      gpu_open: refuse,
      gpu_load: refuse,
      gpu_run: refuse,
      gpu_error: () => 0,
    },
  });
  const exports = instance.exports as unknown as Exports;

  try {
    exports.forge_reset();
    feed(exports, integrationField(mj));

    let result = prepare(exports);

    for (let round = 0; result.missing && round < 600; round++) {
      result.missing.forEach((field) => feed(exports, answer(mj, model, field)));
      result = prepare(exports);
    }

    expect(result.ready).not.toBe(true);
    expect(result.refused).toContain('contact exclusions');
  } finally {
    model.delete();
  }
});
