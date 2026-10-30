import * as THREE from 'three';

export const PORT_KINDS = ['bore', 'boss', 'face', 'output', 'hole_circle', 'screw'];

const CHECKED = new Set(['bore', 'screw', 'boss', 'face']);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(+x));

function portFrom([name, position, axis, kind, diameter]) {
  if (typeof name !== 'string' || !isVec3(position) || !isVec3(axis) || !PORT_KINDS.includes(kind)) {
    return { error: `PORT needs name, [x,y,z], [ax,ay,az], one of ${PORT_KINDS.join('|')}[, diameter]` };
  }

  const dir = new THREE.Vector3(...axis.map(Number));

  if (dir.lengthSq() < 1e-12) return { error: `port ${name}: the axis is zero` };

  return {
    name,
    position: position.map((v) => Math.round(+v * 1000) / 1000),
    axis: dir
      .normalize()
      .toArray()
      .map((v) => Math.round(v * 10000) / 10000),
    kind,
    ...(Number.isFinite(+diameter) && +diameter > 0 ? { diameterMm: +diameter } : {}),
  };
}

function parseEchoArgs(rest) {
  const json = rest.replace(/\bundef\b/g, 'null').replace(/\binf\b/g, '1e308');

  try {
    return JSON.parse(`[${json}]`);
  } catch {
    return null;
  }
}

export function portsFromLogs(logs) {
  const ports = [];
  const problems = [];
  const seen = new Set();

  for (const line of logs) {
    const m = /^ECHO: "PORT",\s*(.*)$/.exec(line);

    if (!m || seen.has(m[1])) continue;

    seen.add(m[1]);

    const args = parseEchoArgs(m[1]);
    const port = args ? portFrom(args) : { error: `couldn't read ${line.slice(6, 120)}` };

    if (port.error) problems.push(port.error);
    else ports.push(port);
  }

  return { ports, problems };
}

export function portsFromObjects(list) {
  const ports = [];
  const problems = [];

  for (const p of Array.isArray(list) ? list : []) {
    const port = portFrom([p?.name, p?.position, p?.axis, p?.kind, p?.diameter ?? p?.diameterMm]);

    if (port.error) problems.push(port.error);
    else ports.push(port);
  }

  return { ports, problems };
}

function lateral(axis) {
  const helper = Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(axis, helper).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();

  return [u, u.clone().negate(), v, v.clone().negate()];
}

function boreProblem(port, query, at) {
  const axis = new THREE.Vector3(...port.axis);
  const d = port.diameterMm;
  const depths = [0.5, Math.min(2, d ?? 2)];

  if (depths.some((t) => query.inside(at(axis, -t)))) return 'solid material where the bore should be empty';

  if (!d) return null;

  const probe = at(axis, -Math.min(1, d / 4));
  const rim = lateral(axis).filter((dir) => query.inside(probe.clone().addScaledVector(dir, d / 2 + 0.8))).length;

  return rim >= 2 ? null : 'no wall around it (the bore is in open air or the diameter is wrong)';
}

function faceProblem(port, query, at) {
  const axis = new THREE.Vector3(...port.axis);

  if (!query.inside(at(axis, -0.5))) return 'no material just behind it (the axis should point out of the part)';

  return query.inside(at(axis, 0.5)) ? 'material in front of it (the axis should point out of the part)' : null;
}

export function verifyPorts(ports, query) {
  return ports.map((port) => {
    if (!CHECKED.has(port.kind)) return { ...port, check: 'unchecked' };

    const origin = new THREE.Vector3(...port.position);
    const at = (axis, t) => origin.clone().addScaledVector(axis, t);
    const isHole = port.kind === 'bore' || port.kind === 'screw';
    const problem = isHole ? boreProblem(port, query, at) : faceProblem(port, query, at);

    return problem ? { ...port, check: 'failed', problem } : { ...port, check: 'ok' };
  });
}
