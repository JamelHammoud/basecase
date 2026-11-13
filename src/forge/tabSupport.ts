import { webGpu } from './gpuTypes';

interface JspiFlags {
  Suspending?: unknown;
  promising?: unknown;
}

let checked: Promise<boolean> | null = null;

export function hasJspi() {
  const flags = WebAssembly as unknown as JspiFlags;

  return typeof flags.Suspending === 'function' && typeof flags.promising === 'function';
}

async function gpuAdapter() {
  try {
    return !!(await webGpu()?.requestAdapter({ powerPreference: 'high-performance' }));
  } catch {
    return false;
  }
}

export function tabTrainingReady(): Promise<boolean> {
  checked ??= hasJspi() ? gpuAdapter() : Promise.resolve(false);

  return checked;
}
