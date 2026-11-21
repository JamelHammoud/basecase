import * as THREE from 'three';
import { portsOf, worldPort } from '../agent/ports';
import { COMPONENT_BY_ID, actuatorOf } from '../data/components';
import { isSourcedId, registerSourced } from '../data/sourcedItems';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { loadComponentMesh, provideMeshFiles, type MeshFiles } from '../three/componentMeshes';
import { localTriangles, rigidFrame } from '../three/meshMeasure';
import { worldMeasure } from '../three/analysis/shapeReports';
import { solidFromPositions } from '../three/analysis/shapeSolid';
import { outputLine } from '../three/analysis/rotorSplit';
import type { ScenePart } from '../types/robotics';
import type { ServoOutput } from '../utils/engineeringTypes';
import type { V3 } from '../utils/kinematics';
import type { StudyScene } from './types';

const prepared = new WeakSet<MeshFiles>();

function provideStudyMeshes(files: MeshFiles | undefined) {
  if (!files || prepared.has(files)) return;

  provideMeshFiles(files);
  prepared.add(files);
}

function geometryOf(part: ScenePart) {
  const group = buildPartGroup(part, false, { shareGeometry: true });

  try {
    const triangles = localTriangles(group);

    if (group.userData.placeholder || !triangles.length)
      throw new Error(`${part.name}: Load the mesh before grading this design.`);

    const solid = solidFromPositions(triangles);

    try {
      const matrix = rigidFrame(group).matrix;

      return { triangles, measure: worldMeasure(solid, matrix), output: servoOutput(part, triangles, matrix) };
    } finally {
      solid.dispose();
    }
  } finally {
    releasePartGroup(group);
  }
}

function servoOutput(part: ScenePart, triangles: Float32Array, matrix: THREE.Matrix4): ServoOutput | undefined {
  if (part.kind !== 'component' || !part.componentId) return undefined;

  const servo = COMPONENT_BY_ID[part.componentId]?.group === 'Servos';

  if (!servo && !actuatorOf(part.componentId, part.componentVariant)) return undefined;

  const declared = portsOf(part)
    .filter((port) => port.kind === 'output')
    .map((port) => {
      const at = worldPort(part, port);

      return { point: at.position, axis: at.axis };
    });

  if (!servo) return declared.length ? { ...declared[0], alternates: declared.slice(1) } : undefined;

  return {
    point: outputLine(triangles).start.applyMatrix4(matrix).toArray() as V3,
    axis: new THREE.Vector3(0, 1, 0).transformDirection(matrix).toArray() as V3,
    alternates: declared,
  };
}

export async function refreshStudyGeometry(
  scene: StudyScene,
  changedIds: string[],
  triangleLimit = Infinity,
): Promise<StudyScene> {
  if (typeof document !== 'undefined') throw new Error('Study geometry needs a worker.');

  const changed = new Set(changedIds);
  const parts = scene.parts.filter((part) => changed.has(part.id));

  if (!parts.length) return scene;

  registerSourced(scene.project.sourced ?? []);
  provideStudyMeshes(scene.meshFiles);

  const missing = parts.find(
    (part) => part.componentId && isSourcedId(part.componentId) && !scene.meshFiles?.[part.componentId],
  );

  if (missing) throw new Error(`${missing.name}: Load the sourced mesh before grading this design.`);

  await Promise.all(
    [
      ...new Set(parts.flatMap((part) => (part.kind === 'component' && part.componentId ? [part.componentId] : []))),
    ].map(loadComponentMesh),
  );

  const triangles = { ...scene.triangles };
  const measures = { ...scene.measures };
  const servoOutputs = { ...scene.servoOutputs };
  let triangleCount = 0;

  for (const part of parts) {
    if (part.kind === 'image_plane') continue;

    const geometry = geometryOf(part);

    triangleCount += geometry.triangles.length / 9;

    if (triangleCount > triangleLimit) throw new Error('Robot mesh is too large.');

    triangles[part.id] = geometry.triangles;
    measures[part.id] = geometry.measure;

    if (geometry.output) servoOutputs[part.id] = geometry.output;
    else delete servoOutputs[part.id];
  }

  return { ...scene, triangles, measures, servoOutputs };
}
