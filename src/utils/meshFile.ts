import { geometryWorker } from '../three/geometryWorker';
import { loadMesh } from './robotImport/meshes';

const NEEDS_DOM = /\.(dae|3mf)$/i;

export async function parseMeshFile(data: ArrayBuffer, path: string): Promise<Float32Array | null> {
  if (NEEDS_DOM.test(path)) {
    const geometry = await loadMesh(data, path);

    return geometry ? (geometry.getAttribute('position').array as Float32Array) : null;
  }

  return geometryWorker.call('parseMesh', { data, path }, [data]);
}
