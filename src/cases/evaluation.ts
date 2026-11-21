import { offlineEvaluationMesh } from './evaluationAssets';
import { supplyVolts } from './exploreDesigns';
import { DEFAULT_PROJECT } from '../types/robotics';
import { appearanceParts } from '../appearance/model';
import { sceneAppearanceParts } from '../appearance/sceneParts';
import type { ScenePart } from '../types/robotics';
import type { SharedScene } from '../utils/sceneFile';
import type { MeshFiles } from '../three/componentMeshes';
import { componentMeshesReady, provideMeshFiles } from '../three/componentMeshes';
import type { MeshMeasure } from '../three/meshMeasure';
import { sceneRobot } from './sceneCheck';
import { type CaseRobot, type CaseResult } from './runCase';
import { caseSlots, parseCase, type Case } from './schema';
import { encodeRecording } from './recordingFile';
import { encodeTryArchive } from './tryArchiveJobs';
import { storedTryOf } from './tryFile';
import { hashOf, sha256Hex } from '../skills/hash';

let preparations = 0;

export const evaluationPreparations = () => preparations;

export interface PreparedEvaluationRobot {
  joints: CaseRobot['joints'];
  measures: Record<string, MeshMeasure | undefined>;
  triangles: Record<string, number[]>;
}

export function evaluationComponents(scene: SharedScene): string[] {
  const parts = appearanceParts(sceneAppearanceParts(scene.project, scene.parts)) as ScenePart[];

  return [...new Set(parts.flatMap((part) => (part.componentId ? [part.componentId] : [])))];
}

export async function prepareEvaluationRobot(scene: SharedScene, meshes: MeshFiles): Promise<PreparedEvaluationRobot> {
  preparations++;

  const ids = evaluationComponents(scene);

  if (ids.some((id) => !Object.hasOwn(meshes, id))) throw new Error('The robot mesh is missing.');

  if (Object.values(meshes).some((bytes) => !offlineEvaluationMesh(new Uint8Array(bytes))))
    throw new Error('The robot mesh can’t be read.');

  provideMeshFiles(meshes);

  if ((await componentMeshesReady(ids)).length) throw new Error('The robot mesh can’t be read.');

  const robot = await sceneRobot(scene, meshes);
  const triangles: Record<string, number[]> = {};

  for (const part of scene.parts) {
    const values = robot.partTriangles(part.id);

    if (part.role === 'solid' && (!values?.length || !values.every(Number.isFinite)))
      throw new Error('The robot geometry is missing.');

    if (values) triangles[part.id] = Array.from(values);
  }

  return { joints: robot.joints, measures: robot.measures, triangles };
}

export function evaluationRobot(scene: SharedScene, prepared: PreparedEvaluationRobot): CaseRobot {
  const triangles = Object.fromEntries(
    Object.entries(prepared.triangles).map(([id, values]) => {
      if (!Array.isArray(values) || values.length % 9 || !values.every(Number.isFinite))
        throw new Error('The robot geometry can’t be read.');

      return [id, Float32Array.from(values)];
    }),
  );

  if (scene.parts.some((part) => part.role === 'solid' && !triangles[part.id]?.length))
    throw new Error('The robot geometry is missing.');

  return {
    id: scene.name,
    parts: scene.parts,
    joints: prepared.joints,
    measures: prepared.measures,
    partTriangles: (id) => triangles[id] ?? null,
    selfContact: scene.project?.selfContact,
    servoVolts: supplyVolts(scene.parts, scene.project ?? DEFAULT_PROJECT),
  };
}

export function evaluationCases(cases: Case[]): Case[] {
  if (new Set(cases.map((kase) => kase.id)).size !== cases.length) throw new Error('Case ids must be distinct.');

  return cases.map((value) => {
    const kase = parseCase(value);

    if (kase.console?.panels.some((panel) => panel.kind === 'code'))
      throw new Error('Case scripts are unsupported in offline evaluations.');

    if (caseSlots(kase).length !== 1) throw new Error('Evaluation requires a single robot slot.');

    return kase;
  });
}

export function evaluationRecording(
  result: CaseResult,
  input: { id: string; revision: string; seed: number; evaluation: string },
): Uint8Array {
  if (!result.recording) throw new Error('The failure recording is missing.');

  const stored = storedTryOf(
    {
      id: input.id,
      caseId: result.case.id,
      robot: input.revision,
      at: '1970-01-01T00:00:00.000Z',
      passed: result.passed,
      margin: result.margin,
      seconds: result.case.task.seconds,
      manifest: {
        formatVersion: 1,
        caseHash: hashOf(result.case),
        modelHash: sha256Hex(result.model.xml),
        seed: input.seed,
        frames: result.recording.frames,
        dt: result.recording.dt,
      },
    },
    {
      sceneId: input.evaluation,
      caseName: result.case.name,
      joints: result.model.joints.map((joint) => joint.id),
      input: 'script',
    },
  );

  return encodeTryArchive([{ stored, bytes: encodeRecording(result.recording) }]);
}
