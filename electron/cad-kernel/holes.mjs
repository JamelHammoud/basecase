const AXES = { x: [1, 2], y: [0, 2], z: [0, 1] };
const MAX_CELLS = 3_000_000;

function gridFor(mesh, axis, minDiameter) {
  const [u, v] = AXES[axis];
  const p = mesh.positions;
  const lo = [Infinity, Infinity];
  const hi = [-Infinity, -Infinity];

  for (let i = 0; i < p.length; i += 3) {
    lo[0] = Math.min(lo[0], p[i + u]);
    lo[1] = Math.min(lo[1], p[i + v]);
    hi[0] = Math.max(hi[0], p[i + u]);
    hi[1] = Math.max(hi[1], p[i + v]);
  }

  const span = [hi[0] - lo[0], hi[1] - lo[1]];
  const cell = Math.max(minDiameter / 16, Math.sqrt((span[0] * span[1]) / MAX_CELLS), 0.02);
  const w = Math.ceil(span[0] / cell) + 3;
  const h = Math.ceil(span[1] / cell) + 3;

  return { u, v, cell, w, h, ox: lo[0] - cell, oy: lo[1] - cell, covered: new Uint8Array(w * h) };
}

function rasterize(grid, ax, ay, rest) {
  const [bx, by, cx, cy] = rest;
  const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);

  if (Math.abs(det) < 1e-12) return;

  const toCell = (x, o) => (x - o) / grid.cell - 0.5;
  const i0 = Math.max(0, Math.ceil(toCell(Math.min(ax, bx, cx), grid.ox)));
  const i1 = Math.min(grid.w - 1, Math.floor(toCell(Math.max(ax, bx, cx), grid.ox)));
  const j0 = Math.max(0, Math.ceil(toCell(Math.min(ay, by, cy), grid.oy)));
  const j1 = Math.min(grid.h - 1, Math.floor(toCell(Math.max(ay, by, cy), grid.oy)));

  for (let j = j0; j <= j1; j++) {
    const y = grid.oy + (j + 0.5) * grid.cell;

    for (let i = i0; i <= i1; i++) {
      const x = grid.ox + (i + 0.5) * grid.cell;
      const s = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / det;
      const t = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / det;

      if (s >= -1e-9 && t >= -1e-9 && s + t <= 1 + 1e-9) grid.covered[j * grid.w + i] = 1;
    }
  }
}

function project(mesh, grid) {
  const p = mesh.positions;
  const idx = mesh.indices;

  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];

    rasterize(grid, p[a + grid.u], p[a + grid.v], [p[b + grid.u], p[b + grid.v], p[c + grid.u], p[c + grid.v]]);
  }
}

function floodOutside(grid) {
  const seen = new Uint8Array(grid.w * grid.h);
  const stack = [0];

  seen[0] = 1;

  while (stack.length) {
    const k = stack.pop();
    const i = k % grid.w;
    const j = (k - i) / grid.w;

    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      const nk = nj * grid.w + ni;

      if (ni < 0 || nj < 0 || ni >= grid.w || nj >= grid.h || seen[nk] || grid.covered[nk]) continue;

      seen[nk] = 1;
      stack.push(nk);
    }
  }

  return seen;
}

function component(grid, seen, start) {
  const stack = [start];
  let count = 0;
  let sx = 0;
  let sy = 0;

  seen[start] = 1;

  while (stack.length) {
    const k = stack.pop();
    const i = k % grid.w;
    const j = (k - i) / grid.w;

    count++;
    sx += i;
    sy += j;

    for (const nk of [k + 1, k - 1, k + grid.w, k - grid.w]) {
      if (seen[nk] || grid.covered[nk]) continue;

      seen[nk] = 1;
      stack.push(nk);
    }
  }

  return { count, i: sx / count, j: sy / count };
}

export function throughHoles(mesh, axis, minDiameter = 1) {
  const grid = gridFor(mesh, axis, minDiameter);

  project(mesh, grid);

  const seen = floodOutside(grid);
  const holes = [];

  for (let k = 0; k < seen.length; k++) {
    if (seen[k] || grid.covered[k]) continue;

    const c = component(grid, seen, k);
    const area = c.count * grid.cell * grid.cell;
    const diameter = 2 * Math.sqrt(area / Math.PI);

    if (diameter < minDiameter * 0.5) continue;

    const at = [0, 0, 0];

    at[grid.u] = Math.round((grid.ox + (c.i + 0.5) * grid.cell) * 10) / 10;
    at[grid.v] = Math.round((grid.oy + (c.j + 0.5) * grid.cell) * 10) / 10;
    holes.push({ diameter: Math.round(diameter * 100) / 100, at, axis });
  }

  return { holes, cellMm: grid.cell };
}
