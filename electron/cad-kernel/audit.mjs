import { craftMetrics, wallSamples } from './craftMetrics.mjs';
import { convexHullOf, MeshQuery, triangleData } from './meshQuery.mjs';
import { verifyPorts } from './ports.mjs';
import { checkRequirements, holesContext } from './requirements.mjs';
import { topology, weldMesh } from './topology.mjs';

const MAX_AUDIT_TRIANGLES = 400_000;

function lazy(make) {
  let value;

  return () => (value ??= make());
}

export function auditMesh({ positions, indices, stats, expect, ports = [] }) {
  if (indices.length / 3 > MAX_AUDIT_TRIANGLES) return { skipped: 'too many triangles to audit' };

  const mesh = weldMesh(positions, indices);
  const topo = topology(mesh);
  const tris = triangleData(mesh);
  const hull = convexHullOf(mesh);
  const query = lazy(() => new MeshQuery(mesh));
  const walls = lazy(() => wallSamples(mesh, tris, query()));
  const ctx = { mesh, tris, stats, topology: topo, query, walls, holesAlong: holesContext(mesh) };
  const { edges, ...shape } = topo;

  return {
    ...shape,
    hullVolume: hull ? Math.round(hull.volume) : null,
    craft: craftMetrics({ mesh, edges, tris, hull, walls: walls(), stats }),
    ports: ports.length ? verifyPorts(ports, query()) : [],
    checks: checkRequirements(expect, ctx),
  };
}

export function safeAudit(input) {
  try {
    return auditMesh(input);
  } catch (err) {
    return { error: String(err?.message ?? err).slice(0, 200) };
  }
}
