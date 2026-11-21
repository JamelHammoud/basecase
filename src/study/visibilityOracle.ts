import { BoxGeometry } from 'three';
import { meshWorldAsset } from '../cases/worldAssets.fixtures';

export function corridorAsset() {
  const pieces = [
    [-420, 500, -1500],
    [420, 500, -1500],
    [0, -10, -1500],
  ].map(([x, y, z], i) => {
    const size = i === 2 ? [880, 20, 3200] : [40, 1000, 3200];
    const geometry = new BoxGeometry(...(size as [number, number, number])).translate(x, y, z);
    const piece = {
      positions: Float32Array.from(geometry.attributes.position.array),
      indices: Uint32Array.from(geometry.index!.array),
    };
    const normals = Float32Array.from(geometry.attributes.normal.array);

    geometry.dispose();

    return { piece, normals };
  });
  const positions = Float32Array.from(pieces.flatMap(({ piece }) => Array.from(piece.positions)));
  const normals = Float32Array.from(pieces.flatMap(({ normals }) => Array.from(normals)));
  const indices = Uint32Array.from(pieces.flatMap(({ piece }, i) => Array.from(piece.indices, (n) => n + i * 24)));
  const source = meshWorldAsset();

  return {
    world: {
      ...source.world,
      name: 'Corridor',
      mesh: {
        ...source.world.mesh,
        positions,
        normals,
        indices,
        bounds: {
          min: [-440, -20, -3100] as [number, number, number],
          max: [440, 1000, 100] as [number, number, number],
        },
        groups: [{ start: 0, count: indices.length, material: 0 }],
      },
    },
    pieces: pieces.map(({ piece }) => piece),
  };
}

export function edgeRegion() {
  const pixels: Array<[number, number]> = [];

  for (let y = 0; y < 240; y++) {
    for (let x = 0; x < 320; x++) {
      const u = ((x + 0.5) / 320) * 2 - 1;
      const v = (1 - ((y + 0.5) / 240) * 2) * 0.75;
      const radius = Math.hypot(u, v);
      const theta = (radius * 100 * Math.PI) / 180;
      const dx = radius ? (Math.sin(theta) * u) / radius : 0;
      const dy = radius ? (Math.sin(theta) * v) / radius : 0;
      const dz = -Math.cos(theta);
      const distance = 1000 / dx;
      const py = dy * distance;
      const pz = dz * distance;

      if (radius <= 1 && dx > 0 && Math.abs(py) <= 100 && pz >= -200 && pz <= 0) pixels.push([x, y]);
    }
  }

  return {
    pixels: pixels.length,
    bounds: [
      Math.min(...pixels.map(([x]) => x)),
      Math.min(...pixels.map(([, y]) => y)),
      Math.max(...pixels.map(([x]) => x)) + 1,
      Math.max(...pixels.map(([, y]) => y)) + 1,
    ],
  };
}
