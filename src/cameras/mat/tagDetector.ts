import { TAG36H11_BIT_X, TAG36H11_BIT_Y, TAG36H11_CODES } from './tag36h11Codes';

export interface TagDetection {
  id: number;
  hamming: number;
  corners: [number, number][];
}

export interface TagDetector {
  detect(gray: Uint8Array, width: number, height: number): TagDetection[];

  dispose(): void;
}

export const APRILTAG_WASM_PATH = '/apriltag/apriltag.wasm';

const RESULT_STRIDE = 10;
const WASM_FROM_SOURCE = '../../../public/apriltag/apriltag.wasm';

interface TagExports {
  memory: WebAssembly.Memory;
  tags_alloc(len: number): number;

  tags_free(ptr: number, len: number): void;

  tags_init(codesPtr: number, count: number, bitXPtr: number, bitYPtr: number): void;

  tags_frame(width: number, height: number): number;

  tags_detect(width: number, height: number): number;

  tags_results(): number;
}

interface NodeBuiltins {
  process?: { getBuiltinModule?: (id: string) => { readFileSync: (url: URL) => Uint8Array } | undefined };
}

async function wasmBytes(): Promise<BufferSource> {
  const local = new URL(WASM_FROM_SOURCE, import.meta.url);
  const fs = local.protocol === 'file:' ? (globalThis as NodeBuiltins).process?.getBuiltinModule?.('node:fs') : null;

  if (fs) return fs.readFileSync(local) as BufferSource;

  const response = await fetch(new URL(APRILTAG_WASM_PATH, self.location.href));

  if (!response.ok) throw new Error(`Couldn’t load the tag detector (${response.status}).`);

  return response.arrayBuffer();
}

function codebookBytes(): { codes: Uint8Array; bitX: Uint8Array; bitY: Uint8Array } {
  const words = new Uint32Array(TAG36H11_CODES.length * 2);

  TAG36H11_CODES.forEach((code, i) => {
    words[2 * i] = code >>> 0;
    words[2 * i + 1] = Math.floor(code / 2 ** 32);
  });

  return {
    codes: new Uint8Array(words.buffer),
    bitX: Uint8Array.from(TAG36H11_BIT_X),
    bitY: Uint8Array.from(TAG36H11_BIT_Y),
  };
}

function initCodebook(wasm: TagExports): void {
  const parts = codebookBytes();
  const buffers = [parts.codes, parts.bitX, parts.bitY].map((bytes) => ({
    bytes,
    ptr: wasm.tags_alloc(bytes.length),
  }));

  buffers.forEach(({ bytes, ptr }) => new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes));
  wasm.tags_init(buffers[0].ptr, TAG36H11_CODES.length, buffers[1].ptr, buffers[2].ptr);
  buffers.forEach(({ bytes, ptr }) => wasm.tags_free(ptr, bytes.length));
}

function readDetections(wasm: TagExports, count: number): TagDetection[] {
  const values = new Float32Array(wasm.memory.buffer, wasm.tags_results(), count * RESULT_STRIDE);
  const detections: TagDetection[] = [];

  for (let i = 0; i < count; i++) {
    const at = i * RESULT_STRIDE;
    const corners: [number, number][] = [0, 1, 2, 3].map((k) => [values[at + 2 + 2 * k], values[at + 3 + 2 * k]]);

    detections.push({ id: values[at], hamming: values[at + 1], corners });
  }

  return detections;
}

function detector(wasm: TagExports): TagDetector {
  let live: TagExports | null = wasm;

  return {
    detect(gray, width, height) {
      if (!live || gray.length < width * height) return [];

      const ptr = live.tags_frame(width, height);

      new Uint8Array(live.memory.buffer, ptr, width * height).set(gray.subarray(0, width * height));

      return readDetections(live, live.tags_detect(width, height));
    },
    dispose() {
      live = null;
    },
  };
}

export async function loadTagDetector(bytes?: BufferSource): Promise<TagDetector> {
  const { instance } = await WebAssembly.instantiate(bytes ?? (await wasmBytes()));
  const wasm = instance.exports as unknown as TagExports;

  initCodebook(wasm);

  return detector(wasm);
}
