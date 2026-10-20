import type { RefObject } from 'react';
import * as THREE from 'three';
import type { PoseReply } from '../agent/agentPose';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { buildPartGroup } from '../three/buildPartMesh';
import type { ProjectSettings, RobotPoseState, SceneAnnotation, ScenePart } from '../types/robotics';
import { sceneToStl } from '../utils/aiHandoff';
import { importRobot } from '../utils/robotImport';
import { robotPreviewImage } from '../utils/robotPreview';
import { newSceneId } from '../utils/sceneIds';
import type { Posing } from '../utils/usePosing';
import type { WorkspaceSeed } from './types';
import type { ImportRobotResult, RobotSource } from './useRobotInsert';

type Payload = Record<string, unknown>;

export interface DevActions {
  importRobot: (source: RobotSource) => Promise<ImportRobotResult>;
  posing: Posing;
  load: (seed: WorkspaceSeed) => void;
  poseTool: (kind: string, payload: Payload) => Promise<PoseReply>;
  simTool: (kind: string, payload: Payload) => Promise<PoseReply>;
  clear: () => void;
  select: (ids: string[]) => void;
  guide: () => Promise<{ html: string; pages: number; steps: number } | null>;
}

export interface DevStudioDeps {
  partsRef: RefObject<ScenePart[]>;
  projectRef: RefObject<ProjectSettings>;
  viewportRef: RefObject<Viewport3DHandle | null>;
  devRef: RefObject<DevActions>;
}

const CHUNK = 0x8000;

function stlBase64(parts: ScenePart[]) {
  const view = sceneToStl(parts);
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let bin = '';

  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));

  return btoa(bin);
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

const cadSources = (parts: ScenePart[]) =>
  parts
    .filter((p) => p.cad)
    .map(({ id, name, color, role, position, rotation, dimensions, cad }) => ({
      id,
      name,
      color,
      role,
      position,
      rotation,
      dimensions,
      cad: { language: cad!.language, code: cad!.code, originOffset: cad!.originOffset, baseSize: cad!.baseSize },
    }));

const partSummaries = (parts: ScenePart[]) =>
  parts.map(({ id, name, kind, role, visible, group, componentId }) => ({
    id,
    name,
    kind,
    role,
    visible,
    group: group?.name,
    componentId,
  }));

interface DevRecord {
  parts: ScenePart[];
  project?: ProjectSettings;
  annotations?: SceneAnnotation[];
}

export function devStudioApi({ partsRef, projectRef, viewportRef, devRef }: DevStudioDeps) {
  return {
    parts: () => partSummaries(partsRef.current),
    interference: () => viewportRef.current?.interference() ?? { interferences: [], coplanar: [] },
    sceneRecord: () => ({ parts: partsRef.current, project: projectRef.current, annotations: [] }),
    stlBase64: () => stlBase64(partsRef.current),
    capture: (views: string[], ids?: string[]) => viewportRef.current?.captureViews(views, ids) ?? [],
    meshByColor: () => meshByColor(partsRef.current),
    cadSources: () => cadSources(partsRef.current),
    clear: () => devRef.current.clear(),
    select: (ids: string[]) => devRef.current.select(ids),
    importRobot: (url: string, name?: string) => devRef.current.importRobot({ kind: 'url', url, name }),
    robotPreview: async (url: string, width = 480) =>
      robotPreviewImage((await importRobot({ kind: 'url', url })).parts, url, width),
    setPose: (values: Record<string, number>, root?: RobotPoseState['root']) =>
      devRef.current.posing.setPose({ values, root }),
    posing: () => devRef.current.posing,
    load: (record: DevRecord) =>
      devRef.current.load({
        sceneId: newSceneId(),
        sceneName: 'Untitled',
        globalGoal: '',
        parts: record.parts,
        annotations: record.annotations ?? [],
        project: record.project,
      }),
    poseTool: (kind: string, payload: Payload) => devRef.current.poseTool(kind, payload),
    simTool: (kind: string, payload: Payload) => devRef.current.simTool(kind, payload),
    guide: () => devRef.current.guide(),
  };
}
