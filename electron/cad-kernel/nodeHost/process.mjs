import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKernel } from '../kernelCore.mjs';
import { readLibraryFiles } from '../libraryFiles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const loadNodeManifold = async () => (await import('manifold-3d/manifold.js')).default();

async function loadNodeReplicad() {
  const ocFactory = (await import('replicad-opencascadejs')).default;
  const wasm = path.join(root, 'node_modules', 'replicad-opencascadejs', 'dist', 'replicad_single.wasm');
  const oc = await ocFactory({ locateFile: () => wasm });
  const replicad = await import('replicad');

  replicad.setOC(oc);

  return { replicad, oc };
}

function serve() {
  const kernel = createKernel({
    libraryFiles: () => readLibraryFiles(root),
    scadFactory: async () => (await import('openscad-wasm')).createOpenSCAD,
    replicad: loadNodeReplicad,
    manifold: loadNodeManifold,
  });

  process.on('message', async (msg) => {
    process.send({ id: msg?.id, ...(await kernel.run(msg)) });
  });
  process.send({ ready: true });
  kernel.prewarm();
}

if (process.send) serve();
