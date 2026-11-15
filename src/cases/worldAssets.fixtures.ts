import type { WorldAsset } from './worldAssets';

export function meshWorldAsset(): WorldAsset {
  const positions = Float32Array.from([0, 0, 0, 1000, 0, 0, 0, 0, 1000]);
  const indices = Uint32Array.from([0, 1, 2]);

  return {
    world: {
      kind: 'mesh',
      name: 'Room',
      transform: { scale: 1000, quaternion: [0, 0, 0, 1], translation: [0, 0, 0] },
      mesh: {
        positions,
        indices,
        normals: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0]),
        bounds: { min: [0, 0, 0], max: [1000, 0, 1000] },
        groups: [{ start: 0, count: 3, material: 0 }],
        materials: [{ name: 'Floor', color: [1, 1, 1, 1], roughness: 1, metalness: 0 }],
      },
    },
    pieces: [
      {
        positions: Float32Array.from([0, 0, 0, 1000, 0, 0, 0, 0, 1000, 0, -1, 0]),
        indices: Uint32Array.from([0, 1, 2, 0, 3, 1, 1, 3, 2, 2, 3, 0]),
      },
    ],
  };
}
