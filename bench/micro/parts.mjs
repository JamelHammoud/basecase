export const SOCKET_K = { M2: 2, 'M2.5': 2.5, M3: 3, M4: 4, M5: 5 };
export const INSERT = {
  M2: { l: 3, od: 3.6 },
  'M2.5': { l: 4, od: 4.6 },
  M3: { l: 5.7, od: 4.6 },
  M4: { l: 8.1, od: 6.3 },
};
export const CLEARANCE = { M2: 2.4, 'M2.5': 2.9, M3: 3.4, M4: 4.5, M5: 5.5 };
export const INSERT_HOLE = { M2: 3.2, 'M2.5': 4, M3: 4, M4: 5.6 };
export const STS3215 = 'component:feetech-sts3215|c001';

const DIR_ROTATION = [
  [
    [0, 0, -1],
    [0, 0, 0],
  ],
  [
    [0, 0, 1],
    [180, 0, 0],
  ],
  [
    [-1, 0, 0],
    [0, 90, 0],
  ],
  [
    [1, 0, 0],
    [0, -90, 0],
  ],
  [
    [0, -1, 0],
    [-90, 0, 0],
  ],
  [
    [0, 1, 0],
    [90, 0, 0],
  ],
];

const sameDir = (a, b) => a.every((v, k) => Math.abs(v - b[k]) < 1e-9);

export function rotationFor(dir) {
  const hit = DIR_ROTATION.find(([d]) => sameDir(d, dir));

  if (!hit) throw new Error(`Fixture screws point along an axis, not ${dir}`);

  return hit[1];
}

const along = (p, dir, t) => p.map((v, k) => Math.round((v + dir[k] * t) * 1000) / 1000);

export function printed({ id, name, group, solid, color = '#e4e4e7', material = 'pla' }) {
  return { id, name: name ?? id, group, shape: 'cad_part', solid, position: [0, 0, 0], color, material };
}

export function screw({ id, size = 'M3', length, seat, dir = [0, 0, -1], group, type = 'socket_head' }) {
  const k = SOCKET_K[size];

  return {
    id,
    name: id,
    group,
    catalog: `hardware:${type}|${size}|${length}`,
    position: along(seat, dir, length / 2 - k / 2),
    rotation: rotationFor(dir),
    fixture: { kind: 'screw', size, length, seat, dir },
  };
}

export function insert({ id, size = 'M3', top, dir = [0, 0, -1], group }) {
  const { l } = INSERT[size];

  return {
    id,
    name: id,
    group,
    catalog: `hardware:heat_insert|${size}|${l}`,
    position: along(top, dir, l / 2),
    rotation: rotationFor(dir),
    fixture: { kind: 'insert', size, top, dir },
  };
}

export function component({ id, name, group, catalog, position, rotation = [0, 0, 0] }) {
  return { id, name: name ?? id, group, catalog, position, rotation };
}

export function joint({ id, parent, child, origin, axis = [1, 0, 0], range = [-90, 90], actuators, limb = 'other' }) {
  return { id, name: id.replace(/[-_]/g, ' '), type: 'revolute', parent, child, origin, axis, range, actuators, limb };
}

export function moveScrew(spec, { sideways = [0, 0, 0], deeper = 0 }) {
  const f = spec.fixture;
  const seat = along(
    f.seat.map((v, k) => v + sideways[k]),
    f.dir,
    deeper,
  );

  return { ...screw({ id: spec.id, size: f.size, length: f.length, seat, dir: f.dir, group: spec.group }) };
}

export function resizeScrew(spec, length) {
  const f = spec.fixture;

  return screw({ id: spec.id, size: f.size, length, seat: f.seat, dir: f.dir, group: spec.group });
}
