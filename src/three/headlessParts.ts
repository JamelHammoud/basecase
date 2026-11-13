import type * as THREE from 'three';
import { fastenerInput } from '../assembly/fastenerSpec';
import { jointsWithChains, needsClamps } from '../assembly/rigJoints';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { fastenersIn, measuresIn } from './analysis/analysisPool';
import { snapshotShapes } from './analysis/sceneShapes';
import { buildPartGroup } from './buildPartMesh';
import { componentMeshesReady, provideMeshFiles, type MeshFiles } from './componentMeshes';
import { localTriangles, type MeshMeasure } from './meshMeasure';
import { prepareParts } from './partMesh/prepare';

export interface HeadlessParts {
  joints: RobotJoint[];
  measures: Record<string, MeshMeasure>;
  partTriangles: (id: string) => Float32Array | null;
}

interface PartObject {
  id: string;
  object: THREE.Object3D;
}

const isSolid = (p: ScenePart) => p.role === 'solid' && p.kind !== 'image_plane';

async function clampedJoints(joints: RobotJoint[], parts: ScenePart[], objects: PartObject[]) {
  if (!needsClamps(joints, parts)) return jointsWithChains(joints, parts, null);

  const solid = new Set(parts.filter(isSolid).map((p) => p.id));
  const chains = await fastenersIn(snapshotShapes(objects.filter((o) => solid.has(o.id))), fastenerInput(parts));

  return jointsWithChains(joints, parts, chains);
}

export async function headlessParts(
  parts: ScenePart[],
  joints: RobotJoint[],
  meshes: MeshFiles,
): Promise<HeadlessParts> {
  provideMeshFiles(meshes);
  await componentMeshesReady(Object.keys(meshes));
  await prepareParts(parts);

  const objects = parts.map((part) => ({
    id: part.id,
    object: buildPartGroup(part, false, { shareGeometry: true, lateEdges: true }),
  }));
  const byId = new Map(objects.map((o) => [o.id, o.object]));
  const measures = await measuresIn(snapshotShapes(objects));

  return {
    joints: await clampedJoints(joints, parts, objects),
    measures,
    partTriangles: (id) => {
      const object = byId.get(id);

      return object ? localTriangles(object) : null;
    },
  };
}
