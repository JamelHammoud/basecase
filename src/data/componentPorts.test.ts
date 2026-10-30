import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { describe, expect, it } from 'vitest';
import { componentArrays } from '../three/componentGeometry';
import type { Port } from '../types/ports';
import { COMPONENT_PORTS } from './componentPorts';

const FACE_TOLERANCE = 0.6;

async function meshOf(id: string) {
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (u: URL) => Uint8Array };
  const buf = readFileSync(new URL(`../../public/parts/${id}.glb`, import.meta.url));
  const arrays = await componentArrays(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  );
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      arrays.pieces.flatMap((p) => [...p.position]),
      3,
    ),
  );

  return new MeshBVH(geometry);
}

function castInto(bvh: MeshBVH, from: THREE.Vector3, axis: THREE.Vector3) {
  const start = from.clone().addScaledVector(axis, 5);
  const hit = bvh.raycastFirst(new THREE.Ray(start, axis.clone().negate()), THREE.DoubleSide);

  return hit ? hit.distance - 5 : Infinity;
}

function sideDirections(axis: THREE.Vector3) {
  const a = Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = a.cross(axis).normalize();
  const turn = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 8);

  u.applyQuaternion(turn);

  const v = axis.clone().cross(u).normalize();

  return [u, u.clone().negate(), v, v.clone().negate()];
}

function faceAround(bvh: MeshBVH, port: Port, radius: number) {
  const at = new THREE.Vector3(...port.position);
  const axis = new THREE.Vector3(...port.axis);

  return sideDirections(axis).filter(
    (d) => Math.abs(castInto(bvh, at.clone().addScaledVector(d, radius), axis)) < FACE_TOLERANCE,
  ).length;
}

const faceRadius = (d: number) => (d > 12 ? d / 2 - 2 : d / 2 - 0.5);

const isHole = (p: Port) => p.kind === 'screw' || p.kind === 'bore';

describe('catalog ports match the shipped meshes', () => {
  for (const [id, ports] of Object.entries(COMPONENT_PORTS)) {
    it(id, async () => {
      const bvh = await meshOf(id);
      const problems: string[] = [];

      for (const port of ports.filter(isHole)) {
        const empty = castInto(bvh, new THREE.Vector3(...port.position), new THREE.Vector3(...port.axis));
        const needed = Math.min(port.depthMm ?? 1, 1);

        if (empty < needed) problems.push(`${port.name}: hole blocked ${empty.toFixed(2)} mm in`);

        if (faceAround(bvh, port, (port.diameterMm ?? 2) / 2 + 0.8) < 2) problems.push(`${port.name}: no face around`);
      }

      for (const port of ports.filter((p) => p.kind === 'output' || p.kind === 'boss' || p.kind === 'face')) {
        const radius = port.kind === 'face' ? 0 : faceRadius(port.diameterMm ?? 4);
        const hits = radius ? faceAround(bvh, port, radius) : 0;
        const center = castInto(bvh, new THREE.Vector3(...port.position), new THREE.Vector3(...port.axis));

        if (hits < 2 && Math.abs(center) > FACE_TOLERANCE) problems.push(`${port.name}: no face at the port`);
      }

      expect(problems).toEqual([]);
    });
  }
});
