import { fileURLToPath } from 'node:url';

const unusedBrowserAssets = new Set([
  'manifold-3d/manifold.wasm?url',
  'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url',
  'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url',
]);

export function fixtureBundle(input) {
  return {
    input: fileURLToPath(new URL(input, import.meta.url)),
    platform: 'node',
    transform: { define: { 'import.meta.env.MODE': '"production"', 'import.meta.env.BASE_URL': '"/"' } },
    plugins: [
      {
        name: 'electrical-node-assets',
        resolveId: (id) =>
          unusedBrowserAssets.has(id) ? fileURLToPath(new URL('../cli/assetUrl.mjs', import.meta.url)) : null,
      },
    ],
  };
}
