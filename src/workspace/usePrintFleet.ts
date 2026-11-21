import { useState } from 'react';
import { resolvePrinter, type MyPrinter, type PrinterSetup } from '../data/printers';
import { isIdle, nextPlate, sameMachine, type FleetPrinter } from '../print/fleet';
import type { Plate } from '../print/plan';
import { printBridge, type PrinterStatus } from '../print/printBridge';
import { printRecordFor, withRecord, type PlateStatusLookup } from '../print/tracker';
import type { PrintRecord, ScenePart } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import { shapeKey } from '../print/shapeKey';
import type { ShowToast } from './types';
import type { PrintJob } from './usePrintJob';
import { reportsStatus, usePrintStatus } from './usePrintStatus';
import { allocatePurchase } from '../components/build/usePurchases';
import { productionCopySources } from '../kit/frozenClient';
import type { Viewport3DHandle } from '../three/viewport/types';
import { retainedPrintRecord } from '../../electron/backend/printAllocations.mjs';

interface FleetOptions {
  sceneId?: string;
  labels: string;
  viewport: () => Viewport3DHandle | null;
  printer: PrinterSetup;
  process?: string;
  printers: MyPrinter[];
  parts: ScenePart[];
  plates: Plate[];
  records: PrintRecord[];
  plateStatus: PlateStatusLookup;
  setRecords: (update: (prev: PrintRecord[]) => PrintRecord[]) => void;
  job: PrintJob;
  recording: boolean;
  active: boolean;
  showToast: ShowToast;
}

async function capturedMeshes(plate: Plate, viewport: FleetOptions['viewport']) {
  const meshes = await viewport()?.printMeshes([...new Set(plate.items.map((item) => item.id))]);

  if (!meshes) throw new Error('The print geometry is missing.');

  return meshes;
}

export function amsFor(plate: Plate, status: PrinterStatus | null) {
  const tray = status?.trays?.find((t) => t.type.toUpperCase().startsWith(plate.material));

  if (!tray || tray.slot === 254) return { useAms: false, amsMapping: [] };

  return { useAms: true, amsMapping: [tray.slot] };
}

export async function retainSentPrint(
  plate: Plate,
  target: Pick<PrinterSetup, 'label'>,
  options: Pick<FleetOptions, 'recording' | 'parts' | 'labels' | 'viewport' | 'setRecords' | 'sceneId'>,
) {
  if (!options.recording) return;

  const record = printRecordFor(plate, {
    parts: options.parts,
    keyOf: shapeKey,
    printer: target.label,
    now: new Date(),
    labels: options.labels,
    sceneId: options.sceneId,
    origin: 'sent',
    sourceKeys: await productionCopySources({
      parts: options.parts,
      meshes: await capturedMeshes(plate, options.viewport),
    }),
  });

  const saved = await allocatePurchase({ kind: 'print', record });

  options.setRecords((prev) => withRecord(prev, retainedPrintRecord(saved, record)));
}

export function usePrintFleet(options: FleetOptions) {
  const { printer, printers, records, setRecords, job, showToast } = options;
  const [sending, setSending] = useState<number | null>(null);
  const statuses = usePrintStatus({
    printers,
    records,
    setRecords,
    active: options.active || sending !== null,
    onError: (error) => showToast(errorMessage(error), { tone: 'error' }),
  });
  const statusOf = (setup: PrinterSetup) => (setup.mine ? (statuses[setup.mine.id] ?? null) : null);
  const fleet: FleetPrinter[] = printers
    .filter(reportsStatus)
    .map((p) => ({ setup: resolvePrinter(p.id, printers), status: statuses[p.id] ?? null }));

  const slicedJob = async (plate: Plate, target: PrinterSetup) => {
    if (!sameMachine(target, printer)) return job.sliceOn(plate, target);

    if (!job.freshSlice(plate) && !(await job.runSlice())) return null;

    return job.jobId;
  };

  const sendPlate = async (plate: Plate, target: PrinterSetup = printer) => {
    if (!target.mine) return;

    setSending(plate.number);

    try {
      const jobId = await slicedJob(plate, target);

      if (!jobId) return;

      const sent = await printBridge.send({
        jobId,
        plate: plate.number,
        printerId: target.mine.id,
        ...amsFor(plate, statusOf(target)),
      });

      await retainSentPrint(plate, target, options);

      showToast(sent.started ? `Sent plate ${plate.number} to ${target.label}` : sent.message);
    } catch (e) {
      showToast(errorMessage(e), { tone: 'error' });
    } finally {
      setSending(null);
    }
  };

  const nextFor = (target: FleetPrinter) =>
    isIdle(target)
      ? nextPlate({
          plates: options.plates,
          plateStatus: options.plateStatus,
          printer: target,
          scene: printer,
          process: options.process,
        })
      : null;

  return { sending, status: statusOf(printer), statusOf, fleet, sendPlate, nextFor };
}
