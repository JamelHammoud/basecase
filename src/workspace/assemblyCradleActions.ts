import { sameProjectSnapshot } from '../utils/projectInputs';
import { Matrix4, Vector3 } from 'three';
import type { RefObject } from 'react';
import type { V3 } from '../guide/guideTypes';
import type { ShapeReport } from '../three/analysis/shapeReports';
import { copyGeometries, type SceneShapes } from '../three/analysis/sceneShapes';
import { writeBoundCradle } from './cradlePrintSession';
import type { CradleJob } from '../print/cradleJob';
import { cradleSelections } from '../print/cradleSelection';
import { cradleOperation } from './cradleOperation';
import { cradleSourcesCurrent } from './cradleSources';
import { guidePart } from '../print/merge/mergeGuide';
import type { CradleOptions, CradleResult } from './useAssemblyCradle';

export const FACE_DIRECTIONS: V3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export interface CradleActionContext {
  options: CradleOptions;
  latest: RefObject<CradleOptions>;
  controller: RefObject<AbortController | null>;
  faceRun: RefObject<number>;
  choices: ReturnType<typeof cradleSelections>;
  selected: string;
  current: boolean;
  down: V3 | null;
  clearanceMm: number;
  baseMm: number;
  depthMm: number;
  valid: CradleResult | null;
  reset: () => void;
  setDirections: (directions: V3[]) => void;
  setOrigin: (origin: V3) => void;
  setBusy: (value: boolean) => void;
  setResult: (value: CradleResult | null) => void;
  setError: (value: string | null) => void;
  setOpen: (value: boolean) => void;
}

export async function loadCradleFaces(context: CradleActionContext, id: string) {
  const { choices, options, latest, setDirections, setOrigin } = context;
  const run = ++context.faceRun.current;
  const { docs } = options;
  const choice = choices.find((entry) => entry.id === id);
  const view = options.viewportRef.current;

  if (!choice || !view) return;

  const bounds = view.restBounds(choice.ids);

  if (bounds) setOrigin(bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2) as V3);

  const snapshot = view.restShapes(choice.ids);
  const reports: Record<string, ShapeReport> = await view.printShapes(choice.ids).catch(() => ({}));
  const faces = [...FACE_DIRECTIONS];

  for (const instance of snapshot.instances) {
    const report = reports[instance.id];

    for (const pose of report?.check?.poses ?? []) {
      const normal = new Vector3(...pose.down).transformDirection(new Matrix4().fromArray(instance.matrix)).toArray();

      if (!faces.some((face) => new Vector3(...face).dot(new Vector3(...normal)) > 0.99999)) faces.push(normal);
    }
  }

  if (context.faceRun.current === run && latest.current.docs.partsRef.current === docs.parts) setDirections(faces);
}

export async function makeAssemblyCradle(context: CradleActionContext) {
  const {
    options,
    latest,
    controller,
    selected,
    choices,
    current,
    down,
    clearanceMm,
    baseMm,
    depthMm,
    reset,
    setBusy,
    setResult,
    setError,
  } = context;
  const { docs, buildAlong, scene, printing } = options;

  reset();

  const view = options.viewportRef.current;
  const selection = choices.find((choice) => choice.id === selected);
  const plan = buildAlong.plan;

  if (!view || !current || !selection || !plan || !down) return;

  const run = new AbortController();
  const binding = { parts: docs.parts, project: docs.project, step: buildAlong.index, sceneId: scene.sceneId };
  const isCurrent = () => {
    const live = latest.current;

    return (
      !run.signal.aborted &&
      cradleSourcesCurrent(live.docs.parts, live.parameters.status.state === 'current') &&
      live.active &&
      live.docs.partsRef.current === binding.parts &&
      sameProjectSnapshot(binding.project, live.docs.projectRef.current) &&
      live.buildAlong.index === binding.step &&
      live.buildAlong.active &&
      live.buildAlong.sessionId === buildAlong.sessionId &&
      live.buildAlong.plan === plan &&
      live.scene.sceneId === binding.sceneId &&
      JSON.stringify(live.printing.printer) === JSON.stringify(printing.printer)
    );
  };

  controller.current = run;
  setBusy(true);

  try {
    const failures = await view.meshesReady();

    if (failures.length || !isCurrent()) throw new Error('cradle:source');

    const shown = buildAlong.step?.shown ?? [];
    const snapshot = view.restShapes(shown);

    checkCradleSnapshot(snapshot);

    const geometries = await copyGeometries(snapshot, [...snapshot.geometries.keys()]);
    const job: CradleJob = {
      sessionId: buildAlong.sessionId,
      geometries,
      shapes: [...snapshot.shapes.values()],
      instances: snapshot.instances,
      ids: selection.ids,
      options: { down, clearanceMm, baseMm, depthMm, wallMm: 2 },
      parts: docs.parts.filter((part) => shown.includes(part.id)).map(guidePart),
      project: docs.project,
      printer: printing.printer,
      plan,
      step: buildAlong.index,
      sceneId: scene.sceneId,
      fingerprint: options.guide.fingerprint,
    };
    const prepared = await cradleOperation({ job, signal: run.signal, current: isCurrent });

    setResult({ job: { ...job, parts: docs.parts }, prepared });
    performance.clearMeasures('cradle:prepare');
    performance.measure('cradle:prepare', {
      start: performance.now() - prepared.metrics.prepareMs,
      detail: prepared.metrics,
    });
  } catch (failure) {
    if (isCurrent()) setError(failure instanceof Error ? failure.message : 'cradle:source');
  } finally {
    if (controller.current === run) setBusy(false);
  }
}

export function printAssemblyCradle(context: CradleActionContext) {
  const { valid, options, latest, controller, setOpen } = context;
  const { docs, scene, printing } = options;

  if (!valid) return;

  const { prepared, job } = valid;

  setOpen(false);
  printing.openTemporary({
    key: `${scene.sceneId}-assembly-cradle`,
    parts: [prepared.part],
    report: prepared.report,
    sourceParts: docs.parts,
    sourceProject: docs.project,
    write: (plates) =>
      writeBoundCradle({
        prepared,
        plates,
        signal: controller.current?.signal ?? AbortSignal.abort(),
        current: () => {
          const live = latest.current;

          return (
            live.active &&
            cradleSourcesCurrent(live.docs.parts, live.parameters.status.state === 'current') &&
            live.buildAlong.active &&
            live.docs.partsRef.current === job.parts &&
            sameProjectSnapshot(job.project, live.docs.projectRef.current) &&
            live.buildAlong.index === job.step &&
            live.buildAlong.sessionId === job.sessionId &&
            live.buildAlong.plan === job.plan &&
            live.scene.sceneId === job.sceneId &&
            JSON.stringify(live.printing.printer) === JSON.stringify(job.printer)
          );
        },
      }),
  });
}

export function currentCradleResult(
  result: CradleResult | null,
  options: {
    docs: Pick<CradleOptions['docs'], 'parts' | 'project'>;
    scene: CradleOptions['scene'];
    printing: Pick<CradleOptions['printing'], 'printer'>;
    buildAlong: Pick<CradleOptions['buildAlong'], 'plan' | 'sessionId' | 'index'>;
  },
  current: boolean,
) {
  if (
    !current ||
    !result ||
    result.job.parts !== options.docs.parts ||
    !sameProjectSnapshot(result.job.project, options.docs.project) ||
    JSON.stringify(result.job.printer) !== JSON.stringify(options.printing.printer) ||
    result.job.sessionId !== options.buildAlong.sessionId ||
    result.job.plan !== options.buildAlong.plan ||
    result.job.step !== options.buildAlong.index ||
    result.job.sceneId !== options.scene.sceneId
  )
    return null;

  return result;
}

function checkCradleSnapshot(snapshot: SceneShapes) {
  const triangles = [...snapshot.geometries.values()].reduce(
    (count, geometry) => count + (geometry.index?.count ?? geometry.attributes.position.count) / 3,
    0,
  );

  if (snapshot.instances.length > 256 || triangles > 100_000) throw new Error('cradle:limit');
}
