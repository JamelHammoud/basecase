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

    if (!occupied(x, y - 1)) edges.push({ from: p, to: p + 1, direction: 0 });

    if (!occupied(x + 1, y)) edges.push({ from: p + 1, to: p + stride + 1, direction: 1 });

    if (!occupied(x, y + 1)) edges.push({ from: p + stride + 1, to: p + stride, direction: 2 });

    if (!occupied(x - 1, y)) edges.push({ from: p + stride, to: p, direction: 3 });
  });

  return edges;
}

function nextEdge(edge: Edge, outgoing: Map<number, Edge[]>, remaining: Set<Edge>): Edge | undefined {
  let next: Edge | undefined;
  let best = 4;

  for (const candidate of outgoing.get(edge.to) ?? []) {
    if (!remaining.has(candidate)) continue;

    const priority = (candidate.direction - edge.direction + 3) % 4;

    if (priority >= best) continue;

    next = candidate;
    best = priority;
  }

  return next;
}

function traceRing(start: Edge, outgoing: Map<number, Edge[]>, remaining: Set<Edge>): Edge[] {
  const ring: Edge[] = [];
  let edge = start;

  do {
    ring.push(edge);
    remaining.delete(edge);

    if (edge.to === start.from) break;

    const next = nextEdge(edge, outgoing, remaining);

    if (!next) throw new Error('Check the mask boundary.');

    edge = next;
  } while (remaining.size);

  return ring;
}

function coordinates(ring: Edge[], stride: number): number[] {
  const points: number[] = [];

  for (let i = 0; i < ring.length; i++) {
    const edge = ring[i];

    if (edge.direction === ring[(i + ring.length - 1) % ring.length].direction) continue;

    points.push(edge.from % stride, Math.floor(edge.from / stride));
  }

  return points;
}

export function traceMaskPolygons(pixels: Uint8Array, width: number, height: number): number[][] {
  const edges = edgesOf(pixels, width, height);
  const remaining = new Set(edges);
  const outgoing = new Map<number, Edge[]>();

  for (const edge of edges) {
    const list = outgoing.get(edge.from);

    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
  }

  const polygons: number[][] = [];

  for (const edge of edges) {
    if (!remaining.has(edge)) continue;

    polygons.push(coordinates(traceRing(edge, outgoing, remaining), width + 1));
  }

  return polygons;
}
