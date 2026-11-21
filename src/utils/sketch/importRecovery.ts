import { RECOVERY_ERRORS } from './recoveryErrors';
import { Euler, Matrix4, MathUtils, Vector3 } from 'three';
import type { ScenePart } from '../../types/robotics';
import { detectSheet } from '../../sheet/detectSheet';
import { conformRecoveryTriangles } from './recoveryConform';
import { validateRecoverySource } from './recoverySource';
import { buildPartGroup, releasePartGroup } from '../../three/buildPartMesh';
import { localTriangles, worldTriangles } from '../../three/meshMeasure';
import { polylineSketch } from './edit';
import { partFromSolid, sketchSolid, type SketchPlane, type Vec3 } from './placement';
import { compareRecovery } from './recoveryComparison';
import { validateRecoveryProfiles } from './recoveryProfiles';
import { recoveryTopology } from './recoveryTopology';
import { loopBounds } from './profile';

function prepared(part: ScenePart, world = false) {
  const group = buildPartGroup(part, false, { lateEdges: false });

  try {
    return world ? worldTriangles(group) : localTriangles(group);
  } finally {
    releasePartGroup(group);
  }
}

function recoveryPlane(part: ScenePart, normal: Vec3, center: Vec3, depth: number): SketchPlane {
  const n = new Vector3(...normal);
  const reference = Math.abs(n.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const u = reference.addScaledVector(n, -reference.dot(n)).normalize();
  const v = new Vector3().crossVectors(n, u);
  const rotation = new Matrix4().makeRotationFromEuler(
    new Euler(...(part.rotation.map(MathUtils.degToRad) as Vec3), 'XYZ'),
  );
  const origin = new Vector3(...center)
    .addScaledVector(n, -depth / 2)
    .applyMatrix4(rotation)
    .add(new Vector3(...part.position));

  return {
    origin: origin.toArray(),
    u: u.applyMatrix4(rotation).toArray(),
    v: v.applyMatrix4(rotation).toArray(),
    n: n.applyMatrix4(rotation).toArray(),
  };
}

export function recoverImportedSketch(part: ScenePart) {
  const started = performance.now();

  validateRecoverySource(part);

  const source = conformRecoveryTriangles(prepared(part));
  const holes = recoveryTopology(source);
  const profile = detectSheet(source);

  if (
    !profile ||
    holes !== profile.holes.length ||
    profile.thicknessMm < 0.1 - 1e-6 ||
    profile.thicknessMm > 250 + 1e-6
  )
    throw new Error(RECOVERY_ERRORS.geometry);

  const { min, max } = loopBounds(profile.outline);

  if (profile.thicknessMm >= Math.min(max[0] - min[0], max[1] - min[1]) - 0.002)
    throw new Error(RECOVERY_ERRORS.geometry);

  const loops = [profile.outline, ...profile.holes];

  validateRecoveryProfiles(loops);

  const recognized = performance.now();
  const sketch = polylineSketch(loops);
  const plane = recoveryPlane(part, profile.normal, profile.center ?? [0, 0, 0], profile.thicknessMm);
  const solid = sketchSolid(
    plane,
    { sketch, mode: 'extrude', depth: profile.thicknessMm },
    { id: `${part.id}-sketch`, name: part.name, color: part.color },
  );

  if (!solid) throw new Error(RECOVERY_ERRORS.geometry);

  const recovery = {
    deviationMm: 0,
    volumeDeviationMm3: 0,
    holes,
    position: part.position,
    rotation: part.rotation,
    dimensions: part.dimensions,
    sheetTransform: part.sheetTransform,
  };
  const converted: ScenePart = {
    ...partFromSolid({ ...part, sketch: { ...solid.record, recovery } }, solid),
    kind: 'custom_model',
    role: part.role,
    sheetTransform: undefined,
  };
  const measurement = compareRecovery(prepared(part, true), prepared(converted, true));

  converted.sketch = {
    ...solid.record,
    recovery: { ...recovery, ...measurement },
  };

  return {
    part: converted,
    measurement,
    metrics: {
      recognitionMs: recognized - started,
      reconstructionMs: performance.now() - recognized,
      triangles: source.length / 9,
      retainedOriginalBytes: new TextEncoder().encode(JSON.stringify(part.mesh)).byteLength,
    },
  };
}
