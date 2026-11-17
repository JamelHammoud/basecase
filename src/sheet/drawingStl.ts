import { sceneStl } from '../three/analysis/sceneStl';
import { ShapeSolid } from '../three/analysis/shapeSolid';

function outwardTriangles(triangles: Float32Array) {
  let volume = 0;

  for (let i = 0; i < triangles.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = triangles.subarray(i, i + 9);

    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }

  if (volume >= 0) return triangles;

  const outward = triangles.slice();

  for (let i = 0; i < triangles.length; i += 9) {
    outward.set(triangles.subarray(i + 6, i + 9), i + 3);
    outward.set(triangles.subarray(i + 3, i + 6), i + 6);
  }

  return outward;
}

export function drawingStl(triangles: Float32Array, fingerprint: string) {
  const solid = new ShapeSolid(outwardTriangles(triangles));

  try {
    const bytes = sceneStl([{ key: 'drawing', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }], () => solid);

    bytes.set(new TextEncoder().encode(`SHA256:${fingerprint}`));

    return bytes;
  } finally {
    solid.dispose();
  }
}

export async function bytesFingerprint(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()));

  return Array.from(hash, (n) => n.toString(16).padStart(2, '0')).join('');
}
