import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const WASM_ASSET = /(?:^|\/)ort-wasm-simd-threaded\.asyncify(?:-[\w-]+)?\.wasm$/;

export function webOnnxAssets(): Plugin {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const version = lock.packages['node_modules/onnxruntime-web'].version;
  const url = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/ort-wasm-simd-threaded.asyncify.wasm`;

  return {
    name: 'basecase-web-onnx-assets',
    config() {
      return {
        experimental: {
          renderBuiltUrl(fileName) {
            if (WASM_ASSET.test(fileName)) return url;
          },
        },
      };
    },
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (WASM_ASSET.test(fileName)) delete bundle[fileName];
      }
    },
  };
}
