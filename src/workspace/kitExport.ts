import { provenOrderOf } from '../assembly/provenOrder';
import { knownPurchases } from '../components/build/usePurchases';
import { generateGuide } from '../guide/generateGuide';
import { stepPartsOf } from '../guide/guideSteps';
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
}

export function kitGuard(core: WorkspaceCore, run: KitRun) {
  const name = core.scene.sceneName;
  const id = core.scene.sceneId;

  return () => {
    run.signal.throwIfAborted();

    const current = run.current();

    if (
      current.docs.partsRef.current !== core.parts ||
      current.docs.projectRef.current !== core.project ||
      current.scene.sceneId !== id ||
      current.scene.sceneName !== name ||
      current.printer.id !== core.printer.id ||
      current.printer.nozzle !== core.printer.nozzle ||
      current.printer.model.id !== core.printer.model.id
    )
      throw new Error('The scene changed during export. Export the kit again.');
  };
}

export async function prepareKit(core: WorkspaceCore, run: KitRun) {
  const viewport = core.viewportRef.current;
  const guard = kitGuard(core, run);

  guard();

  if (!viewport) throw new Error('Kit export needs solid geometry.');

  const { parts, project, printer } = core;
  const name = core.scene.sceneName;
  const known = knownPurchases();
  const purchases = structuredClone(known ?? (await platformBridge.listPurchases()));

  guard();

  const checks = core.readiness.latest();
  const missing = await componentMeshesReady(parts.flatMap((part) => (part.componentId ? [part.componentId] : [])));

  guard();

  if (missing.length) throw new Error(`Kit export needs catalog geometry for ${missing.join(', ')}.`);

  await viewport.meshesReady();
  guard();

  const measures = await viewport.measureParts();

  guard();

  const geometry = await viewport.assembly({ serviceable: [], budgetMs: 20000 });

  guard();

  const order = { ...provenOrderOf(parts, geometry), timedOut: geometry.timedOut };
  const guide = await generateGuide({
    title: name,
    parts,
    project,
    signal: run.signal,
    persist: false,
    order: async () => order,
  });

  guard();

  if (!guide) throw new Error('Kit export needs a complete build guide.');

  const printProject = {
    ...project,
    buildGuide: { ...guide.record, stepParts: stepPartsOf(guide.plan, parts, project) },
  };
  const print = await printReportOf(parts, { project: printProject, printer }, viewport.printShapes);

  guard();

  const spec = jobSpec(print.plan, printer, project);
  const letters = await lettersToWrite({
    project,
    parts,
    guidePlan: async () => guide.plan,
    key: labelsKey(project, parts, guide.record.fingerprint),
  });
  const written = await viewport.printThreeMf({ ...spec, labels: letters.letters });

  guard();

  const wiring = await viewport.wiring({ parts, project });

  guard();

  const mapInput = await robotJointMapJob(core);

  guard();

  if (!mapInput) throw new Error('Kit export needs a robot with joints.');

  return {
    name,
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
  const guard = kitGuard(core, run);
  const client = kitClient();
  const stop = () => client.dispose();

  run.signal.addEventListener('abort', stop, { once: true });

  try {
    const job = await prepareKit(core, run);

    guard();

    const bytes = await client.call('build', job);

    guard();

    return bytes;
  } finally {
    run.signal.removeEventListener('abort', stop);
    client.dispose();
  }
}
