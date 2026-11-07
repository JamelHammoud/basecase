export type Cmp = '<' | '<=' | '>' | '>=';
export type Point = [string, string, string];

export type Expr =
  { signal: string } | { abs: Expr } | { delta: Expr } | { dist: [Point, Point] } | { angle: [Point, Point] };

export interface Atom {
  expr: Expr;
  cmp: Cmp;
  value: number;
  scale: number;
}

export type State = { all: State[] } | { any: State[] } | { not: State } | { atom: Atom };

export type TimeWindow = 'whole' | { from: number; to: number } | { last: number };

export type Formula =
  | { all: Formula[] }
  | { any: Formula[] }
  | { always: { window: TimeWindow; state: State } }
  | { eventually: { window: TimeWindow; state: State } }
  | { hold_for: { seconds: number; state: State; within: TimeWindow } }
  | { sequence: Formula[] };

export interface NamedFailure {
  label: string;
  formula: Formula;
}

export interface Contract {
  version: 1;
  success: Formula;
  failures: NamedFailure[];
}

export interface Trace {
  dt: number;
  signals: Record<string, number[]>;
}

export interface ContractResult {
  passed: boolean;
  margin: number;
  worstAt: number;
  failed: string[];
}

interface ContractExports {
  memory: WebAssembly.Memory;
  contract_alloc(len: number): number;

  contract_free(ptr: number, len: number): void;

  contract_evaluate(contractPtr: number, contractLen: number, tracePtr: number, traceLen: number): bigint;

  contract_check(contractPtr: number, contractLen: number): bigint;
}

interface NodeBuiltins {
  process?: { getBuiltinModule?: (id: string) => { readFileSync: (url: URL) => Uint8Array } | undefined };
}

const wasmUrl = new URL('./contract.wasm', import.meta.url);

async function wasmBytes(): Promise<BufferSource> {
  if (wasmUrl.protocol !== 'file:') return (await fetch(wasmUrl)).arrayBuffer();

  const fs = (globalThis as NodeBuiltins).process?.getBuiltinModule?.('node:fs');

  if (!fs) return (await fetch(wasmUrl)).arrayBuffer();

  return fs.readFileSync(wasmUrl) as BufferSource;
}

let instance: Promise<ContractExports> | null = null;

function loadContractWasm(): Promise<ContractExports> {
  instance ??= wasmBytes()
    .then((bytes) => WebAssembly.instantiate(bytes))
    .then(({ instance: made }) => made.exports as unknown as ContractExports);

  return instance;
}

function callWithTexts(wasm: ContractExports, texts: string[], call: (args: number[]) => bigint): string {
  const encoder = new TextEncoder();
  const encoded = texts.map((text) => encoder.encode(text));
  const buffers = encoded.map((bytes) => ({ ptr: wasm.contract_alloc(bytes.length), len: bytes.length }));

  encoded.forEach((bytes, i) => new Uint8Array(wasm.memory.buffer, buffers[i].ptr, bytes.length).set(bytes));

  const packed = call(buffers.flatMap((b) => [b.ptr, b.len]));
  const ptr = Number(BigInt.asUintN(64, packed) >> 32n);
  const len = Number(BigInt.asUintN(32, packed));
  const reply = new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, ptr, len));

  wasm.contract_free(ptr, len);
  buffers.forEach((b) => wasm.contract_free(b.ptr, b.len));

  return reply;
}

async function ask<T>(texts: string[], call: (wasm: ContractExports, args: number[]) => bigint): Promise<T> {
  const wasm = await loadContractWasm();
  let reply: string;

  try {
    reply = callWithTexts(wasm, texts, (args) => call(wasm, args));
  } catch (error) {
    instance = null;

    throw error;
  }

  const parsed = JSON.parse(reply) as T & { error?: string };

  if (parsed.error !== undefined) throw new Error(parsed.error);

  return parsed;
}

export function evaluateContract(contract: Contract, trace: Trace): Promise<ContractResult> {
  return ask<ContractResult>([JSON.stringify(contract), JSON.stringify(trace)], (wasm, [cp, cl, tp, tl]) =>
    wasm.contract_evaluate(cp, cl, tp, tl),
  );
}

export async function contractSignals(contract: Contract): Promise<string[]> {
  const { signals } = await ask<{ signals: string[] }>([JSON.stringify(contract)], (wasm, [cp, cl]) =>
    wasm.contract_check(cp, cl),
  );

  return signals;
}
