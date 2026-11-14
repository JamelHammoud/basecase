interface ContourInput {
  raster: Uint32Array;
  width: number;
  height: number;
  id: number;
  bbox: [number, number, number, number];
}

const point = (key: number, stride: number) => [key % stride, Math.floor(key / stride)];

function simplify(ring: number[], stride: number): number[] {
  return ring.flatMap((key, i) => {
    const a = point(ring[(i + ring.length - 1) % ring.length], stride);
    const b = point(key, stride);
    const c = point(ring[(i + 1) % ring.length], stride);

    return (b[0] - a[0]) * (c[1] - b[1]) === (b[1] - a[1]) * (c[0] - b[0]) ? [] : b;
  });
}

function takeEdge(edges: Map<number, number[]>, from: number, previous: number, stride: number): number {
  const options = edges.get(from)!;
  const [px, py] = point(previous, stride);
  const [x, y] = point(from, stride);
  const score = (key: number) => {
    const [tx, ty] = point(key, stride);
    const cross = (x - px) * (ty - y) - (y - py) * (tx - x);
    const dot = (x - px) * (tx - x) + (y - py) * (ty - y);

    return cross * 2 + dot;
  };
  const next = options.reduce((a, b) => (score(b) > score(a) ? b : a));

  options.splice(options.indexOf(next), 1);

  if (!options.length) edges.delete(from);

  return next;
}

function rings(edges: Map<number, number[]>, stride: number): number[][] {
  const polygons: number[][] = [];

  while (edges.size) {
    const start = edges.keys().next().value!;
    const ring = [start];
    let previous = start - 1;
    let current = start;

    do {
      const next = takeEdge(edges, current, previous, stride);

      previous = current;
      current = next;

      if (current !== start) ring.push(current);
    } while (current !== start);

    polygons.push(simplify(ring, stride));
  }

  return polygons;
}

function pixelEdges(x: number, y: number, input: ContourInput): [number, number][] {
  const { raster, width, height, id } = input;
  const same = (px: number, py: number) =>
    px >= 0 && py >= 0 && px < width && py < height && raster[py * width + px] === id;
  const a = y * (width + 1) + x;
  const b = a + 1;
  const d = a + width + 1;
  const c = d + 1;

  return [
    ...(!same(x, y - 1) ? [[a, b] as [number, number]] : []),
    ...(!same(x + 1, y) ? [[b, c] as [number, number]] : []),
    ...(!same(x, y + 1) ? [[c, d] as [number, number]] : []),
    ...(!same(x - 1, y) ? [[d, a] as [number, number]] : []),
  ];
}

export function visibleContours(input: ContourInput): number[][] {
  const { raster, width, id, bbox } = input;
  const edges = new Map<number, number[]>();
  const [left, top, w, h] = bbox;

  for (let y = top; y < top + h; y++) {
    for (let x = left; x < left + w; x++) {
      if (raster[y * width + x] !== id) continue;

      for (const [from, to] of pixelEdges(x, y, input)) edges.set(from, [...(edges.get(from) ?? []), to]);
    }
  }

  return rings(edges, width + 1);
}
