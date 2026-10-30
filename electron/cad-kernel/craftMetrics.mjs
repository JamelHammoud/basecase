import * as THREE from 'three';
import { nearHull, sampleSurface } from './meshQuery.mjs';

const NEAR_HULL_MM = 1.5;
const SHARP_DEG = 60;
const SMOOTH_MIN_DEG = 1;
const FILLET_MAX_DEG = 45;
const WALL_SAMPLES = 400;
const WALL_BIN_MM = 0.2;
const OPPOSITE_WALL = 0.5;
const RADIUS_LADDER = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];

const round2 = (v) => Math.round(v * 100) / 100;

function nearestRung(r) {
  return RADIUS_LADDER.reduce(
    (best, x) => (Math.abs(Math.log(x / r)) < Math.abs(Math.log(best / r)) ? x : best),
    RADIUS_LADDER[0],
  );
}

function edgeGeometry(mesh, key, faces, tris) {
  const n = mesh.positions.length / 3;
  const a = Math.floor(key / n);
  const b = key - a * n;
  const pa = new THREE.Vector3().fromArray(mesh.positions, a * 3);
  const pb = new THREE.Vector3().fromArray(mesh.positions, b * 3);
  const n1 = new THREE.Vector3().fromArray(tris.normals, faces[0] * 3);
  const n2 = new THREE.Vector3().fromArray(tris.normals, faces[1] * 3);
  const length = pa.distanceTo(pb);
  const angle = Math.acos(Math.max(-1, Math.min(1, n1.dot(n2))));
  const other = otherCorner(mesh, faces[1], a, b);
  const convex = n1.dot(other.sub(pa)) < 0;
  const heights = faces.map((f) => (2 * tris.areas[f]) / Math.max(length, 1e-9));

  return { mid: pa.add(pb).multiplyScalar(0.5), length, angle, convex, strip: Math.min(...heights) };
}

function otherCorner(mesh, face, a, b) {
  for (let k = 0; k < 3; k++) {
    const v = mesh.indices[face * 3 + k];

    if (v !== a && v !== b) return new THREE.Vector3().fromArray(mesh.positions, v * 3);
  }

  return new THREE.Vector3();
}

const isFilletEdge = (e) => e.angle < (FILLET_MAX_DEG * Math.PI) / 180 && e.length > e.strip;

function addEdge(acc, e, onEnvelope) {
  const weight = e.length * e.angle;
  const sharp = e.angle > (SHARP_DEG * Math.PI) / 180 ? weight : 0;
  const side = onEnvelope ? acc.near : acc.far;

  side.all += weight;
  side.sharp += sharp;

  if (!onEnvelope || !isFilletEdge(e)) return;

  const rung = nearestRung(e.strip / e.angle);

  acc.radii.set(rung, (acc.radii.get(rung) ?? 0) + e.length * e.strip);
}

function edgeStats(mesh, edges, tris, hull) {
  const acc = { near: { all: 0, sharp: 0 }, far: { all: 0, sharp: 0 }, radii: new Map() };

  for (const [key, faces] of edges) {
    if (faces.length !== 2) continue;

    const e = edgeGeometry(mesh, key, faces, tris);

    if (!e.convex || e.angle < (SMOOTH_MIN_DEG * Math.PI) / 180) continue;

    addEdge(acc, e, !hull || nearHull(hull, e.mid, NEAR_HULL_MM));
  }

  const share = (side) => (side.all > 0 ? round2(side.sharp / side.all) : null);

  return { envelopeSharp: share(acc.near), interiorSharp: share(acc.far), radii: acc.radii };
}

function radiusLadder(radii) {
  const total = [...radii.values()].reduce((s, x) => s + x, 0);

  if (!total) return { dominantRadius: null, dominantShare: 0, radii: [] };

  const ranked = [...radii].sort((x, y) => y[1] - x[1]);
  const significant = ranked.filter(([, w]) => w / total >= 0.1).map(([r]) => r);

  return { dominantRadius: ranked[0][0], dominantShare: round2(ranked[0][1] / total), radii: significant };
}

export function wallSamples(mesh, tris, query) {
  const samples = sampleSurface(mesh, tris, WALL_SAMPLES, 11);
  const out = [];

  for (const s of samples) {
    const inward = s.normal.clone().negate();
    const origin = s.point.clone().addScaledVector(inward, 1e-3);
    const hit = query.firstHit(origin, inward);

    const facing = hit?.normal ? hit.normal.dot(inward) : 1;

    if (hit && facing > OPPOSITE_WALL) out.push({ thickness: hit.distance + 1e-3, at: s.point });
  }

  return out;
}

export function wallStats(walls) {
  if (walls.length < 20) return null;

  const bins = new Map();

  for (const w of walls) {
    const bin = Math.round(w.thickness / WALL_BIN_MM);

    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }

  const modal = [...bins].sort((x, y) => y[1] - x[1])[0][0] * WALL_BIN_MM;
  const consistent = walls.filter((w) => Math.abs(w.thickness - modal) <= 0.6).length / walls.length;
  const sorted = walls.map((w) => w.thickness).sort((x, y) => x - y);
  const thinnest = walls.reduce((best, w) => (w.thickness < best.thickness ? w : best));

  return {
    modalMm: round2(modal),
    consistent: round2(consistent),
    p5Mm: round2(sorted[Math.floor(sorted.length * 0.05)]),
    thinShare: round2(walls.filter((w) => w.thickness < 0.9).length / walls.length),
    thinnest: { mm: round2(thinnest.thickness), at: thinnest.at.toArray().map((v) => Math.round(v * 10) / 10) },
  };
}

export function craftMetrics({ mesh, edges, tris, hull, walls, stats }) {
  const { envelopeSharp, interiorSharp, radii } = edgeStats(mesh, edges, tris, hull);
  const size = stats.bbox.size;
  const bboxVolume = size[0] * size[1] * size[2];

  return {
    envelopeSharp,
    interiorSharp,
    ...radiusLadder(radii),
    solidity: hull?.volume ? round2(stats.volume / hull.volume) : null,
    boxiness: hull?.volume && bboxVolume ? round2(hull.volume / bboxVolume) : null,
    thicknessMm: tris.total ? round2((2 * stats.volume) / tris.total) : null,
    areaMm2: Math.round(tris.total),
    walls: walls ? wallStats(walls) : null,
  };
}
