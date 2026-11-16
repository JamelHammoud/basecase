import { validVisibilityRequest, type StudyVisibilityRequest } from '../study/visibilityPlan';
import { visibilityMeshFiles } from '../study/visibilityMeshes';
import { loadStudyVisibility } from './studyVisibility';
import { printBridge } from '../print/printBridge';
import { resolvePrinter } from '../data/printers';
import { comparable } from '../cases/caseCompare';
import { supplyVolts } from '../cases/exploreDesigns';
import type { Case } from '../cases/schema';
import { compileStudyDimension } from '../study/dimensions';
import { prepareStudyMeshes } from '../study/meshFiles';
import { createStudySession, type StudySession } from '../study/client';
import { enumerateStudy, runStudy, studyFingerprint, studyScene } from '../study/study';
import type { StudyKnob, StudyRecord, StudyScene } from '../study/types';
import { knownPurchases } from '../components/build/usePurchases';
import { platformBridge } from '../utils/platformBridge';
import { errorMessage } from '../utils/errorMessage';
import { jsonHash } from '../utils/geometryHash';
import type { Simulation } from '../sim/useSimulation';
import { exploreVerdict } from './caseChecks';
import { engineeringInputs } from './engineeringNow';
import type { SceneCaseSource } from './useCaseCompare';
import { runStudyHold } from './studyHold';

export interface StudyRequest {
  visibility?: StudyVisibilityRequest;
  knobs?: StudyKnob[];
  seed?: number;
  limit?: number;
  kase?: Case | null;
}

const studySceneOptions = (session: StudySession, cameraVisibility = false) => ({
  dimension: compileStudyDimension,
  geometry: cameraVisibility ? undefined : session.refresh,
});

interface StudySnapshot extends StudyScene {
  posedFloor?: number | null;
}

export async function snapshotStudy(source: SceneCaseSource, cameraVisibility = false): Promise<StudySnapshot> {
  const { partsRef, projectRef } = source.docs;
  const project = { ...projectRef.current };

  delete project.study;

  const parts = partsRef.current;

  if (cameraVisibility)
    return {
      parts,
      project,
      measures: {},
      triangles: {},
      printer: resolvePrinter(project.printer, await printBridge.printers()),
    };

  const key = studyFingerprint(parts, project);
  const [input, printers, posedFloor] = await Promise.all([
    engineeringInputs(source.viewportRef.current, parts, project),
    printBridge.printers(),
    source.viewportRef.current?.posedFloor(),
  ]);

  if (partsRef.current !== parts || key !== studyFingerprint(partsRef.current, projectRef.current))
    throw new Error('The scene changed. Run Study again to apply a design.');

  const triangles = Object.fromEntries(
    parts.flatMap((part) => {
      const mesh = source.viewportRef.current?.partTriangles(part.id);

      return mesh ? [[part.id, mesh]] : [];
    }),
  );

  return {
    parts,
    project,
    measures: input.measures,
    triangles,
    servoOutputs: input.servoOutputs,
    printer: resolvePrinter(project.printer, printers),
    posedFloor,
  };
}

interface StudyRunOptions {
  signal?: AbortSignal;
  request: Required<Pick<StudyRequest, 'knobs' | 'seed' | 'limit'>> & {
    kase: Case | null;
    visibility?: StudyVisibilityRequest;
  };
  source: SceneCaseSource;
  sim: Simulation;
  stopped: () => boolean;
  onRecord: (record: StudyRecord) => void;
}

async function prepareCameraStudy(scene: StudyScene, session: StudySession) {
  if (scene.parts.length > 256) throw new Error('Compare at most 256 parts and 1000000 robot triangles.');

  const meshFiles = await visibilityMeshFiles(scene.parts);

  return session.refresh(
    { ...scene, meshFiles },
    scene.parts.map((part) => part.id),
    1000000,
  );
}

function studyRequestProblem(request: StudyRunOptions['request']): string | undefined {
  const { knobs, kase, visibility: visibilityRequest } = request;

  if (visibilityRequest && !validVisibilityRequest(visibilityRequest))
    return 'Choose a saved try, cameras, targets and 2 to 32 samples.';

  if (visibilityRequest && knobs.some((knob) => knob.kind !== 'camera_pose' && knob.kind !== 'camera_lens'))
    return 'Compare camera settings separately from mechanism changes on a fixed recording.';

  if (!knobs.length) return 'Choose a setting to study.';

  if (kase && !comparable(kase)) return `${kase.name} has more than one robot slot.`;

  if (visibilityRequest && !kase) return 'Choose the recorded Case before comparing cameras.';

  return undefined;
}

function studyGrading(input: {
  session: StudySession;
  sim: Simulation;
  kase: Case | null;
  posedFloor?: number | null;
  visibility: Awaited<ReturnType<typeof loadStudyVisibility>> | null;
}): StudySession['grade'] {
  const { session, sim, kase, posedFloor, visibility } = input;

  return async (scene, options) => {
    const row = await session.grade(scene, { ...options, kase: kase ?? undefined });

    if (visibility) return { ...row, visibility: await visibility.measure(scene) };

    const hold = await runStudyHold(scene, sim, { pose: scene.project.pose, posedFloor, measure: session.hold }).catch(
      errorMessage,
    );

    return {
      ...row,
      metrics: { ...row.metrics, sim: hold },
    };
  };
}

async function executeInSession({
  request,
  source,
  sim,
  stopped,
  onRecord,
  session,
  signal,
}: StudyRunOptions & { session: StudySession }): Promise<StudyRecord | string> {
  const { knobs, kase, seed, limit } = request;
  const visibilityRequest = request.visibility;

  const problem = studyRequestProblem(request);

  if (problem) return problem;

  const designs = enumerateStudy(knobs, { seed, limit });
  const snapshot = await snapshotStudy(source, !!visibilityRequest);
  const prepared = await prepareStudyMeshes(snapshot, knobs);
  const base = visibilityRequest ? await prepareCameraStudy(prepared, session) : prepared;
  const purchases = knownPurchases() ?? (await platformBridge.listPurchases());
  const visibility = visibilityRequest
    ? await loadStudyVisibility({
        request: visibilityRequest,
        base,
        candidates: designs.length,
        sceneId: source.sceneId,
        caseId: kase?.id,
        signal,
      })
    : null;
  const runs =
    kase && !visibility
      ? (scene: StudyScene) =>
          exploreVerdict(
            {
              ...scene,
              servoVolts: supplyVolts(scene.parts, scene.project),
              partTriangles: (id) => scene.triangles[id] ?? null,
            },
            kase,
            8,
          )
      : undefined;
  const grade = studyGrading({ session, sim, kase, posedFloor: snapshot.posedFloor, visibility });

  try {
    const current = await grade(base, { knobs: [], selection: [], purchases, runs: await runs?.(base) });
    const record: StudyRecord = {
      knobs,
      ...(visibilityRequest ? { visibility: visibilityRequest } : {}),
      seed,
      rows: [],
      current: { ...current, label: source.sceneName },
      caseId: kase?.id,
      caseKey: kase ? jsonHash(kase) : undefined,
      baseKey: studyFingerprint(base.parts, base.project),
      total: designs.length,
      base: { parts: base.parts, project: base.project },
    };

    if (stopped()) return record;

    onRecord(record);

    let completed: StudyRecord['rows'] = [];

    const rows = await runStudy(base, {
      ...studySceneOptions(session, !!visibility),
      knobs,
      seed,
      limit,
      purchases,
      runs,
      grade,
      stopped,
      onRow: (row) => {
        completed = [...completed, row];
        onRecord({ ...record, rows: completed });
      },
    });

    const result = { ...record, rows };

    if (!stopped()) onRecord(result);

    return result;
  } finally {
    visibility?.dispose();
  }
}

export async function executeStudy(options: StudyRunOptions): Promise<StudyRecord | string> {
  const session = createStudySession();
  const cancel = () => session.dispose();

  options.signal?.addEventListener('abort', cancel, { once: true });

  try {
    options.signal?.throwIfAborted();

    return await executeInSession({ ...options, session });
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    session.dispose();
  }
}

export async function replayStudy(
  record: StudyRecord,
  selection: number[],
  session: StudySession,
): Promise<StudyScene> {
  const base = await prepareStudyMeshes({ ...record.base, measures: {}, triangles: {} }, record.knobs);

  return studyScene(base, record.knobs, selection, studySceneOptions(session, !!record.visibility));
}
