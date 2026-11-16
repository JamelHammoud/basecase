import type { ScenePart } from '../types/robotics';

export const KIT_MAX_BYTES = 256 * 1024 * 1024;

export function checkKitSource(parts: ScenePart[]) {
  const size = parts.reduce((total, part) => {
    const mesh = part.cad ?? part.mesh ?? part.sculptMesh;

    return total + (mesh ? (mesh.positions.length + (mesh.indices?.length ?? 0)) * 8 : 0);
  }, 0);

  if (size > KIT_MAX_BYTES) throw new Error('Kit export exceeds 256 MB.');

  if (parts.length > 10000) throw new Error('Kit export exceeds 10,000 scene parts.');
}
