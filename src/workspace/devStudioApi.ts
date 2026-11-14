import { buildBom } from '../utils/bom';
import type { HandoffStub } from './handoffStub';
import type { RefObject } from 'react';
import * as THREE from 'three';
import type { PoseReply } from '../agent/agentPose';
import type { DriveCommand } from '../sim/driveTypes';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { buildPartGroup } from '../three/buildPartMesh';
import type { ProjectSettings, RobotPoseState, SceneAnnotation, ScenePart } from '../types/robotics';
import { sceneToStl } from '../utils/aiHandoff';
import { lastDownload } from '../utils/downloadBytes';
import { replayErrors } from '../reality/jointReplay';
import { base64ToBytes, bytesToBase64 } from '../utils/base64';
import type { Angles } from '../robot/robotGap';
import { radiansToDegrees as degrees } from '../utils/angle';
import { phoneSnapshot } from '../phone/phoneStore';
import { inputEvents } from '../sim/inputEvents';
import {
  feedOperatorFace,
  feedOperatorHand,
  feedOperatorPose,
  type FaceSample,
  type HandSample,
  operatorCameraSnapshot,
  operatorFeeding,
  operatorLatency,
  operatorTrackState,
} from '../cameras/operator/operatorCamera';
import type { PoseSample } from '../cameras/operator/poseFollow';
import { feedVoice } from '../voice/voiceSession';
import { robotLinkState, startRobotStore, type RobotLinkApi } from '../robot/robotStore';
import { stubTabEngine } from '../skills/skillsPlatform';
import { pickNextFiles } from '../utils/pickFiles';
import { twinSnapshot } from '../robot/robotTwin';
import { importRobot } from '../utils/robotImport';
import { downstreamOf } from '../utils/engineeringMass';
import { sweepSamples } from '../utils/engineeringJoints';
import { resolveJoints } from '../utils/kinematics';
import { robotPreviewImage } from '../utils/robotPreview';
import { newSceneId } from '../utils/sceneIds';
import type { ServoCalibration } from '../reality/types';
import type { Posing } from '../utils/usePosing';
import { posedPort } from '../utils/posedPort';
import type { Vec2 } from '../utils/linkage';
import type { WorkspaceSeed } from './types';
import type { ImportRobotResult, RobotSource } from './useRobotInsert';
import type { JointDragStep } from './useSkeletonEdit';
import type { WorldEvent } from '../cases/worldSet';
import { streamCost } from '../cameras/liveFeed';
import type { CodeReport } from '../cases/console/codeBridge';
import { limitExplore } from './useCaseExplore';
import { matStudioApi, type MatDevActions } from './devMatFeed';

type Payload = Record<string, unknown>;

export interface DevActions {
  importRobot: (source: RobotSource) => Promise<ImportRobotResult>;
  posing: Posing;
  load: (seed: WorkspaceSeed) => void;
  poseTool: (kind: string, payload: Payload) => Promise<PoseReply>;
  simTool: (kind: string, payload: Payload) => Promise<PoseReply>;
  agentRequest: (kind: string, payload: Payload) => Promise<unknown>;
  clear: () => void;
  select: (ids: string[]) => void;
  dragSkeleton: (step: Omit<JointDragStep, 'phase'>) => void;
  dropFiles: (files: File[]) => void;
  selection: () => string[];
  selectFace: (partId: string, normal: [number, number, number]) => void;
  sketchPath: (points: Vec2[]) => void;
  guide: () => Promise<{ html: string; pages: number; steps: number } | null>;
  buildAlongSteps: () => Array<{ shown: string[]; servos: Array<{ partId: string; joint: string; id: number }> }>;
  simState: () => unknown;
  drive: (command: DriveCommand) => void;
  driveWith: (inputs: string[]) => Promise<boolean>;
  worldAt: () => Record<string, number[]>;
  tryWorld: () => Promise<WorldEvent[]>;
  printPlates: () => unknown;
  plateFiles: () => Promise<Record<string, Uint8Array>>;
  labelNotes: () => Record<string, string>;
  markPlatePrinted: (plate: number) => void;
  readySteps: () => boolean[];
  calibrate: (jointId: string, calibration: ServoCalibration) => void;
  routineState: () => unknown;
  printState: () => unknown;
  datasetFiles: () => Promise<Record<string, Uint8Array> | null>;
  passTries: () => Promise<void>;
  multiplyRuns: (runs: number) => void;
  addCase: (raw: unknown) => string;
  runCase: (id: string) => void;
  codeReports: () => Record<string, CodeReport | null>;
  referenceTry: () => Promise<void>;
  sharedLink: () => string | null;
  stubTrainer: (policy: unknown, snapshots?: unknown[]) => void;
  releaseTrainer: () => void;
  stubHandoffs: (stub: HandoffStub) => void;
  plantHandoff: (from: string, to: string, falls: number) => Promise<void>;
  robotPackage: () => Promise<{ files: Record<string, Uint8Array>; simXml: string } | null>;
  mat: MatDevActions;
}

export interface DevStudioDeps {
  partsRef: RefObject<ScenePart[]>;
  projectRef: RefObject<ProjectSettings>;
  viewportRef: RefObject<Viewport3DHandle | null>;
  devRef: RefObject<DevActions>;
}

function stlBase64(parts: ScenePart[]) {
  const view = sceneToStl(parts);

  return bytesToBase64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
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

function robotGhostState(viewport: Viewport3DHandle | null) {
  const twin = twinSnapshot();
  const byJoint = (angles: Angles | null | undefined) =>
    twin && angles
      ? Object.fromEntries(twin.joints.map((id, k) => [id, angles[k] === null ? null : degrees(angles[k])]))
      : null;

  return {
    layer: viewport?.ghostState() ?? null,
    measured: byJoint(twin?.measured),
    sim: byJoint(twin?.sim),
    gaps: byJoint(twin?.gaps),
    largest: twin?.largest ? { joint: twin.largest.joint, degrees: degrees(twin.largest.gap) } : null,
  };
}

interface DevRecord {
  id?: string;
  name?: string;
  parts: ScenePart[];
  project?: ProjectSettings;
  annotations?: SceneAnnotation[];
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

function lastDownloadFile() {
  const file = lastDownload();

  return file && { name: file.name, base64: bytesToBase64(file.bytes) };
}

function operatorCameraState() {
  const { open, label, estimator, error } = operatorCameraSnapshot();
  const track = operatorTrackState();

  return {
    open,
    live: open && track === 'live',
    ended: track === 'ended',
    label,
    estimator,
    error,
    latency: operatorLatency(),
    feeding: operatorFeeding(),
  };
}

const base64Files = (files: Record<string, Uint8Array>) =>
  Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, bytesToBase64(bytes)]));

function printStudioApi(devRef: RefObject<DevActions>) {
  return {
    printPlates: () => devRef.current.printPlates(),
    printState: () => devRef.current.printState(),
    plateFiles: async () => base64Files(await devRef.current.plateFiles()),
    labelNotes: () => devRef.current.labelNotes(),
    markPlatePrinted: (plate: number) => devRef.current.markPlatePrinted(plate),
    readySteps: () => devRef.current.readySteps(),
  };
}

export function devStudioApi({ partsRef, projectRef, viewportRef, devRef }: DevStudioDeps) {
  return {
    rangeClashes: () => rangeClashes(partsRef.current, projectRef.current, viewportRef.current),
    parts: () => partSummaries(partsRef.current),
    interference: () => viewportRef.current?.interference() ?? { interferences: [], coplanar: [] },
    checkDots: () => viewportRef.current?.checkDotCount() ?? 0,
    sceneRecord: () => ({ parts: partsRef.current, project: projectRef.current, annotations: [] }),
    stlBase64: () => stlBase64(partsRef.current),
    lastDownload: () => lastDownloadFile(),
    capture: (views: string[], ids?: string[]) => viewportRef.current?.captureViews(views, ids) ?? [],
    projectPoints: (points: Array<[number, number, number]>) => viewportRef.current?.projectPoints(points) ?? [],
    meshByColor: () => meshByColor(partsRef.current),
    cadSources: () => cadSources(partsRef.current),
    clear: () => devRef.current.clear(),
    select: (ids: string[]) => devRef.current.select(ids),
    dragSkeleton: (step: Omit<JointDragStep, 'phase'>) => devRef.current.dragSkeleton(step),
    dropFiles: (files: Array<{ name: string; base64: string }>) =>
      devRef.current.dropFiles(files.map((f) => new File([new Uint8Array(base64ToBytes(f.base64))], f.name))),
    selection: () => devRef.current.selection(),
    dragPart: (id: string, to: [number, number, number], free?: boolean) =>
      viewportRef.current?.dragPart(id, to, free) ?? false,
    project: (points: Array<[number, number, number]>) => viewportRef.current?.projectPoints(points) ?? [],
    mates: (id: string) => partsRef.current.find((p) => p.id === id)?.mates ?? [],
    pose: (id: string) => {
      const part = partsRef.current.find((p) => p.id === id);

      return part && { position: part.position, rotation: part.rotation };
    },
    selectFace: (partId: string, normal: [number, number, number]) => devRef.current.selectFace(partId, normal),
    sketchPath: (points: Vec2[]) => devRef.current.sketchPath(points),
    posedPort: (id: string, port: string) => {
      const part = partsRef.current.find((p) => p.id === id);
      const { rig, pose } = devRef.current.posing;

      return part ? posedPort(rig, pose, { part, port }) : null;
    },
    triangleCount: (id: string) => (viewportRef.current?.partTriangles(id)?.length ?? 0) / 9,
    partTriangles: (id: string) => Array.from(viewportRef.current?.partTriangles(id) ?? []),
    importRobot: (url: string, name?: string) => devRef.current.importRobot({ kind: 'url', url, name }),
    robotPreview: async (url: string, width = 480) =>
      robotPreviewImage((await importRobot({ kind: 'url', url })).parts, width),
    setPose: (values: Record<string, number>, root?: RobotPoseState['root']) =>
      devRef.current.posing.setPose({ values, root }),
    posing: () => devRef.current.posing,
    load: (record: DevRecord) =>
      devRef.current.load({
        sceneId: record.id ?? newSceneId(),
        sceneName: record.name ?? 'Untitled',
        globalGoal: '',
        parts: record.parts,
        annotations: record.annotations ?? [],
        project: record.project,
      }),
    poseTool: (kind: string, payload: Payload) => devRef.current.poseTool(kind, payload),
    simTool: (kind: string, payload: Payload) => devRef.current.simTool(kind, payload),
    agentRequest: (kind: string, payload: Payload) => devRef.current.agentRequest(kind, payload),
    guide: () => devRef.current.guide(),
    buildAlongSteps: () => devRef.current.buildAlongSteps(),
    shownParts: () => viewportRef.current?.shownPartIds() ?? [],
    simState: () => devRef.current.simState(),
    drive: (command: DriveCommand) => devRef.current.drive(command),
    driveWith: (inputs: string[]) => devRef.current.driveWith(inputs),
    feedVoice: (samples: number[], sampleRate: number) => feedVoice(samples, sampleRate),
    worldAt: () => devRef.current.worldAt(),
    tryWorld: () => devRef.current.tryWorld(),
    ...printStudioApi(devRef),
    bomLines: () =>
      buildBom({ parts: partsRef.current, project: projectRef.current, purchases: {}, measures: {} }).lines.map(
        ({ key, qty }) => ({ key, qty }),
      ),
    calibrate: (jointId: string, calibration: ServoCalibration) => devRef.current.calibrate(jointId, calibration),
    routineState: () => devRef.current.routineState(),
    passTries: () => devRef.current.passTries(),
    multiplyRuns: (runs: number) => devRef.current.multiplyRuns(runs),
    addCase: (raw: unknown) => devRef.current.addCase(raw),
    runCase: (id: string) => devRef.current.runCase(id),
    codeReports: () => devRef.current.codeReports(),
    referenceTry: () => devRef.current.referenceTry(),
    sharedLink: () => devRef.current.sharedLink(),
    stubTrainer: (policy: unknown, snapshots?: unknown[]) => devRef.current.stubTrainer(policy, snapshots),
    releaseTrainer: () => devRef.current.releaseTrainer(),
    stubHandoffs: (stub: HandoffStub) => devRef.current.stubHandoffs(stub),
    plantHandoff: (from: string, to: string, falls: number) => devRef.current.plantHandoff(from, to, falls),
    attachRobot: (link: RobotLinkApi) => startRobotStore(link),
    robotCalibration: async () => (await robotLinkState())?.calibration ?? null,
    phone: () => phoneSnapshot(),
    feedPose: (samples: PoseSample[], fps?: number) => feedOperatorPose(samples, fps),
    feedHand: (samples: HandSample[], fps?: number) => feedOperatorHand(samples, fps),
    feedFace: (samples: FaceSample[], fps?: number) => feedOperatorFace(samples, fps),
    inputEvents: () => inputEvents().map(({ name, value }) => ({ name, value })),
    operatorCamera: () => operatorCameraState(),
    cameraStreams: () => ({ ...streamCost }),
    stubTabEngine,
    exploreLimit: (designs: number) => limitExplore(designs),
    pickFiles: (files: { name: string; base64: string }[]) =>
      pickNextFiles(
        files.map(({ name, base64 }) => new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name)),
      ),
    calibrationReplay: (jointId: string) => replayErrors(projectRef.current.servoCalibrations?.[jointId]),
    calibrations: () => projectRef.current.servoCalibrations ?? {},
    robotGhost: () => robotGhostState(viewportRef.current),
    ...matStudioApi(() => devRef.current.mat),
    datasetFiles: async () => {
      const files = await devRef.current.datasetFiles();

      return files && base64Files(files);
    },
    robotPackage: async () => {
      const made = await devRef.current.robotPackage();

      return (
        made && {
          files: base64Files(made.files),
          simXml: made.simXml,
        }
      );
    },
  };
}
