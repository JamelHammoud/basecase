import * as THREE from 'three';
import type { SimplePolygon } from 'manifold-3d';
import { meshOfSolid, soupOfMesh, type ManifoldApi, type Solid } from '../wrap/manifold';
import { CRADLE_LIMITS as limits, CradleError, type CradleInput, type CradleGeometry } from './cradleTypes';
import { checkCradleInput, CradleResources, filledOutline, prepareCradle } from './cradlePreparation';

function restingArea(api: ManifoldApi, solid: Solid, resources: CradleResources) {
  const positions = soupOfMesh(meshOfSolid(solid));
  const polygons: SimplePolygon[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const edge = new THREE.Vector3();
  let undercut = false;

  for (let at = 0; at < positions.length; at += 9) {
    a.fromArray(positions, at);
    b.fromArray(positions, at + 3);
    c.fromArray(positions, at + 6);
    normal.subVectors(b, a).cross(edge.subVectors(c, a));

    if (normal.z >= -normal.length() * 1e-5) continue;

    const resting = Math.max(a.z, b.z, c.z) <= limits.toleranceMm;

    if (resting)
      polygons.push([
        [a.x, a.y],
        [c.x, c.y],
        [b.x, b.y],
      ]);

    undercut ||= !resting;
  }

  if (!polygons.length) throw new CradleError('face');

  if (undercut) throw new CradleError('undercut');

  return resources.own(new api.CrossSection(polygons, 'Positive')).area();
}

export function makeCradle(api: ManifoldApi, input: CradleInput): CradleGeometry {
  checkCradleInput(input);

  const resources = new CradleResources();

  try {
    const { solid, worldToLocal } = prepareCradle(api, input, resources);
    const supportAreaMm2 = restingArea(api, solid, resources);
    const projected = resources.own(solid.project());
    const filled = resources.own(filledOutline(api, projected));
    const outline = resources.own(filled.hull());

    if (supportAreaMm2 < limits.minSupportAreaMm2 || supportAreaMm2 / outline.area() < limits.minSupportShare)
      throw new CradleError('support');

    const cornerAllowance = 1 / Math.cos(Math.PI / 32);
    const cavity = resources.own(
      outline.offset(input.clearanceMm * cornerAllowance + limits.toleranceMm, 'Round', 2, 32),
    );
    const perimeter = resources.own(cavity.offset(input.wallMm * cornerAllowance + limits.toleranceMm, 'Round', 2, 32));
    const blank = resources.own(perimeter.extrude(input.baseMm + input.depthMm));
    const bore = resources.own(cavity.extrude(input.depthMm + limits.toleranceMm));
    const tool = resources.own(bore.translate([0, 0, input.baseMm]));
    const cradle = resources.own(blank.subtract(tool));
    const pieces = cradle.decompose().map((piece) => resources.own(piece));

    if (cradle.status() !== 'NoError' || pieces.length !== 1) throw new CradleError('support');

    if (cradle.numTri() > limits.maxOutputTriangles) throw new CradleError('limit');

    const positions = soupOfMesh(meshOfSolid(cradle));
    const toPrint = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const point = new THREE.Vector3();

    for (let at = 0; at < positions.length; at += 3)
      point.fromArray(positions, at).applyMatrix4(toPrint).toArray(positions, at);

    const toWorld = worldToLocal
      .invert()
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, -input.baseMm - limits.toleranceMm))
      .multiply(toPrint.invert());
    const buffer = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));

    buffer.computeVertexNormals();

    const normals = new Float32Array(buffer.attributes.normal.array);

    buffer.dispose();

    return {
      positions,
      normals,
      sourceIds: input.sources.map((source) => source.id),
      toWorld: toWorld.elements,
      supportAreaMm2,
      cavityAreaMm2: cavity.area(),
      clearanceMm: input.clearanceMm,
      baseMm: input.baseMm,
      wallMm: input.wallMm,
      depthMm: input.depthMm,
    };
  } finally {
    resources.dispose();
  }
}
