import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'rolldown';

const root = fileURLToPath(new URL('../../', import.meta.url));
const assetPrefix = '\0electrical-asset:';

export function buildElectricalFixtures({ input, file }) {
  return build({
    input: path.resolve(root, input),
    platform: 'node',
    transform: { define: { 'import.meta.env.MODE': '"production"', 'import.meta.env.BASE_URL': '"/"' } },
    plugins: [
      {
        name: 'electrical-node-assets',
        async resolveId(id, importer) {
          if (id === 'manifold-3d/manifold.wasm?url') return path.join(root, 'tools/cli/assetUrl.mjs');

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
    output: { file, format: 'esm', codeSplitting: false },
  });
}
