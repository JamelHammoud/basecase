import { kiCadChild, kiCadChildren, kiCadNumber, readKiCadBoard } from './boardKiCad.mjs';

const point = (value) =>
  Array.isArray(value) && value.length === 2 && value.every((n) => Number.isFinite(n) && Math.abs(n) <= 1000);
const rectangle = (area) =>
  area &&
  typeof area === 'object' &&
  Object.keys(area).every((key) => ['min', 'max'].includes(key)) &&
  point(area.min) &&
  point(area.max) &&
  area.min[0] < area.max[0] &&
  area.min[1] < area.max[1];

export const validCopperExclusions = (value) => Array.isArray(value) && value.length <= 512 && value.every(rectangle);

const at = (object, key) => kiCadChild(object, key).slice(1).map(kiCadNumber);
const inside = (p, area) => p[0] >= area.min[0] && p[0] <= area.max[0] && p[1] >= area.min[1] && p[1] <= area.max[1];
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function pointDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denominator)) : 0;

  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function intersects(a, b, c, d) {
  const overlap = [0, 1].every(
    (i) => Math.max(Math.min(a[i], b[i]), Math.min(c[i], d[i])) <= Math.min(Math.max(a[i], b[i]), Math.max(c[i], d[i])),
  );

  return overlap && cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
}

function segmentDistance(a, b, c, d) {
  if (intersects(a, b, c, d)) return 0;

  return Math.min(pointDistance(a, c, d), pointDistance(b, c, d), pointDistance(c, a, b), pointDistance(d, a, b));
}

function touches(a, b, radius, area) {
  if (inside(a, area) || inside(b, area)) return true;

  const corners = [area.min, [area.max[0], area.min[1]], area.max, [area.min[0], area.max[1]]];

  return corners.some((c, i) => segmentDistance(a, b, c, corners[(i + 1) % 4]) < radius - 0.000001);
}

export function copperViolatesExclusions(pcb, exclusions = []) {
  if (!validCopperExclusions(exclusions)) throw new Error('board-format');

  if (!exclusions.length) return false;

  const board = readKiCadBoard(pcb);
  const tracks = kiCadChildren(board, 'segment').map((track) => ({
    a: at(track, 'start'),
    b: at(track, 'end'),
    radius: at(track, 'width')[0] / 2,
  }));
  const vias = kiCadChildren(board, 'via').map((via) => ({
    a: at(via, 'at'),
    b: at(via, 'at'),
    radius: at(via, 'size')[0] / 2,
  }));

  return [...tracks, ...vias].some((copper) =>
    exclusions.some((area) => touches(copper.a, copper.b, copper.radius, area)),
  );
}
