import { kitElectricalExport } from './schematicExport';
import { drawingsClient } from '../sheet/drawingsClient';
import type { DrawingOptions } from '../sheet/drawingTypes';
import { provenOrderOf } from '../assembly/provenOrder';
import { knownPurchases } from '../components/build/usePurchases';
import { generateGuide } from '../guide/generateGuide';
import { stepPartsOf } from '../guide/guideSteps';
import { checkKitSource } from '../kit/limits';
import { kitStages } from './kitStage';
import { kitClient } from '../kit/kitClient';
import { jobSpec } from '../print/job';
import { labelsKey, lettersToWrite, unlabeledNotes } from '../print/labels/partLetters';
import { componentMeshesReady } from '../three/componentMeshes';
import { platformBridge } from '../utils/platformBridge';
import { printReportOf } from '../utils/printReport';
import { robotJointMapJob } from './robotPackageExport';
import type { WorkspaceCore } from './useWorkspaceCore';

export interface KitRun {
  signal: AbortSignal;
  current: () => WorkspaceCore;
  drawingOptions?: DrawingOptions;
}

export function kitGuard(core: WorkspaceCore, run: KitRun) {
  const active = core.active;
  const name = core.scene.sceneName;
  const id = core.scene.sceneId;
  const printer = JSON.stringify(core.printer);
  const purchases = knownPurchases();

  return () => {
    run.signal.throwIfAborted();

    const current = run.current();

    if (
      knownPurchases() !== purchases ||
      current.active !== active ||
      current.docs.partsRef.current !== core.parts ||
      current.docs.projectRef.current !== core.project ||
      current.scene.sceneId !== id ||
      current.scene.sceneName !== name ||
      JSON.stringify(current.printer) !== printer
    )
      throw new Error('The scene changed during export. Export the kit again.');
  };
}

export async function prepareKit(core: WorkspaceCore, run: KitRun) {
  const viewport = core.viewportRef.current;
  const guard = kitGuard(core, run);
  const stage = kitStages(guard);

  guard();
  checkKitSource(core.parts);

  if (!viewport) throw new Error('Kit export needs solid geometry.');

  const { parts, project, printer } = core;
  const name = core.scene.sceneName;
  const known = knownPurchases();
  const checks = core.readiness.latest();
  const purchases = structuredClone(known ?? (await stage('Parts on hand', () => platformBridge.listPurchases())));

  guard();

  const missing = await stage('Catalog geometry', () =>
    componentMeshesReady(parts.flatMap((part) => (part.componentId ? [part.componentId] : []))),
  );

  guard();

  if (missing.length) throw new Error(`Kit export needs catalog geometry for ${missing.join(', ')}.`);

  await stage('Solid geometry', () => viewport.meshesReady());
  guard();

  const measures = await stage('Measuring parts', () => viewport.measureParts());

  guard();

  const drawingClient = drawingsClient();
  const stopDrawings = () => drawingClient.dispose();

  run.signal.addEventListener('abort', stopDrawings, { once: true });

  const drawings = await stage('Drawings', async () => {
    try {
      return await drawingClient.call('files', {
        source: { id: core.scene.sceneId, name, fingerprint: '' },
        sourceSnapshot: { parts, project },
        purchases,
        parts: parts.filter((part) => part.id !== project.electronicsBoard?.partId),
        options: run.drawingOptions ?? { frame: 'part', plane: 'xy', scale: 0.2 },
      });
    } finally {
      run.signal.removeEventListener('abort', stopDrawings);
      drawingClient.dispose();
    }
  });

  guard();

  const electrical = project.electronicsBoard
    ? await stage('Electronics', () => kitElectricalExport(core, run, drawings.manifest.source.fingerprint))
    : undefined;

  guard();

  const geometry = await stage('Checking the build order', () =>
    viewport.assembly({ serviceable: [], budgetMs: 20000 }),
  );

  guard();

  const order = { ...provenOrderOf(parts, geometry), timedOut: geometry.timedOut };
  const guide = await stage('Build guide', () =>
    generateGuide({
      title: name,
      parts,
      project,
      signal: run.signal,
      persist: false,
      order: async () => order,
    }),
  );

  guard();

  if (!guide) throw new Error('Kit export needs a complete build guide.');

  const printProject = {
    ...project,
    buildGuide: { ...guide.record, stepParts: stepPartsOf(guide.plan, parts, project) },
  };
  const print = await stage('Print planning', () =>
    printReportOf(parts, { project: printProject, printer }, viewport.printShapes),
  );

  guard();

  const spec = jobSpec(print.plan, printer, project);
  const letters = await lettersToWrite({
    project,
    parts,
    guidePlan: async () => guide.plan,
    key: labelsKey(project, parts, guide.record.fingerprint),
  });
  const written = await stage('Writing plates', () => viewport.printThreeMf({ ...spec, labels: letters.letters }));

  guard();

  const wiring = await stage('Wiring', () => viewport.wiring({ parts, project }));

  guard();

  const mapInput = await stage('Joint map', () => robotJointMapJob(core, true));

  guard();

  if (!mapInput) throw new Error('Kit export needs a robot with joints.');

  return {
    name,
    electrical,
    drawings,
    designFingerprint: drawings.manifest.source.fingerprint,
    parts,
    project,
    purchases,
    measures,
    wiring,
    guide: {
      plan: guide.plan,
      html: guide.html,
      fingerprint: guide.record.fingerprint,
      orderTimedOut: guide.record.orderTimedOut,
    },
    print,
    spec,
    files: written.files,
    mapInput,
    checks,
    checksFingerprint: known ? core.readiness.fingerprint : '',
    labelNotes: unlabeledNotes(written.unlabeled, letters.letters ?? {}),
  };
}

export async function exportKit(core: WorkspaceCore, run: KitRun): Promise<Uint8Array> {
  return (await exportKitResult(core, run)).bytes;
}

export async function exportKitResult(core: WorkspaceCore, run: KitRun) {
  const guard = kitGuard(core, run);
  const client = kitClient();
  const stop = () => client.dispose();

  run.signal.addEventListener('abort', stop, { once: true });

  try {
    const job = await prepareKit(core, run);

    guard();

    const bytes = await kitStages(guard)('Packing archive', () =>
      client.call(
        'build',
        job,
        [
          ...Object.values(job.files),
          ...Object.values(job.drawings.files),
          ...Object.values(job.electrical?.files ?? {}),
        ].map((file) => file.buffer as ArrayBuffer),
      ),
    );

    guard();

    return { bytes, electrical: job.electrical?.manifest };
  } finally {
    run.signal.removeEventListener('abort', stop);
    client.dispose();
  }
}
