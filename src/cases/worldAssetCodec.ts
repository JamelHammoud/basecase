import { bytesToBase64 } from '../utils/base64';
import type { WorldAsset } from './worldAssets';

function numbers(values: Float32Array | Uint32Array): string {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);

  for (let i = 0; i < values.length; i++) {
    if (values instanceof Uint32Array) view.setUint32(i * 4, values[i], true);
    else view.setFloat32(i * 4, values[i], true);
  }

  return bytesToBase64(bytes);
}

export function serializeWorldAsset({ world, pieces }: WorldAsset) {
  const { mesh, splat } = world;

  return {
    world: {
      kind: world.kind,
      name: world.name,
      ...(world.reconstruction ? { reconstruction: world.reconstruction } : {}),
      transform: {
        scale: world.transform.scale,
        quaternion: world.transform.quaternion,
        translation: world.transform.translation,
      },
      mesh: {
        positions: numbers(mesh.positions),
        indices: numbers(mesh.indices),
        normals: numbers(mesh.normals),
        bounds: { min: mesh.bounds.min, max: mesh.bounds.max },
        ...(mesh.colors ? { colors: numbers(mesh.colors) } : {}),
        ...(mesh.uvs ? { uvs: numbers(mesh.uvs) } : {}),
        groups: mesh.groups.map(({ start, count, material }) => ({ start, count, material })),
        materials: mesh.materials.map((material) => ({
          name: material.name,
          color: material.color,
          roughness: material.roughness,
          metalness: material.metalness,
          ...(material.doubleSided === undefined ? {} : { doubleSided: material.doubleSided }),
          ...(material.image
            ? {
                image: {
                  bytes: bytesToBase64(material.image.bytes),
                  mimeType: material.image.mimeType,
                  ...(material.image.flipY === undefined ? {} : { flipY: material.image.flipY }),
                  ...(material.image.wrapS === undefined ? {} : { wrapS: material.image.wrapS }),
                  ...(material.image.wrapT === undefined ? {} : { wrapT: material.image.wrapT }),
                },
              }
            : {}),
        })),
      },
      ...(splat
        ? { splat: { name: splat.name, format: splat.format, count: splat.count, bytes: bytesToBase64(splat.bytes) } }
        : {}),
    },
    pieces: pieces.map((piece) => ({ positions: numbers(piece.positions), indices: numbers(piece.indices) })),
  };
}

export type SerializedWorldAsset = ReturnType<typeof serializeWorldAsset>;
export type SerializedWorldAssets = Record<string, SerializedWorldAsset>;
