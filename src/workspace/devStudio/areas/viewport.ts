import * as THREE from 'three';
import type { Viewport3DHandle } from '../../../components/Viewport3D';
import { buildPartGroup } from '../../../three/buildPartMesh';
import type { ProjectSettings, ScenePart } from '../../../types/robotics';
import { bytesToBase64 } from '../../../utils/base64';
import { downstreamOf } from '../../../utils/engineeringMass';
import { sweepSamples } from '../../../utils/engineeringJoints';
import { resolveJoints } from '../../../utils/kinematics';
import type { Studio } from '../types';

type Point = [number, number, number];

async function stlBase64(viewport: Viewport3DHandle | null) {
  return bytesToBase64((await viewport?.exportStl()) ?? new Uint8Array());
}

function addMeshTriangles(groups: Record<string, number[]>, obj: THREE.Object3D) {
  const mesh = obj as THREE.Mesh;

  if (!mesh.isMesh) return;

  const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();

  geo.applyMatrix4(mesh.matrixWorld);

  const pos = geo.getAttribute('position');
  const soup = (groups['#' + mat.color.getHexString(THREE.SRGBColorSpace)] ??= []);

  for (let i = 0; i < pos.count; i++) soup.push(pos.getX(i), pos.getY(i), pos.getZ(i));
}

function meshByColor(parts: ScenePart[]) {
  const groups: Record<string, number[]> = {};

  for (const part of parts.filter((p) => p.visible && p.role === 'solid')) {
    const group = buildPartGroup(part, false);

    group.updateMatrixWorld(true);
    group.traverse((obj) => addMeshTriangles(groups, obj));
  }

  return groups;
}

async function rangeClashes(parts: ScenePart[], project: ProjectSettings, viewport: Viewport3DHandle | null) {
  const joints = resolveJoints(project.joints ?? [], parts);
  const turning = joints.filter((j) => j.type === 'revolute');
  const specs = turning.map((j) => ({
    moving: [...downstreamOf(j, joints)],
    origin: j.origin,
    axis: new THREE.Vector3(...j.axis).normalize().toArray(),
    anglesDeg: sweepSamples(j, j.range ?? [-90, 90]),
  }));
  const hits = (await viewport?.sweepClashes(specs)) ?? [];

  return hits.flatMap((list, i) => list.map((hit) => ({ ...hit, joint: turning[i].id })));
}

export default function viewportStudio(studio: Studio) {
  const viewport = () => studio().core.viewportRef.current;
  const docs = () => studio().core.docs;

  return {
    rangeClashes: () => rangeClashes(docs().partsRef.current, docs().projectRef.current, viewport()),
    interference: () => viewport()?.interference() ?? { interferences: [], coplanar: [] },
    checkDots: () => viewport()?.checkDotCount() ?? 0,
    caseTrails: () => viewport()?.caseTrailEnds() ?? [],
    stlBase64: () => stlBase64(viewport()),
    capture: (views: string[], ids?: string[]) => viewport()?.captureViews(views, ids) ?? [],
    projectPoints: (points: Point[]) => viewport()?.projectPoints(points) ?? [],
    project: (points: Point[]) => viewport()?.projectPoints(points) ?? [],
    meshByColor: () => meshByColor(docs().partsRef.current),
    dragPart: (id: string, to: Point, free?: boolean) => viewport()?.dragPart(id, to, free) ?? false,
    triangleCount: (id: string) => (viewport()?.partTriangles(id)?.length ?? 0) / 9,
    partTriangles: (id: string) => Array.from(viewport()?.partTriangles(id) ?? []),
    shownParts: () => viewport()?.shownPartIds() ?? [],
  };
}
