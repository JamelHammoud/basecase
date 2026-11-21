import { useRef, useState, type RefObject } from 'react';
import { resolvePrinter, type MyPrinter, type PrinterSetup } from '../data/printers';
import { turnedPrint, type Plate } from '../print/plan';
import {
  markForReprint,
  plateStatusLookup,
  type PlateStatusLookup,
  printRecordFor,
  readySteps,
  splitPrinted,
  withRecord,
} from '../print/tracker';
import { printScopeParts } from '../print/repairPlate';
import type { Viewport3DHandle } from '../three/viewport/types';
import type { PartPrint, PrintRecord, ProjectSettings, ScenePart } from '../types/robotics';
import { useBuildReport } from '../components/build/useBuildReport';
import { shapeKey } from '../print/shapeKey';
import type { CommitParts, Setter, ShowToast } from './types';
import { useFitTest } from './useFitTest';
import { useMerges } from './useMerges';
import { useServiceQuotes } from './useServiceQuotes';
import type { SettingsPane } from '../app/settingsPanes';
import { usePrintFleet } from './usePrintFleet';
import { useScopedPrintJobs } from './useScopedPrintJobs';
import { usePlateWriter } from './usePlateWriter';
import type { GuidePlan } from '../guide/guideTypes';
import { useDesignParameters, type DesignParameters } from './useDesignParameters';
import type { SceneDocument } from './useSceneDocument';
import { allocatePurchase } from '../components/build/usePurchases';
import { errorMessage } from '../utils/errorMessage';
import { productionCopySources } from '../kit/frozenClient';
import { retainedPrintRecord } from '../../electron/backend/printAllocations.mjs';
import { useTemporaryPrinting } from './useTemporaryPrinting';

export type { PrintMode } from './usePrintMode';

export interface PrintingOptions {
  active: boolean;
  projectRef: RefObject<ProjectSettings>;
  parameters: DesignParameters;
  jobId: string;
  sceneName: string;
  parts: ScenePart[];
  buildOpen: boolean;
  printer: PrinterSetup;
  printers: MyPrinter[];
  project: ProjectSettings;
  setProject: Setter<ProjectSettings>;
  commitParts: CommitParts;
  viewport: () => Viewport3DHandle | null;
  showToast: ShowToast;
  partsRef: RefObject<ScenePart[]>;
  undo: () => void;
  openSettings: (pane: SettingsPane) => void;
  guidePlan: () => Promise<GuidePlan | null>;
  guideFingerprint: string;
}

function cleanPrint(print: PartPrint): PartPrint | undefined {
  const entries = Object.entries(print).filter(([, v]) => v !== undefined && v !== false);

  return entries.length ? (Object.fromEntries(entries) as PartPrint) : undefined;
}

interface MarkerContext {
  sceneId?: string;
  labels?: string;
  viewport: () => Pick<Viewport3DHandle, 'printMeshes'> | null;
  marking: RefObject<Set<string>>;
  plateStatus: PlateStatusLookup;
  setRecords: (update: (prev: PrintRecord[]) => PrintRecord[]) => void;
  parts: ScenePart[];
  printer: Pick<PrinterSetup, 'label'>;
  showToast: ShowToast;
}

async function enteredPlate(plate: Plate, context: MarkerContext) {
  const existing = context.plateStatus(plate).record;

  if (existing) return existing;

  const meshes = await context.viewport()?.printMeshes([...new Set(plate.items.map((item) => item.id))]);

  if (!meshes) throw new Error('The print geometry is missing.');

  const sourceKeys = await productionCopySources({ parts: context.parts, meshes });

  return printRecordFor(plate, {
    parts: context.parts,
    keyOf: shapeKey,
    printer: context.printer.label,
    now: new Date(),
    sourceKeys,
    labels: context.labels,
    sceneId: context.sceneId,
    origin: 'entered',
  });
}

export const plateMarker = (context: MarkerContext) => async (plate: Plate, state: PrintRecord['state']) => {
  const identity = JSON.stringify([plate.hash, plate.number]);

  if (context.marking.current.has(identity)) return;

  context.marking.current.add(identity);

  try {
    const source = await enteredPlate(plate, context);
    const record = {
      ...source,
      state,
      completion:
        state === 'printed' ? { ...source.completion, enteredAt: new Date().toISOString() } : source.completion,
    };

    const saved = await allocatePurchase({ kind: 'print', record });
    const retained = retainedPrintRecord(saved, record);

    context.setRecords((prev) => withRecord(prev, retained));
  } catch (error) {
    context.showToast(errorMessage(error), { tone: 'error' });
  } finally {
    context.marking.current.delete(identity);
  }
};

function reprintMarker({
  records,
  setRecords,
  showToast,
}: Pick<MarkerContext, 'setRecords' | 'showToast'> & { records: PrintRecord[] }) {
  return async (id: string) => {
    const next = markForReprint(records, id);

    if (next === records) return;

    try {
      await allocatePurchase({ kind: 'print', record: next[0] });
      setRecords((prev) => withRecord(prev, next[0]));
    } catch (error) {
      showToast(errorMessage(error), { tone: 'error' });
    }
  };
}

export function usePrinting(options: PrintingOptions) {
  const marking = useRef(new Set<string>());
  const { parts, printer, project, setProject, commitParts, showToast, viewport } = options;
  const fit = useFitTest({ ...options, parts, project, printer, viewport });
  const temporary = useTemporaryPrinting(options, fit);
  const temporaryPrint = temporary.active;
  const printingMode = temporary.mode;
  const { mode, repairId } = printingMode;
  const [skipPrinted, setSkipPrinted] = useState(true);
  const split = splitPrinted(parts, project.prints, shapeKey);
  const reporting = options.buildOpen || !!mode;
  const printParts = printScopeParts(parts, split.remaining, {
    repairId,
    skipPrinted,
    repairPrint: printingMode.repairPrint,
  });
  const { measures, print: report } = useBuildReport({
    printParts,
    printScope: `${options.jobId}:${repairId ?? ''}`,
    parts,
    project,
    printer,
    measure: async (ids?: string[]) => (await viewport()?.measureParts(ids)) ?? {},
    printShapes: async (ids, faces) => (await viewport()?.printShapes(ids, faces)) ?? {},
    enabled: reporting,
  });
  const service = useServiceQuotes({
    ...options,
    plates: report?.plan.plates ?? [],
    enabled: reporting,
  });
  const merges = useMerges({
    active: printingMode.canMerge,
    parts,
    partsRef: options.partsRef,
    project,
    printer,
    viewport,
    commitParts,
    showToast,
    undo: options.undo,
  });
  const shown = temporaryPrint ? temporary.report : report;
  const plates = usePlateWriter(
    repairId ? { ...options, parts: printParts, partsRef: { current: printParts } } : options,
  );
  const write = temporary.write ?? plates.write;
  const { job, designSlices } = useScopedPrintJobs({ options, temporary, report, shown, plates, write });
  const records = project.prints ?? [];
  const plateStatus = plateStatusLookup(records);
  const setRecords = (update: (prev: PrintRecord[]) => PrintRecord[]) =>
    setProject((p) => ({ ...p, prints: update(p.prints ?? []) }));

  const setPartPrint = (ids: string[], patch: Partial<PartPrint>) => {
    if (temporaryPrint || printingMode.editRepairPrint(ids, patch)) return;

    commitParts((prev) =>
      prev.map((p) => (ids.includes(p.id) ? { ...p, print: cleanPrint({ ...p.print, ...patch }) } : p)),
    );
  };

  const turnPart = (id: string) => {
    const turned = turnedPrint(report?.plan.plates ?? [], id);

    if (turned) setPartPrint([id], turned);
  };

  const fleet = usePrintFleet({
    ...options,
    process: project.printProcess,
    plates: shown?.plan.plates ?? [],
    records,
    plateStatus,
    setRecords,
    job,
    labels: plates.key,
    sceneId: options.jobId,
    recording: !temporaryPrint,
    active: !!mode,
    showToast,
  });

  const markPlate = (plate: Plate, state: PrintRecord['state']) =>
    plateMarker({ ...options, plateStatus, setRecords, marking, labels: plates.key, sceneId: options.jobId })(
      plate,
      state,
    );

  return {
    ...printingMode,
    temporaryPrint,
    temporaryParts: temporary.parts,
    report: shown,
    measures,
    designSlices,
    printedCount: split.printed.length,
    skipPrinted,
    setSkipPrinted,
    printer,
    job,
    status: fleet.status,
    statusOf: fleet.statusOf,
    fleet: temporaryPrint ? [] : fleet.fleet,
    nextFor: fleet.nextFor,
    records,
    plateStatus,
    markForReprint: reprintMarker({ records, setRecords, showToast }),
    fitTest: fit.parts && { parts: fit.parts, variants: fit.variants, downs: fit.downs },
    canFitTest: fit.available && !temporary.tooling,
    fitCutting: fit.cutting,
    merges,
    service,
    plates: { ...plates, write },
    sending: fleet.sending,
    sendPlate: fleet.sendPlate,
    markPlate: (plate: Plate, state: PrintRecord['state']) => {
      if (!temporaryPrint) markPlate(plate, state);
    },
    setPartPrint,
    turnPart,
    freshSlice: job.freshSlice,
    readySteps: (steps: string[][]) => readySteps(steps, { parts, records, keyOf: shapeKey }),
  };
}

export type Printing = ReturnType<typeof usePrinting>;

interface ScenePrintingOptions {
  active: boolean;
  scene: { sceneId: string; sceneName: string };
  docs: SceneDocument;
  studio: { printers: { printers: MyPrinter[] }; isRightOpen: boolean; openSettings: (pane: SettingsPane) => void };
  tool: { rightTab: string };
  viewportRef: { current: Viewport3DHandle | null };
  showToast: ShowToast;
  undo: () => void;
  guide: { currentPlan: () => Promise<GuidePlan | null>; fingerprint: string };
}

export function useScenePrinting(options: ScenePrintingOptions) {
  const { scene, docs, studio, tool, viewportRef, showToast, undo, guide } = options;
  const printer = resolvePrinter(docs.project.printer, studio.printers.printers);
  const parameters = useDesignParameters({ docs, sceneId: scene.sceneId, showToast });
  const printing = usePrinting({
    active: options.active,
    parameters,
    projectRef: docs.projectRef,
    jobId: scene.sceneId,
    sceneName: scene.sceneName,
    parts: docs.parts,
    buildOpen: tool.rightTab === 'build' && studio.isRightOpen,
    printer,
    printers: studio.printers.printers,
    project: docs.project,
    setProject: docs.setProject,
    commitParts: docs.commitParts,
    viewport: () => viewportRef.current,
    showToast,
    partsRef: docs.partsRef,
    undo,
    openSettings: studio.openSettings,
    guidePlan: guide.currentPlan,
    guideFingerprint: guide.fingerprint,
  });

  return { printer, printing, parameters };
}
