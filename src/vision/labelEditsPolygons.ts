import { polygonPixels } from './import/sourceGeometry';

function signedArea(ring: number[]): number {
  return (
    ring.reduce((sum, value, index) => {
      if (index % 2) return sum;

      const next = (index + 2) % ring.length;

      return sum + value * ring[next + 1] - ring[next] * ring[index + 1];
    }, 0) / 2
  );
}

export function canonicalPolygonPixels(polygons: number[][], width: number, height: number): Uint8Array {
  const rings = polygons
    .map((ring) => ({ ring, area: signedArea(ring) }))
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const pixels = new Uint8Array(width * height);

  for (const { ring, area } of rings) {
    const fill = polygonPixels([ring], width, height);

    fill.forEach((value, index) => {
      if (value) pixels[index] = Number(area > 0);
    });
  }

  return pixels;
}
