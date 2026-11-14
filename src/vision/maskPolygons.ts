type Edge = { from: number; to: number; direction: number };

function edgesOf(pixels: Uint8Array, width: number, height: number): Edge[] {
  const edges: Edge[] = [];
  const stride = width + 1;
  const occupied = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && pixels[y * width + x];

  pixels.forEach((v, i) => {
    if (!v) return;

    const x = i % width;
    const y = Math.floor(i / width);
    const p = y * stride + x;
    const sides: Array<[boolean, number, number, number]> = [
      [!occupied(x, y - 1), p, p + 1, 0],
      [!occupied(x + 1, y), p + 1, p + stride + 1, 1],
      [!occupied(x, y + 1), p + stride + 1, p + stride, 2],
      [!occupied(x - 1, y), p + stride, p, 3],
    ];

    sides.filter(([keep]) => keep).forEach(([, from, to, direction]) => edges.push({ from, to, direction }));
  });

  return edges;
}

function traceRing(start: Edge, outgoing: Map<number, Edge[]>, remaining: Set<Edge>): Edge[] {
  const ring: Edge[] = [];
  let edge = start;

  do {
    ring.push(edge);
    remaining.delete(edge);

    const choices = (outgoing.get(edge.to) ?? []).filter((candidate) => remaining.has(candidate));
    const priority = (candidate: Edge) => (candidate.direction - edge.direction + 3) % 4;
    const next = choices.sort((a, b) => priority(a) - priority(b))[0];

    if (edge.to === start.from) break;

    if (!next) throw new Error('Check the mask boundary.');

    edge = next;
  } while (remaining.size);

  return ring;
}

function coordinates(ring: Edge[], stride: number): number[] {
  return ring.flatMap((edge, i) => {
    if (edge.direction === ring[(i + ring.length - 1) % ring.length].direction) return [];

    return [edge.from % stride, Math.floor(edge.from / stride)];
  });
}

export function traceMaskPolygons(pixels: Uint8Array, width: number, height: number): number[][] {
  const edges = edgesOf(pixels, width, height);
  const remaining = new Set(edges);
  const outgoing = new Map<number, Edge[]>();

  edges.forEach((edge) => outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]));

  const polygons: number[][] = [];

  for (const edge of edges) {
    if (!remaining.has(edge)) continue;

    polygons.push(coordinates(traceRing(edge, outgoing, remaining), width + 1));
  }

  return polygons;
}
