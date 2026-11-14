import type * as THREE from 'three';
import type { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import type { DroppedFile, SplatFormat } from '../cases/worldTypes';

const spark = () => import('@sparkjsdev/spark');

export async function loadSplat(look: { file: string; format: SplatFormat }, files: DroppedFile[]): Promise<SplatMesh> {
  const file = files.find((f) => f.name === look.file);

  if (!file) throw new Error(`No ${look.file} among the world's files`);

  const { SplatMesh, SplatFileType } = await spark();
  const splat = new SplatMesh({
    fileBytes: file.bytes,
    fileType: look.format === 'spz' ? SplatFileType.SPZ : SplatFileType.PLY,
    fileName: file.name,
  });

  try {
    await splat.initialized;
  } catch (error) {
    splat.dispose();

    throw error;
  }

  return splat;
}

export async function sparkRenderer(renderer: THREE.WebGLRenderer, onDirty: () => void): Promise<SparkRenderer> {
  const { SparkRenderer } = await spark();

  return new SparkRenderer({ renderer, onDirty });
}
