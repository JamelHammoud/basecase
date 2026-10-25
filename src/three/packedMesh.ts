import type { ScenePart } from '../types/robotics';

interface MeshArrays {
  positions: number[];
  indices: number[];
}

interface Packed {
  positions: Float32Array;
  indices: Uint32Array;
}

const packed = new WeakMap<MeshArrays, Packed>();

export function packedMesh(src: MeshArrays): Packed {
  const cached = packed.get(src);

  if (cached) return cached;

  const made = { positions: Float32Array.from(src.positions), indices: Uint32Array.from(src.indices) };

  packed.set(src, made);

  return made;
}

const asArrays = <T extends MeshArrays>(src: T): T => ({ ...src, ...packedMesh(src) }) as unknown as T;

export function packParts(parts: ScenePart[]): ScenePart[] {
  return parts.map((part) => {
    if (part.mesh) return { ...part, mesh: asArrays(part.mesh) };

    if (part.cad) return { ...part, cad: asArrays(part.cad) };

    return part;
  });
}
