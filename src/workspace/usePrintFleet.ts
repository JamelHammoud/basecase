import { useState } from 'react';
import { resolvePrinter, type MyPrinter, type PrinterSetup } from '../data/printers';
import { isIdle, nextPlate, sameMachine, type FleetPrinter } from '../print/fleet';
import type { Plate } from '../print/plan';
import { printBridge, type PrinterStatus, type SlicedPlate } from '../print/printBridge';
import { printRecordFor, withRecord } from '../print/tracker';
import type { PrintRecord, ScenePart } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import { shapeKey } from '../utils/printReport';
import type { ShowToast } from './types';
import type { PrintJob } from './usePrintJob';
import { reportsStatus, usePrintStatus } from './usePrintStatus';

interface FleetOptions {
  printer: PrinterSetup;
  printers: MyPrinter[];
  parts: ScenePart[];
  plates: Plate[];
  records: PrintRecord[];
  setRecords: (update: (prev: PrintRecord[]) => PrintRecord[]) => void;
  job: PrintJob;
  freshSlice: (plate: Plate) => SlicedPlate | undefined;
  recording: boolean;
  active: boolean;
  showToast: ShowToast;
}

export function amsFor(plate: Plate, status: PrinterStatus | null) {
  const tray = status?.trays?.find((t) => t.type.toUpperCase().startsWith(plate.material));

  if (!tray || tray.slot === 254) return { useAms: false, amsMapping: [] };

  return { useAms: true, amsMapping: [tray.slot] };
}

export function usePrintFleet(options: FleetOptions) {
  const { printer, printers, records, setRecords, job, showToast } = options;
  const [sending, setSending] = useState<number | null>(null);
  const statuses = usePrintStatus({ printers, records, setRecords, active: options.active || sending !== null });
  const statusOf = (setup: PrinterSetup) => (setup.mine ? (statuses[setup.mine.id] ?? null) : null);
  const fleet: FleetPrinter[] = printers
    .filter(reportsStatus)
    .map((p) => ({ setup: resolvePrinter(p.id, printers), status: statuses[p.id] ?? null }));

  const slicedJob = async (plate: Plate, target: PrinterSetup) => {
    if (!sameMachine(target, printer)) return job.sliceOn(plate, target);

    if (!options.freshSlice(plate) && !(await job.runSlice())) return null;

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
      const record = printRecordFor(plate, {
        parts: options.parts,
        keyOf: shapeKey,
        printer: target.label,
        now: new Date(),
      });

      if (options.recording) setRecords((prev) => withRecord(prev, record));

      showToast(sent.started ? `Sent plate ${plate.number} to ${target.label}` : sent.message);
    } catch (e) {
      showToast(errorMessage(e), { tone: 'error' });
    } finally {
      setSending(null);
    }
  };

  const nextFor = (target: FleetPrinter) =>
    isIdle(target) ? nextPlate({ plates: options.plates, records, printer: target, scene: printer }) : null;

  return { sending, status: statusOf(printer), statusOf, fleet, sendPlate, nextFor };
}
