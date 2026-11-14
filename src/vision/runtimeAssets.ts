import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import moduleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url';
import type { Env } from 'onnxruntime-web';

export function configureRuntimeAssets(env: Env): void {
  env.wasm.wasmPaths = { wasm: wasmUrl, mjs: moduleUrl };
}
