import { fileURLToPath, pathToFileURL } from 'node:url';

const unusedBrowserAssets = new Set([
  'manifold-3d/manifold.wasm?url',
  'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url',
  'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url',
]);
const assetPrefix = '\0electrical-asset:';

export function fixtureBundle(input) {
  return {
    input: fileURLToPath(new URL(input, import.meta.url)),
    platform: 'node',
    transform: { define: { 'import.meta.env.MODE': '"production"', 'import.meta.env.BASE_URL': '"/"' } },
    plugins: [
      {
        name: 'electrical-node-assets',
        async resolveId(id, importer) {
          if (unusedBrowserAssets.has(id)) return fileURLToPath(new URL('../cli/assetUrl.mjs', import.meta.url));

          if (!id.endsWith('?url')) return null;

          const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true });

          return resolved ? `${assetPrefix}${resolved.id}` : null;
        },
        load(id) {
          if (!id.startsWith(assetPrefix)) return null;

          return `export default ${JSON.stringify(pathToFileURL(id.slice(assetPrefix.length)).href)};`;
        },
      },
    ],
  };
}
