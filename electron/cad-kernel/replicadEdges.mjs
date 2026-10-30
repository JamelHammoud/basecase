import * as THREE from 'three';
import { convexHullOf, MeshQuery, nearHull } from './meshQuery.mjs';
import { weldMesh } from './topology.mjs';

const PLANE_AXIS = { XY: 2, XZ: 1, YZ: 0 };
const PROBE_MM = 0.2;
const NEAR_HULL_MM = 1.5;

const r2 = (v) => Math.round(v * 100) / 100;
const vec = (p) => new THREE.Vector3(p.x, p.y, p.z);
const at = (p) => `[${[p.x, p.y, p.z].map(r2).join(', ')}]`;

export function edgeKey(edge) {
  const pts = [edge.startPoint, edge.endPoint].map((p) => [p.x, p.y, p.z].map((v) => Math.round(v * 50)).join(','));
  const mid = edge.pointAt(0.5);

  return `${pts.sort().join('|')}|${[mid.x, mid.y, mid.z].map((v) => Math.round(v * 50)).join(',')}`;
}

const keysOf = (shapeOrKeys) =>
  shapeOrKeys instanceof Set ? shapeOrKeys : new Set((shapeOrKeys?.edges ?? shapeOrKeys ?? []).map(edgeKey));

const solids = new WeakMap();

function solidOf(shape) {
  if (solids.has(shape)) return solids.get(shape);

  const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.15 });
  const mesh = weldMesh(Array.from(m.vertices), Array.from(m.triangles));
  const solid = { query: new MeshQuery(mesh), hull: convexHullOf(mesh) };

  solids.set(shape, solid);

  return solid;
}

function facesByEdge(shape) {
  const map = new Map();

  for (const face of shape.faces) {
    for (const edge of face.edges) {
      const list = map.get(edgeKey(edge)) ?? [];

      if (!list.some((f) => f.isSame(face))) map.set(edgeKey(edge), [...list, face]);
    }
  }

  return map;
}

const betweenTwoFaces = (shape) => {
  const faces = facesByEdge(shape);

  return shape.edges.filter((e) => faces.get(edgeKey(e))?.length === 2);
};

function outwardNormal(face, point, query) {
  const n = vec(face.normalAt(point)).normalize();

  return query.inside(vec(point).addScaledVector(n, PROBE_MM)) ? n.negate() : n;
}

function dihedral(edge, faces, solid) {
  if (faces.length !== 2) return null;

  const mid = edge.pointAt(0.5);
  const [n1, n2] = faces.map((f) => outwardNormal(f, mid, solid.query));
  const turn = (Math.acos(Math.max(-1, Math.min(1, n1.dot(n2)))) * 180) / Math.PI;
  const probe = vec(mid).addScaledVector(n1.clone().sub(n2), PROBE_MM);

  return { turn, convex: !solid.query.inside(probe), mid: vec(mid) };
}

function convexEdges(shape, { minAngle = 20, outer = false } = {}) {
  const solid = solidOf(shape);
  const faces = facesByEdge(shape);

  return shape.edges.filter((edge) => {
    const d = dihedral(edge, faces.get(edgeKey(edge)) ?? [], solid);

    if (!d?.convex || d.turn < minAngle) return false;

    return !outer || !solid.hull || nearHull(solid.hull, d.mid, NEAR_HULL_MM);
  });
}

function edgesOnPlane(shape, plane = 'XY', offset = 0, tolerance = 0.01) {
  const k = PLANE_AXIS[plane];

  if (k === undefined) throw new Error(`edgesOnPlane: plane must be XY, XZ or YZ, not ${plane}`);

  const on = (p) => Math.abs([p.x, p.y, p.z][k] - offset) <= tolerance;

  return shape.edges.filter((e) => on(e.startPoint) && on(e.endPoint) && on(e.pointAt(0.5)));
}

function attempt({ shape, op, size, keys }) {
  const copy = shape.clone();

  try {
    return copy[op]((e) => (keys.has(edgeKey(e)) ? size : null));
  } catch {
    copy.delete?.();

    return null;
  }
}

function blendOneByOne({ shape, op, size, wanted }) {
  let current = shape;
  const failed = [];

  for (const edge of wanted) {
    const one = new Set([edgeKey(edge)]);
    const next =
      attempt({ shape: current, op, size, keys: one }) ?? attempt({ shape: current, op, size: size / 2, keys: one });

    if (next) current = next;
    else failed.push(edge);
  }

  return { shape: current, failed };
}

function blend(note, op) {
  return (shape, size, edges, label = '') => {
    const wanted = (Array.isArray(edges) ? edges : (edges?.edges ?? [])).filter(Boolean);
    const keys = new Set(wanted.map(edgeKey));
    const verb = op === 'fillet' ? 'fillet' : 'chamfer';
    const name = `${verb}${label ? ` "${label}"` : ''} ${size} mm`;

    if (!keys.size) {
      note(`${name} hit 0 of 0 intended edges: the edge list was empty.`);

      return shape;
    }

    const all = attempt({ shape, op, size, keys });

    if (all) {
      note(`${name} hit ${keys.size} of ${keys.size} intended edges.`);

      return all;
    }

    const { shape: out, failed } = blendOneByOne({ shape, op, size, wanted });

    note(
      `${name} hit ${keys.size - failed.length} of ${keys.size} intended edges (some at half size); gave up on ${failed.length}` +
        (failed.length
          ? `, e.g. at ${failed
              .slice(0, 3)
              .map((e) => at(e.pointAt(0.5)))
              .join(', ')}`
          : '') +
        '. Use a smaller size there or blend before the boolean that made the edge.',
    );

    return out;
  };
}

export function edgeHelpers(note) {
  return {
    edgeKeys: (shape) => keysOf(shape),
    newEdges: (before, after) => {
      const old = keysOf(before);

      return betweenTwoFaces(after).filter((e) => !old.has(edgeKey(e)));
    },
    convexEdges,
    edgesOnPlane,
    filletEdges: blend(note, 'fillet'),
    chamferEdges: blend(note, 'chamfer'),
  };
}
