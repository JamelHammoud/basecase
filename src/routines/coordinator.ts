import type { Plan } from './planTypes';

const WASM_URL = new URL('./coordinator.wasm', import.meta.url);
const NO_SKILL = 0xffff;

export interface RawEvent {
  t: number;
  k: string;
  a: number;
  b: number;
  c: number;
  v: number;
}

export interface ControlRead {
  body: number;
  head: number;
  tripped: boolean;
}

interface Exports {
  memory: WebAssembly.Memory;
  coord_alloc(len: number): number;

  coord_free(ptr: number, len: number): void;

  coord_load(ptr: number, len: number): number;

  coord_tick(nowMs: number): number;

  coord_drain(): number;

  coord_drain_ptr(): number;

  coord_publish(fact: number, num: number, sym: number, stampMs: number): number;

  coord_complete(token: number, ok: number, num: number, sym: number): number;

  coord_answer(token: number, index: number): number;

  coord_phase(token: number): number;

  coord_stop(): void;

  coord_watchers(): number;

  coord_control(nowMs: number): number;

  coord_control_tripped(): number;
}

let compiled: Promise<WebAssembly.Module> | null = null;

async function wasmBytes(): Promise<ArrayBuffer> {
  if (WASM_URL.protocol === 'file:') {
    const fsModule = 'node:fs/promises';
    const { readFile } = (await import(/* @vite-ignore */ fsModule)) as { readFile: (u: URL) => Promise<Uint8Array> };
    const bytes = await readFile(WASM_URL);

    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  return (await fetch(WASM_URL)).arrayBuffer();
}

export function coordinatorModule(): Promise<WebAssembly.Module> {
  compiled ??= wasmBytes().then((bytes) => WebAssembly.compile(bytes));

  return compiled;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class CoordinatorRun {
  private readonly x: Exports;

  private constructor(x: Exports) {
    this.x = x;
  }

  static async start(plan: Plan | string): Promise<CoordinatorRun> {
    const instance = new WebAssembly.Instance(await coordinatorModule(), {});
    const run = new CoordinatorRun(instance.exports as unknown as Exports);

    run.load(typeof plan === 'string' ? plan : JSON.stringify(plan));

    return run;
  }

  private load(json: string) {
    const bytes = encoder.encode(json);
    const ptr = this.x.coord_alloc(bytes.length);

    new Uint8Array(this.x.memory.buffer, ptr, bytes.length).set(bytes);

    const status = this.x.coord_load(ptr, bytes.length);

    this.x.coord_free(ptr, bytes.length);

    if (status !== 0) throw new Error(`The coordinator refused this plan (${status}).`);
  }

  tickJson(nowMs: number): string {
    if (this.x.coord_tick(nowMs) === 0) return '';

    const length = this.x.coord_drain();

    return decoder.decode(new Uint8Array(this.x.memory.buffer, this.x.coord_drain_ptr(), length));
  }

  tick(nowMs: number): RawEvent[] {
    const text = this.tickJson(nowMs);

    return text ? (JSON.parse(text) as RawEvent[]) : [];
  }

  publish(fact: number, value: { num: number; sym: number }, stampMs: number): boolean {
    return this.x.coord_publish(fact, value.num, value.sym, stampMs) === 1;
  }

  complete(token: number, ok: boolean, value = { num: 0, sym: -1 }): boolean {
    return this.x.coord_complete(token, ok ? 1 : 0, value.num, value.sym) === 1;
  }

  answer(token: number, index: number): boolean {
    return this.x.coord_answer(token, index) === 1;
  }

  phase(token: number): boolean {
    return this.x.coord_phase(token) === 1;
  }

  stop() {
    this.x.coord_stop();
  }

  watchers(): number {
    return this.x.coord_watchers() >>> 0;
  }

  control(nowMs: number): ControlRead {
    const packed = this.x.coord_control(nowMs) >>> 0;

    return { body: packed & NO_SKILL, head: packed >>> 16, tripped: this.x.coord_control_tripped() === 1 };
  }
}
