import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { openClip, type Clip } from './clip';
import { loadClipFiles } from './clipFiles';

let opening: Promise<Clip> | null = null;

export function bundledClip(): Promise<Clip> {
  ort.env.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.origin).href };
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  opening ??= loadClipFiles()
    .then((files) => openClip(files, ort))
    .catch((error: unknown) => {
      opening = null;

      throw error;
    });

  return opening;
}
