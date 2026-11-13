/// <reference lib="webworker" />
import { type MainModule, type MjModel } from '@mujoco/mujoco';
import { loadMujoco } from '../sim/loadMujoco';
import { answer, integrationField } from './forgeFields';
import { ForgeGpu } from './forgeGpu';
import { settleStart, type StartJob } from './forgeStart';
import { loadForgeWasm, type ForgeEvent, type ForgeWasm } from './forgeWasm';
import { hasJspi } from './tabSupport';

export interface ForgeTabRequest {
  type: 'train';
  xml: string;
  job: Record<string, unknown>;
  warm: string | null;
}

export type ForgeTabMessage =
  | { type: 'event'; event: ForgeEvent }
  | { type: 'done'; result: Record<string, unknown> }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const MAX_ROUNDS = 600;

const post = (message: ForgeTabMessage) => ctx.postMessage(message);

async function wasmBytes() {
  const response = await fetch(new URL('./forge.wasm', import.meta.url));

  if (!response.ok) throw new Error('Forge’s engine didn’t load.');

  return response.arrayBuffer();
}

function feed(mj: MainModule, model: MjModel, forge: ForgeWasm) {
  forge.reset();
  forge.field(integrationField(mj));

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const reply = forge.prepare();
    const missing = reply.missing as string[] | undefined;

    if (reply.refused) throw new Error(`Forge’s engine can’t step this robot: ${String(reply.refused)}`);

    if (!missing?.length) return;

    missing.forEach((key) => forge.field(answer(mj, model, key)));
  }

  throw new Error('Forge’s engine kept asking for model fields.');
}

async function train(msg: ForgeTabRequest) {
  if (!hasJspi()) throw new Error('Training in a tab needs a browser with WebAssembly JSPI, like Chrome.');

  const mj = await loadMujoco();
  const gpu = await ForgeGpu.open();
  const forge = await loadForgeWasm(await wasmBytes(), gpu, (event) => post({ type: 'event', event }));
  const model = mj.MjModel.from_xml_string(msg.xml);

  try {
    const start = settleStart(mj, model, msg.job as unknown as StartJob);

    feed(mj, model, forge);

    const header = { job: msg.job, holdsPose: start.holdsPose, z0: start.z0, warm: msg.warm };
    const result = await forge.train({ ...header, mujoco: mj.mj_versionString() }, start.row);

    if (!result.ok) throw new Error(String(result.error));

    post({ type: 'done', result: result.done as Record<string, unknown> });
  } finally {
    model.delete();
    gpu.destroy();
  }
}

ctx.onmessage = (ev: MessageEvent<ForgeTabRequest>) => {
  train(ev.data).catch((e: unknown) => post({ type: 'error', message: e instanceof Error ? e.message : String(e) }));
};
