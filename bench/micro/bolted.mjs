import { box, cyl, diff, union } from './csg.mjs';
import { CLEARANCE, INSERT, INSERT_HOLE, insert, printed, screw } from './parts.mjs';

const AXIS_NAMES = ['x', 'y', 'z'];

const LAYOUTS = {
  torso: {
    axes: [0, 1, 2],
    signs: [1, 1, 1],
    origin: [0, 0, 60],
    holes: [
      [-30, -16],
      [30, -16],
      [-30, 16],
      [30, 16],
    ],
    plate: [80, 50],
    base: { id: 'pelvis', name: 'Pelvis', depth: 16 },
    cover: { id: 'torso-shell', name: 'Torso shell', depth: 4, walls: 50 },
    group: 'Torso',
    prefix: 'ts',
  },
  visor: {
    axes: [0, 2, 1],
    signs: [1, 1, -1],
    origin: [0, -32, 120],
    holes: [
      [-24, 0],
      [24, 0],
    ],
    plate: [70, 24],
    base: { id: 'head-shell', name: 'Head shell', depth: 14 },
    cover: { id: 'visor', name: 'Visor', depth: 4 },
    group: 'Head',
    prefix: 'visor',
  },
  arm: {
    axes: [1, 2, 0],
    signs: [1, 1, 1],
    origin: [70, 0, 90],
    holes: [
      [-10, -8],
      [10, -8],
      [-10, 8],
      [10, 8],
    ],
    plate: [36, 30],
    base: { id: 'shoulder-bracket', name: 'Shoulder bracket', depth: 14 },
    cover: { id: 'upper-arm', name: 'Upper arm', depth: 5, walls: 60 },
    group: 'Left arm',
    prefix: 'arm',
  },
};

export const layoutNames = Object.keys(LAYOUTS);

function frameFor(layout) {
  const point = (c) => {
    const out = [...layout.origin];

    c.forEach((v, i) => (out[layout.axes[i]] += layout.signs[i] * v));

    return out;
  };
  const size = (s) => {
    const out = [0, 0, 0];

    s.forEach((v, i) => (out[layout.axes[i]] = v));

    return out;
  };
  const dir = (c) => {
    const out = [0, 0, 0];

    c.forEach((v, i) => (out[layout.axes[i]] += layout.signs[i] * v));

    return out;
  };

  return { point, size, dir, axis: AXIS_NAMES[layout.axes[2]] };
}

function wallsOf(f, layout) {
  const [w, d] = layout.plate;
  const t = 2.5;
  const h = layout.cover.walls;
  const top = layout.cover.depth;

  return diff(
    box(f.size([w, d, h]), f.point([0, 0, top + h / 2])),
    box(f.size([w - 2 * t, d - 2 * t, h + 1]), f.point([0, 0, top + h / 2 + 0.5])),
  );
}

function coverSolid(f, layout, clearance, bare) {
  const [w, d] = layout.plate;
  const t = layout.cover.depth;
  const plate = box(f.size([w, d, t]), f.point([0, 0, t / 2]));
  const body = layout.cover.walls ? union(plate, wallsOf(f, layout)) : plate;
  const holes = layout.holes.map(([u, v]) => cyl(clearance, t + 2, f.point([u, v, t / 2]), f.axis));

  return bare ? body : diff(body, ...holes);
}

function baseSolid(f, layout, size, bare) {
  const [w, d] = layout.plate;
  const depth = layout.base.depth;
  const holeDepth = INSERT[size].l + 1;
  const holes = layout.holes.map(([u, v]) =>
    cyl(INSERT_HOLE[size], holeDepth + 0.2, f.point([u, v, -holeDepth / 2 + 0.1]), f.axis),
  );

  const block = box(f.size([w, d, depth]), f.point([0, 0, -depth / 2]));

  return bare ? block : diff(block, ...holes);
}

export function boltedPair({ layout: name = 'torso', size = 'M3', length = 10, clearance, bare, base } = {}) {
  const layout = { ...LAYOUTS[name], base: { ...LAYOUTS[name].base, ...base } };
  const f = frameFor(layout);
  const down = f.dir([0, 0, -1]);
  const group = layout.group;
  const screws = layout.holes.map(([u, v], i) =>
    screw({
      id: `${layout.prefix}-${i + 1}`,
      size,
      length,
      seat: f.point([u, v, layout.cover.depth]),
      dir: down,
      group,
    }),
  );
  const inserts = layout.holes.map(([u, v], i) =>
    insert({ id: `${layout.prefix}-insert-${i + 1}`, size, top: f.point([u, v, 0]), dir: down, group }),
  );

  return {
    name: `${layout.cover.name} on ${layout.base.name.toLowerCase()}`,
    parts: [
      printed({ ...layout.base, group, solid: baseSolid(f, layout, size, bare) }),
      printed({ ...layout.cover, group, solid: coverSolid(f, layout, clearance ?? CLEARANCE[size], bare) }),
      ...(bare ? [] : [...inserts, ...screws]),
    ],
    meta: { screws: screws.map((s) => s.id), inserts: inserts.map((s) => s.id), slide: f.dir([1, 0, 0]) },
  };
}
