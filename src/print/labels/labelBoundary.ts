export interface LabelBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ClipRange {
  t0: number;
  t1: number;
}

function clipAxis(range: ClipRange, p: number, q: number): boolean {
  if (p === 0) return q >= 0;

  const r = q / p;

  if (p < 0) range.t0 = Math.max(range.t0, r);
  else range.t1 = Math.min(range.t1, r);

  return range.t0 <= range.t1;
}

function segmentHitsBox(edges: Float64Array, i: number, box: LabelBox, range: ClipRange): boolean {
  const x = edges[i];
  const y = edges[i + 1];
  const dx = edges[i + 2];
  const dy = edges[i + 3];

  range.t0 = 0;
  range.t1 = 1;

  return (
    clipAxis(range, -dx, x - box.minX) &&
    clipAxis(range, dx, box.maxX - x) &&
    clipAxis(range, -dy, y - box.minY) &&
    clipAxis(range, dy, box.maxY - y)
  );
}

export function boundaryClearance(source: Float32Array): (box: LabelBox) => boolean {
  const edges = new Float64Array(source.length);
  const range = { t0: 0, t1: 1 };

  for (let i = 0; i < source.length; i += 4) {
    const x = source[i];
    const y = source[i + 1];

    edges[i] = x;
    edges[i + 1] = y;
    edges[i + 2] = source[i + 2] - x;
    edges[i + 3] = source[i + 3] - y;
  }

  return (box) => {
    for (let i = 0; i < edges.length; i += 4) if (segmentHitsBox(edges, i, box, range)) return false;

    return true;
  };
}
