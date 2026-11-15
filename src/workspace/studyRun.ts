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
  knobs?: StudyKnob[];
  seed?: number;
  limit?: number;
  kase?: Case | null;
}

const studySceneOptions = (session: StudySession) => ({ dimension: compileStudyDimension, geometry: session.refresh });

interface StudySnapshot extends StudyScene {
  posedFloor?: number | null;
}

export async function snapshotStudy(source: SceneCaseSource): Promise<StudySnapshot> {
  const { partsRef, projectRef } = source.docs;
  const project = { ...projectRef.current };

  delete project.study;

  const parts = partsRef.current;
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
  request: Required<Pick<StudyRequest, 'knobs' | 'seed' | 'limit'>> & { kase: Case | null };
  source: SceneCaseSource;
  sim: Simulation;
  stopped: () => boolean;
  onRecord: (record: StudyRecord) => void;
}

async function executeInSession({
  request,
  source,
  sim,
  stopped,
  onRecord,
  session,
}: StudyRunOptions & { session: StudySession }): Promise<StudyRecord | string> {
  const { knobs, kase, seed, limit } = request;

  if (!knobs.length) return 'Choose a setting to study.';

  if (kase && !comparable(kase)) return `${kase.name} has more than one robot slot.`;

  const designs = enumerateStudy(knobs, { seed, limit });
  const snapshot = await snapshotStudy(source);
  const base = await prepareStudyMeshes(snapshot, knobs);
  const purchases = knownPurchases() ?? (await platformBridge.listPurchases());
  const runs = kase
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
  const posedFloor = snapshot.posedFloor;
  const grade: StudySession['grade'] = async (scene, options) => {
    const row = await session.grade(scene, { ...options, kase: kase ?? undefined });
    const hold = await runStudyHold(scene, sim, { pose: scene.project.pose, posedFloor, measure: session.hold }).catch(
      errorMessage,
    );

    return { ...row, metrics: { ...row.metrics, sim: hold } };
  };
  const current = await grade(base, { knobs: [], selection: [], purchases, runs: await runs?.(base) });
  const record: StudyRecord = {
    knobs,
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
    ...studySceneOptions(session),
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
}

export async function executeStudy(options: StudyRunOptions): Promise<StudyRecord | string> {
  const session = createStudySession();

  try {
    return await executeInSession({ ...options, session });
  } finally {
    session.dispose();
  }
}

export async function replayStudy(
  record: StudyRecord,
  selection: number[],
  session: StudySession,
): Promise<StudyScene> {
  const base = await prepareStudyMeshes({ ...record.base, measures: {}, triangles: {} }, record.knobs);

  return studyScene(base, record.knobs, selection, studySceneOptions(session));
}
