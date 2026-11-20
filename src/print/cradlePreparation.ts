import * as THREE from 'three';
import type { CrossSection, Manifold } from 'manifold-3d';
import type { ManifoldApi } from '../wrap/manifold';
import { weld } from './threeMf';
import { PRINT_RULES } from '../three/printability';
import { CRADLE_LIMITS as limits, CradleError, type CradleInput } from './cradleTypes';

export function checkCradleInput(input: CradleInput): void {
  const values = [...input.down, input.clearanceMm, input.baseMm, input.wallMm, input.depthMm];
  const ids = new Set(input.sources.map((source) => source.id));

  if (values.some((value) => !Number.isFinite(value)) || Math.abs(Math.hypot(...input.down) - 1) > 1e-6)
    throw new CradleError('input');

  if (input.sources.length === 0 || ids.size !== input.sources.length || ids.has('')) throw new CradleError('input');

  if (input.wallMm < PRINT_RULES.minWallMm + 2 * limits.toleranceMm || input.baseMm < PRINT_RULES.minWallMm)
    throw new CradleError('wall');

  if (
    exceedsMeshLimits(input) ||
    input.clearanceMm < 2 * limits.toleranceMm ||
    input.clearanceMm > limits.maxClearanceMm ||
    input.baseMm > limits.maxBaseMm ||
    input.wallMm > limits.maxWallMm ||
    input.depthMm < PRINT_RULES.minWallMm ||
    input.depthMm > limits.maxDepthMm
  )
    throw new CradleError('limit');
}

function exceedsMeshLimits(input: CradleInput): boolean {
  return (
    input.sources.length > limits.maxSources ||
    input.sources.reduce((sum, source) => sum + source.positions.length / 9, 0) > limits.maxTriangles
  );
}

export class CradleResources {
  private owned: Array<{ delete: () => void }> = [];

  own<T extends { delete: () => void }>(value: T): T {
    this.owned.push(value);

    return value;
  }

  dispose(): void {
    this.owned.reverse().forEach((value) => value.delete());
    this.owned = [];
  }
}

function transformedSource(positions: Float32Array, rotation: THREE.Matrix4): Float32Array {
  if (!positions.length || positions.length % 9 !== 0) throw new CradleError('mesh');

  const point = new THREE.Vector3();
  const result = new Float32Array(positions.length);

  for (let at = 0; at < positions.length; at += 3) {
    point.fromArray(positions, at);

    if (point.toArray().some((value) => !Number.isFinite(value) || Math.abs(value) > limits.maxCoordinateMm))
      throw new CradleError('mesh');

    point.applyMatrix4(rotation).toArray(result, at);
  }

  return result;
}

export function strictSolid(api: ManifoldApi, positions: Float32Array, resources: CradleResources): Manifold {
  const mesh = weld(positions);

  try {
    const solid = resources.own(
      new api.Manifold(new api.Mesh({ numProp: 3, vertProperties: mesh.vertices, triVerts: mesh.indices })),
    );

    if (solid.status() !== 'NoError' || solid.isEmpty() || solid.volume() <= 0) throw new CradleError('mesh');

    return solid;
  } catch {
    throw new CradleError('mesh');
  }
}

export function prepareCradle(api: ManifoldApi, input: CradleInput, resources: CradleResources) {
  const up = new THREE.Vector3(...input.down).negate();
  const rotation = new THREE.Matrix4().makeRotationFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 0, 1)),
  );
  const sources = input.sources.map((source) =>
    strictSolid(api, transformedSource(source.positions, rotation), resources),
  );
  const joined = resources.own(api.Manifold.union(sources));
  const { min, max } = joined.boundingBox();
  const span = max.map((value, axis) => value - min[axis]);

  if (span.some((value) => value > limits.maxSpanMm) || input.depthMm >= span[2]) throw new CradleError('limit');

  const shift: [number, number, number] = [-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -min[2]];
  const solid = resources.own(joined.translate(shift));
  const worldToLocal = new THREE.Matrix4().makeTranslation(...shift).multiply(rotation);

  return { solid, worldToLocal };
}

function areaOf(polygon: Array<[number, number]>): number {
  return (
    polygon.reduce((sum, p, index) => {
      const q = polygon[(index + 1) % polygon.length];

      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
  );
}

export function filledOutline(api: ManifoldApi, section: CrossSection): CrossSection {
  return new api.CrossSection(
    section.toPolygons().filter((polygon) => areaOf(polygon) > 0),
    'Positive',
  );
}
