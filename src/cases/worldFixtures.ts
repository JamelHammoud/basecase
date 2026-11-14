export interface FixtureMesh {
  positions: number[];
  indices: number[];
  colors: number[];
}

type P3 = [number, number, number];

const GREY: P3 = [0.62, 0.6, 0.57];

function mesh(): FixtureMesh {
  return { positions: [], indices: [], colors: [] };
}

function quad(m: FixtureMesh, corners: [P3, P3, P3, P3], color: P3 = GREY) {
  const start = m.positions.length / 3;

  for (const c of corners) m.positions.push(...c);

  for (let i = 0; i < 4; i++) m.colors.push(...color);

  m.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function box(m: FixtureMesh, [x0, y0, z0]: P3, [x1, y1, z1]: P3, color: P3 = GREY) {
  quad(
    m,
    [
      [x0, y1, z0],
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
    ],
    color,
  );
  quad(
    m,
    [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
    ],
    color,
  );
  quad(
    m,
    [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    color,
  );
  quad(
    m,
    [
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y0, z0],
    ],
    color,
  );
  quad(
    m,
    [
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x1, y0, z1],
    ],
    color,
  );
  quad(
    m,
    [
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
    ],
    color,
  );
}

interface RoomShape {
  w: number;
  d: number;
  h: number;
  floorY: number;
  ceiling?: boolean;
}

function room(m: FixtureMesh, { w, d, h, floorY, ceiling = false }: RoomShape) {
  const top = floorY + h;

  if (ceiling) {
    quad(m, [
      [0, top, 0],
      [w, top, 0],
      [w, top, d],
      [0, top, d],
    ]);
  }

  quad(
    m,
    [
      [0, floorY, 0],
      [0, floorY, d],
      [w, floorY, d],
      [w, floorY, 0],
    ],
    [0.55, 0.45, 0.35],
  );
  quad(m, [
    [0, floorY, 0],
    [w, floorY, 0],
    [w, top, 0],
    [0, top, 0],
  ]);
  quad(m, [
    [0, floorY, d],
    [0, top, d],
    [w, top, d],
    [w, floorY, d],
  ]);
  quad(m, [
    [0, floorY, 0],
    [0, top, 0],
    [0, top, d],
    [0, floorY, d],
  ]);
  quad(m, [
    [w, floorY, 0],
    [w, floorY, d],
    [w, top, d],
    [w, top, 0],
  ]);
}

export const KITCHEN_FLOOR_Y = -1.3;

export const KITCHEN_TABLE = { min: [1.9, 2.6] as [number, number], max: [3.1, 3.4] as [number, number], top: 0.75 };

export function kitchenMesh({ ceiling = false }: { ceiling?: boolean } = {}): FixtureMesh {
  const m = mesh();
  const y = KITCHEN_FLOOR_Y;
  const wood: P3 = [0.6, 0.42, 0.25];
  const { min, max, top } = KITCHEN_TABLE;

  room(m, { w: 5, d: 4, h: 2.5, floorY: y, ceiling });
  box(m, [0, y, 0], [3, y + 0.9, 0.6], [0.85, 0.85, 0.82]);
  box(m, [min[0], y + top - 0.04, min[1]], [max[0], y + top, max[1]], wood);

  for (const [x, z] of [
    [min[0] + 0.05, min[1] + 0.05],
    [max[0] - 0.05, min[1] + 0.05],
    [min[0] + 0.05, max[1] - 0.05],
    [max[0] - 0.05, max[1] - 0.05],
  ])
    box(m, [x - 0.03, y, z - 0.03], [x + 0.03, y + top - 0.04, z + 0.03], wood);

  return m;
}

export const YARD_INCLINE_DEG = 5;

export const YARD_HUMP = { from: 2.5, run: 1.5, top: 0.5 };

export function yardMesh(): FixtureMesh {
  const m = mesh();
  const { from, run, top } = YARD_HUMP;
  const rise = run * Math.tan((YARD_INCLINE_DEG * Math.PI) / 180);
  const [up, flat, down] = [from + run, from + run + top, from + run * 2 + top];
  const grass: P3 = [0.35, 0.55, 0.3];
  const side = (x: number) =>
    quad(
      m,
      [
        [x, 0, from],
        [x, rise, up],
        [x, rise, flat],
        [x, 0, down],
      ],
      grass,
    );

  quad(
    m,
    [
      [-4, 0, -10],
      [-4, 0, 14],
      [4, 0, 14],
      [4, 0, -10],
    ],
    grass,
  );
  quad(
    m,
    [
      [-1.5, 0, from],
      [-1.5, rise, up],
      [1.5, rise, up],
      [1.5, 0, from],
    ],
    grass,
  );
  quad(
    m,
    [
      [-1.5, rise, up],
      [-1.5, rise, flat],
      [1.5, rise, flat],
      [1.5, rise, up],
    ],
    grass,
  );
  quad(
    m,
    [
      [-1.5, rise, flat],
      [-1.5, 0, down],
      [1.5, 0, down],
      [1.5, rise, flat],
    ],
    grass,
  );
  side(-1.5);
  side(1.5);

  return m;
}

export const STAIR = { rise: 0.12, run: 0.3, steps: 4 };

export function stairwellMesh(): FixtureMesh {
  const m = mesh();
  const { rise, run, steps } = STAIR;

  room(m, { w: 3, d: 6, h: 3, floorY: 0 });

  for (let i = 0; i < steps; i++) box(m, [0.5, 0, 3 + i * run], [2.5, rise * (i + 1), 3 + (i + 1) * run]);

  return m;
}

export function garageMesh(): FixtureMesh {
  const m = mesh();

  room(m, { w: 6, d: 3.5, h: 2.4, floorY: 0 });
  box(m, [1, 0.15, 0.5], [5, 1.4, 2.3], [0.7, 0.1, 0.1]);
  box(m, [0, 0, 3], [2, 1.8, 3.5], [0.5, 0.5, 0.55]);

  return m;
}

export function upsideDown(m: FixtureMesh): FixtureMesh {
  return { ...m, positions: m.positions.map((v, i) => (i % 3 === 0 ? v : -v)) };
}

export function inMillimetres(m: FixtureMesh): FixtureMesh {
  return { ...m, positions: m.positions.map((v) => v * 1000) };
}

export interface FixtureSplat {
  positions: number[];
  colors: number[];
}

const R2: [number, number] = [0.7548776662466927, 0.5698402909980532];

function areaOf(a: number[], b: number[], c: number[]): number {
  const [u, v] = [b.map((x, i) => x - a[i]), c.map((x, i) => x - a[i])];

  return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
}

export function splatOn(m: FixtureMesh, perSquareMetre = 40): FixtureSplat {
  const out: FixtureSplat = { positions: [], colors: [] };
  const at = (i: number) => m.positions.slice(i * 3, i * 3 + 3);

  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [at(m.indices[t]), at(m.indices[t + 1]), at(m.indices[t + 2])];
    const color = m.colors.slice(m.indices[t] * 3, m.indices[t] * 3 + 3);
    const count = Math.max(1, Math.round(areaOf(a, b, c) * perSquareMetre));

    for (let k = 0; k < count; k++) {
      const [s, r] = [((k + 0.5) * R2[0]) % 1, ((k + 0.5) * R2[1]) % 1];
      const [u, v] = s + r > 1 ? [1 - s, 1 - r] : [s, r];

      out.positions.push(...a.map((x, i) => x + (b[i] - x) * u + (c[i] - x) * v));
      out.colors.push(...color);
    }
  }

  return out;
}
