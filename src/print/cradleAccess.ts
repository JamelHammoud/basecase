import * as THREE from 'three';
import type { Mat4 } from 'manifold-3d';
import { driverEnvelope, driverOptions, type DriverCylinder } from '../assembly/driverAccess';
import type { FastenerChain } from '../assembly/assemblyTypes';
import type { GuideMove } from '../guide/guideTypes';
import { place } from '../three/analysis/collide';
import { ShapeSolid } from '../three/analysis/shapeSolid';
import { meshOfSolid, soupOfMesh, type ManifoldApi, type Solid } from '../wrap/manifold';
import { CradleError, type CradleGeometry, type CradleSource } from './cradleTypes';
import { CradleResources, strictSolid } from './cradlePreparation';

export interface CradleAccess {
  obstacleHulls?: string[];
  sources: CradleSource[];
  moves: GuideMove[];
  drivers: Array<{ chain: FastenerChain; tool: 'straight' | 'L-key'; radiusMm?: number }>;
}

export function transformCradleSoup(positions: Float32Array, matrix: THREE.Matrix4): Float32Array {
  const result = positions.slice();
  const point = new THREE.Vector3();

  for (let at = 0; at < result.length; at += 3) point.fromArray(result, at).applyMatrix4(matrix).toArray(result, at);

  return result;
}

function sweep(solid: Solid, move: GuideMove, resources: CradleResources): Solid {
  const offset = new THREE.Vector3(...move.offset);
  const length = offset.length();

  if (!Number.isFinite(length) || length > 2000) throw new CradleError('move');

  if (length < 0.001) return solid;

  const rotation = new THREE.Matrix4().makeRotationFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(offset.normalize(), new THREE.Vector3(0, 0, 1)),
  );
  const turned = resources.own(solid.transform(rotation.elements as Mat4));
  const bounds = turned.boundingBox();
  const projection = resources.own(turned.project());
  const extrusion = resources.own(projection.extrude(bounds.max[2] - bounds.min[2] + length));
  const positioned = resources.own(extrusion.translate([0, 0, bounds.min[2]]));

  return resources.own(positioned.transform(rotation.invert().elements as Mat4));
}

function checkCylinder(
  api: ManifoldApi,
  input: { cylinder: DriverCylinder; skip: string; solids: Map<string, Solid> },
  resources: CradleResources,
) {
  const { cylinder, skip, solids } = input;
  const axis = new THREE.Vector3(...cylinder.axis);

  if (
    Math.abs(axis.length() - 1) > 1e-5 ||
    !Number.isFinite(cylinder.radius) ||
    cylinder.radius <= 0 ||
    !Number.isFinite(cylinder.length) ||
    cylinder.length <= 0
  )
    throw new CradleError('driver');

  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  const frame = new THREE.Matrix4().compose(new THREE.Vector3(...cylinder.from), rotation, new THREE.Vector3(1, 1, 1));
  const radius = cylinder.radius / Math.cos(Math.PI / 32) + 0.01;
  const primitive = resources.own(api.Manifold.cylinder(cylinder.length, radius, radius, 32));
  const envelope = resources.own(primitive.transform(frame.elements as Mat4));

  if ([...solids].some(([id, solid]) => id !== skip && !resources.own(envelope.intersect(solid)).isEmpty()))
    throw new CradleError('driver');
}

function checkDrivers(api: ManifoldApi, access: CradleAccess, solids: Map<string, Solid>, resources: CradleResources) {
  const shapes = [...solids].map(([id, solid]) => ({ id, shape: new ShapeSolid(soupOfMesh(meshOfSolid(solid))) }));

  try {
    const placed = shapes.map(({ id, shape }) => place(id, shape, new THREE.Matrix4()));

    for (const { chain, tool, radiusMm } of access.drivers) {
      const screened = driverOptions(chain, placed, new Set()).some(
        (option) => option.tool === tool && !option.blockers.length,
      );

      if (!screened) throw new CradleError('driver');

      for (const cylinder of driverEnvelope(chain, tool, radiusMm))
        checkCylinder(api, { cylinder, skip: chain.id, solids }, resources);
    }
  } finally {
    shapes.forEach(({ shape }) => shape.dispose());
  }
}

export function checkCradleAccess(api: ManifoldApi, geometry: CradleGeometry, access: CradleAccess): void {
  const resources = new CradleResources();

  try {
    const world = transformCradleSoup(geometry.positions, new THREE.Matrix4().fromArray(geometry.toWorld));
    const cradle = strictSolid(api, world, resources);
    const solids = new Map(access.sources.map((source) => [source.id, accessSolid(api, source, access, resources)]));

    if ([...solids.values()].some((solid) => !resources.own(solid.intersect(cradle)).isEmpty()))
      throw new CradleError('move');

    for (const move of access.moves) {
      const source = solids.get(move.partId);

      if (!source) throw new CradleError('source');

      const swept = sweep(source, move, resources);

      if (!resources.own(swept.intersect(cradle)).isEmpty()) throw new CradleError('move');
    }

    solids.set('assembly-cradle', cradle);
    checkDrivers(api, access, solids, resources);
  } finally {
    resources.dispose();
  }
}

function accessSolid(api: ManifoldApi, source: CradleSource, access: CradleAccess, resources: CradleResources): Solid {
  if (!access.obstacleHulls?.includes(source.id)) return strictSolid(api, source.positions, resources);

  const points: [number, number, number][] = [];

  for (let at = 0; at < source.positions.length; at += 3)
    points.push([source.positions[at], source.positions[at + 1], source.positions[at + 2]]);

  const hull = resources.own(api.Manifold.hull(points));

  if (hull.status() !== 'NoError' || hull.isEmpty()) throw new CradleError('mesh');

  return hull;
}
