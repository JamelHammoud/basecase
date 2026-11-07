import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export function buildProbe(mesh, k) {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  geometry.setIndex(mesh.indices);
  geometry.computeBoundingBox();

  const bvh = new MeshBVH(geometry);
  const box = geometry.boundingBox;
  const [u, v] = [0, 1, 2].filter((i) => i !== k);
  const point = (a, b, c) => {
    const p = new THREE.Vector3();

    p.setComponent(u, a);
    p.setComponent(v, b);
    p.setComponent(k, c);

    return p;
  };
  const cast = (a, b, fromTop) => {
    const start = point(a, b, fromTop ? box.max.getComponent(k) + 5 : box.min.getComponent(k) - 5);
    const dir = point(0, 0, fromTop ? -1 : 1);
    const hit = bvh.raycastFirst(new THREE.Ray(start, dir), THREE.DoubleSide);

    return hit ? hit.point.getComponent(k) : null;
  };

  return { box, k, u, v, cast };
}

export function enclosedMisses(probe, step) {
  const { box, u, v, cast } = probe;
  const nu = Math.ceil((box.max.getComponent(u) - box.min.getComponent(u)) / step);
  const nv = Math.ceil((box.max.getComponent(v) - box.min.getComponent(v)) / step);
  const at = (i, j) => [box.min.getComponent(u) + (i + 0.5) * step, box.min.getComponent(v) + (j + 0.5) * step];
  const miss = Array.from({ length: nu }, (_, i) =>
    Array.from({ length: nv }, (_, j) => cast(...at(i, j), true) === null),
  );
  const seen = new Set();
  const regions = [];

  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      if (!miss[i][j] || seen.has(i * nv + j)) continue;

      const region = flood({ miss, seen, nu, nv }, i, j);

      if (!region.touchesEdge) regions.push(region.cells.map(([a, b]) => at(a, b)));
    }

  return regions;
}

function flood(grid, i0, j0) {
  const { miss, seen, nu, nv } = grid;
  const stack = [[i0, j0]];
  const cells = [];
  let touchesEdge = false;

  seen.add(i0 * nv + j0);

  while (stack.length) {
    const [i, j] = stack.pop();

    cells.push([i, j]);
    touchesEdge ||= i === 0 || j === 0 || i === nu - 1 || j === nv - 1;

    for (const [a, b] of [
      [i + 1, j],
      [i - 1, j],
      [i, j + 1],
      [i, j - 1],
    ]) {
      const open = a >= 0 && b >= 0 && a < nu && b < nv && miss[a][b] && !seen.has(a * nv + b);

      if (!open) continue;

      seen.add(a * nv + b);
      stack.push([a, b]);
    }
  }

  return { cells, touchesEdge };
}

export function refineHole(probe, coarse, step) {
  const fine = step / 6;
  const us = coarse.map((p) => p[0]);
  const vs = coarse.map((p) => p[1]);
  let sum = [0, 0];
  let n = 0;

  for (let a = Math.min(...us) - step; a <= Math.max(...us) + step; a += fine)
    for (let b = Math.min(...vs) - step; b <= Math.max(...vs) + step; b += fine) {
      if (probe.cast(a, b, true) !== null) continue;

      sum = [sum[0] + a, sum[1] + b];
      n++;
    }

  const center = [sum[0] / n, sum[1] / n];
  const diameter = 2 * Math.sqrt((n * fine * fine) / Math.PI);
  const ring = diameter / 2 + 0.8;
  const top = probe.cast(center[0] + ring, center[1], true);
  const bottom = probe.cast(center[0] + ring, center[1], false);

  return { center, diameter, faces: [bottom, top] };
}
