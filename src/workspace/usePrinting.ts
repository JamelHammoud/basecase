import { useState, type RefObject } from 'react';
import { resolvePrinter, type MyPrinter, type PrinterSetup } from '../data/printers';
import { turnedPrint, type Plate } from '../print/plan';
import { printBridge, type PrinterStatus } from '../print/printBridge';
import { printRecordFor, splitPrinted, updateRecord, withRecord } from '../print/tracker';
import type { Viewport3DHandle } from '../three/viewport/types';
import type { PartPrint, PrintRecord, ProjectSettings, ScenePart } from '../types/robotics';
import { useBuildReport } from '../components/build/useBuildReport';
import { shapeKey } from '../utils/printReport';
import type { CommitParts, Setter, ShowToast } from './types';
import { useFitTest } from './useFitTest';
import { useMerges } from './useMerges';
import { usePrintJob } from './usePrintJob';
import { usePrintStatus } from './usePrintStatus';
import { usePlateWriter } from './usePlateWriter';
import type { GuidePlan } from '../guide/guideTypes';
import { errorMessage } from '../utils/errorMessage';

interface PrintingOptions {
  jobId: string;
  sceneName: string;
  parts: ScenePart[];
  buildOpen: boolean;
  printer: PrinterSetup;
  project: ProjectSettings;
  setProject: Setter<ProjectSettings>;
  commitParts: CommitParts;
  viewport: () => Viewport3DHandle | null;
  showToast: ShowToast;
  partsRef: RefObject<ScenePart[]>;
  undo: () => void;
  guidePlan: () => Promise<GuidePlan | null>;
  guideFingerprint: string;
}

export function amsFor(plate: Plate, status: PrinterStatus | null) {
  const tray = status?.trays?.find((t) => t.type.toUpperCase().startsWith(plate.material));

  if (!tray || tray.slot === 254) return { useAms: false, amsMapping: [] };

  return { useAms: true, amsMapping: [tray.slot] };
}

function cleanPrint(print: PartPrint): PartPrint | undefined {
  const entries = Object.entries(print).filter(([, v]) => v !== undefined && v !== false);

  return entries.length ? (Object.fromEntries(entries) as PartPrint) : undefined;
}

export interface PrintMode {
  plate: number;
  selected: string | null;
  face: boolean;
}

export function usePrinting(options: PrintingOptions) {
  const { parts, printer, project, setProject, commitParts, showToast, viewport } = options;
  const [mode, setMode] = useState<PrintMode | null>(null);
  const [skipPrinted, setSkipPrinted] = useState(true);
  const split = splitPrinted(parts, project.prints, shapeKey);
  const { measures, print: report } = useBuildReport({
    printParts: skipPrinted ? split.remaining : parts,
    parts,
    project,
    printer,
    measure: async (ids?: string[]) => (await viewport()?.measureParts(ids)) ?? {},
    printShapes: async (ids, faces) => (await viewport()?.printShapes(ids, faces)) ?? {},
    enabled: options.buildOpen || !!mode,
  });
  const fit = useFitTest({ parts, project, printer, viewport });
  const merges = useMerges({
    active: !!mode && !fit.active,
    parts,
    partsRef: options.partsRef,
    project,
    printer,
    viewport,
    commitParts,
    showToast,
    undo: options.undo,
  });
  const shown = fit.active ? fit.report : report;
  const plates = usePlateWriter(options);
  const job = usePrintJob({
    ...options,
    report: shown,
    jobId: fit.active ? `${options.jobId}-fit-test` : options.jobId,
    write: fit.active ? fit.threeMf : plates.write,
    labels: fit.active ? '' : plates.key,
  });
  const [sending, setSending] = useState<number | null>(null);
  const records = project.prints ?? [];
  const setRecords = (update: (prev: PrintRecord[]) => PrintRecord[]) =>
    setProject((p) => ({ ...p, prints: update(p.prints ?? []) }));
  const status = usePrintStatus({ printer, records, setRecords, active: !!mode || sending !== null });

  const setPartPrint = (ids: string[], patch: Partial<PartPrint>) => {
    if (fit.active) return;

    commitParts((prev) =>
      prev.map((p) => (ids.includes(p.id) ? { ...p, print: cleanPrint({ ...p.print, ...patch }) } : p)),
    );
  };

  const turnPart = (id: string) => {
    const turned = turnedPrint(report?.plan.plates ?? [], id);

    if (turned) setPartPrint([id], turned);
  };

  const sendPlate = async (plate: Plate) => {
    if (!printer.mine) return;

    setSending(plate.number);

    try {
      if (!job.freshSlice(plate) && !(await job.runSlice())) return;

      const sent = await printBridge.send({
        jobId: options.jobId,
        plate: plate.number,
        printerId: printer.mine.id,
        ...amsFor(plate, status),
      });

      if (!fit.active)
        setRecords((prev) =>
          withRecord(prev, printRecordFor(plate, { parts, keyOf: shapeKey, printer: printer.label, now: new Date() })),
        );

      showToast(sent.started ? `Sent plate ${plate.number} to ${printer.label}` : sent.message);
    } catch (e) {
      showToast(errorMessage(e), { tone: 'error' });
    } finally {
      setSending(null);
    }
  };

  const markPlate = (plate: Plate, state: PrintRecord['state']) => {
    const existing = records.find((r) => r.hash === plate.hash);

    if (existing) {
      setRecords((prev) => updateRecord(prev, existing.id, { state }));

      return;
    }

    const record = printRecordFor(plate, { parts, keyOf: shapeKey, printer: printer.label, now: new Date() });

    setRecords((prev) => withRecord(prev, { ...record, state }));
  };

  const startFitTest = async () => {
    if (await fit.start()) setMode({ plate: 1, selected: null, face: false });
  };

  const closeMode = () => {
    if (!fit.active) return setMode(null);

    fit.leave();
    setMode({ plate: 1, selected: null, face: false });
  };

  return {
    report: shown,
    measures,
    printedCount: split.printed.length,
    skipPrinted,
    setSkipPrinted,
    printer,
    job,
    status,
    records,
    mode,
    openMode: (plate = 1) => setMode({ plate, selected: null, face: false }),
    setModePlate: (plate: number) => setMode({ plate, selected: null, face: false }),
    selectPart: (selected: string | null) => setMode((m) => m && { ...m, selected, face: false }),
    setFaceMode: (face: boolean) => setMode((m) => m && { ...m, face }),
    closeMode,
    fitTest: fit.parts && { parts: fit.parts },
    canFitTest: fit.available,
    fitCutting: fit.cutting,
    startFitTest,
    merges,
    plates,
    sending,
    sendPlate,
    markPlate,
    setPartPrint,
    turnPart,
    freshSlice: job.freshSlice,
  };
}

export type Printing = ReturnType<typeof usePrinting>;

interface ScenePrintingOptions {
  scene: { sceneId: string; sceneName: string };
  docs: {
    parts: ScenePart[];
    partsRef: RefObject<ScenePart[]>;
    project: ProjectSettings;
    setProject: Setter<ProjectSettings>;
    commitParts: CommitParts;
  };
  studio: { printers: { printers: MyPrinter[] }; isRightOpen: boolean };
  tool: { rightTab: string };
  viewportRef: { current: Viewport3DHandle | null };
  showToast: ShowToast;
  undo: () => void;
  guide: { currentPlan: () => Promise<GuidePlan | null>; fingerprint: string };
}

export function useScenePrinting(options: ScenePrintingOptions) {
  const { scene, docs, studio, tool, viewportRef, showToast, undo, guide } = options;
  const printer = resolvePrinter(docs.project.printer, studio.printers.printers);
  const printing = usePrinting({
    jobId: scene.sceneId,
    sceneName: scene.sceneName,
    parts: docs.parts,
    buildOpen: tool.rightTab === 'build' && studio.isRightOpen,
    printer,
    project: docs.project,
    setProject: docs.setProject,
    commitParts: docs.commitParts,
    viewport: () => viewportRef.current,
    showToast,
    partsRef: docs.partsRef,
    undo,
    guidePlan: guide.currentPlan,
    guideFingerprint: guide.fingerprint,
  });

  return { printer, printing };
}
