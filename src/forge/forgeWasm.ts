import type { ForgeGpu } from './forgeGpu';
import type { FieldValue } from './forgeFields';
import { errorMessage } from '../utils/errorMessage';

interface Exports {
  memory: WebAssembly.Memory;
  forge_alloc: (len: number) => number;
  forge_free: (ptr: number, len: number) => void;
  forge_reset: () => void;
  forge_field: (kind: number, at: number, nameLen: number, dataLen: number) => void;
  forge_prepare: () => bigint;
  forge_train: (header: number, headerLen: number, row: number, rowLen: number) => bigint;
}

interface Jspi {
  Suspending: new (fn: (...args: number[]) => Promise<number>) => unknown;
  promising: (fn: (...args: number[]) => bigint) => (...args: number[]) => Promise<bigint>;
}

export type ForgeEvent = Record<string, unknown>;

export interface ForgeWasm {
  reset: () => void;
  field: (value: FieldValue) => void;
  prepare: () => Record<string, unknown>;
  train: (header: object, row: Float64Array) => Promise<Record<string, unknown>>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const jspi = () => WebAssembly as unknown as Jspi;

class Memory {
  exports!: Exports;

  bytes(ptr: number, len: number) {
    return new Uint8Array(this.exports.memory.buffer, ptr, len);
  }

  words(ptr: number, len: number) {
    return new Uint32Array(this.exports.memory.buffer, ptr, len);
  }

  text(ptr: number, len: number) {
    return decoder.decode(this.bytes(ptr, len));
  }

  reply(packed: bigint) {
    const ptr = Number(packed >> 32n);
    const len = Number(packed & 0xffffffffn);

    return JSON.parse(this.text(ptr, len)) as Record<string, unknown>;
  }

  withBytes<T>(data: Uint8Array, apply: (ptr: number, len: number) => T): T {
    const ptr = this.exports.forge_alloc(data.byteLength);

    this.bytes(ptr, data.byteLength).set(data);

    try {
      return apply(ptr, data.byteLength);
    } finally {
      this.exports.forge_free(ptr, data.byteLength);
    }
  }
}

function gpuImports(gpu: ForgeGpu, mem: Memory, failures: { last: string }) {
  const guarded = (work: (...args: number[]) => Promise<void>) =>
    new (jspi().Suspending)(async (...args: number[]) => {
      try {
        await work(...args);

        return 0;
      } catch (e) {
        failures.last = errorMessage(e);

        return 1;
      }
    });

  const load = async (batch: number, src: number, srcLen: number, tables: number) => {
    const w = mem.words(tables, 8).slice();
    const buffer = mem.exports.memory.buffer;

    await gpu.load(batch, {
      source: mem.text(src, srcLen),
      reals: new Float32Array(buffer, w[0], w[1]).slice(),
      ints: new Int32Array(buffer, w[2], w[3]).slice(),
      nstate: w[4],
      nreals: w[5],
      nints: w[6],
      worlds: w[7],
    });
  };

  const run = async (batch: number, callPtr: number) => {
    const w = mem.words(callPtr, 12).slice();
    const buffer = mem.exports.memory.buffer;
    const result = await gpu.run(batch, {
      entry: w[0],
      groups: w[1],
      params: w.slice(2, 6),
      io: new Float32Array(buffer, w[6], w[7]).slice(),
      order: new Uint32Array(buffer, w[8], w[9]).slice(),
      stats: new Int32Array(buffer, w[10], w[11]),
    });
    const after = mem.exports.memory.buffer;

    new Float32Array(after, w[6], w[7]).set(result.io);
    new Int32Array(after, w[10], w[11]).set(result.stats);
  };

  return { gpu_load: guarded(load as never), gpu_run: guarded(run as never) };
}

export async function loadForgeWasm(bytes: BufferSource, gpu: ForgeGpu, onEvent: (e: ForgeEvent) => void) {
  const mem = new Memory();
  const failures = { last: '' };
  const forge = {
    now_ms: () => performance.now(),
    emit: (ptr: number, len: number) => onEvent(JSON.parse(mem.text(ptr, len)) as ForgeEvent),
    gpu_workgroup_bytes: () => gpu.workgroupBytes,
    gpu_open: () => gpu.open(),
    gpu_error: (ptr: number, cap: number) => {
      const text = encoder.encode(failures.last).slice(0, cap);

      mem.bytes(ptr, text.byteLength).set(text);

      return text.byteLength;
    },
    ...gpuImports(gpu, mem, failures),
  };
  const { instance } = await WebAssembly.instantiate(bytes, { forge } as unknown as WebAssembly.Imports);
  const exports = instance.exports as unknown as Exports;
  const train = jspi().promising(exports.forge_train);

  mem.exports = exports;

  return {
    reset: () => exports.forge_reset(),
    field: (v: FieldValue) => {
      const name = encoder.encode(v.name);
      const joined = new Uint8Array(name.byteLength + v.bytes.byteLength);

      joined.set(name);
      joined.set(v.bytes, name.byteLength);
      mem.withBytes(joined, (at) => exports.forge_field(v.kind, at, name.byteLength, v.bytes.byteLength));
    },
    prepare: () => mem.reply(exports.forge_prepare()),
    train: async (header: object, row: Float64Array) => {
      const head = encoder.encode(JSON.stringify(header));
      const rowBytes = new Uint8Array(row.buffer, row.byteOffset, row.byteLength);
      const headPtr = exports.forge_alloc(head.byteLength);
      const rowPtr = exports.forge_alloc(rowBytes.byteLength);

      mem.bytes(headPtr, head.byteLength).set(head);
      mem.bytes(rowPtr, rowBytes.byteLength).set(rowBytes);

      const packed = await train(headPtr, head.byteLength, rowPtr, row.length);

      return mem.reply(packed);
    },
  } satisfies ForgeWasm;
}
