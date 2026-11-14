/// <reference lib="webworker" />
import { errorMessage } from '../utils/errorMessage';
import type { Decompose } from './worldCollider';
import { MissingCollider } from './worldImport';
import { openWorld } from './worldOpen';
import { vhacdDecompose } from './worldVhacd';
import type { DroppedFile } from './worldTypes';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let decompose: Promise<Decompose> | null = null;

const decomposer = () => (decompose ??= vhacdDecompose());

ctx.onmessage = async (ev: MessageEvent<{ id: number; files: DroppedFile[] }>) => {
  const { id, files } = ev.data;

  try {
    const world = await openWorld(files, decomposer);

    ctx.postMessage({ id, world }, [...new Set(world.files.map((f) => f.bytes.buffer as ArrayBuffer))]);
  } catch (error) {
    ctx.postMessage({ id, told: error instanceof MissingCollider, message: errorMessage(error) });
  }
};
