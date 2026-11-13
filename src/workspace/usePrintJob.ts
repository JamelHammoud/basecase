import { useEffect, useState } from 'react';
import type { PrinterSetup } from '../data/printers';
import { jobSpec, type JobSpec } from '../print/job';
import { printBridge, type JobPayload, type SliceRecord } from '../print/printBridge';
import type { Viewport3DHandle } from '../three/viewport/types';
import type { PrintMaterial, ProjectSettings } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import type { PrintReport } from '../utils/printReport';
import type { ShowToast } from './types';
import { errorMessage } from '../utils/errorMessage';
import { plural } from '../utils/plural';

interface PrintJobOptions {
  jobId: string;
  sceneName: string;
  report: PrintReport | null;
  printer: PrinterSetup;
  project: ProjectSettings;
  viewport: () => Viewport3DHandle | null;
  threeMf?: Viewport3DHandle['printThreeMf'];
  showToast: ShowToast;
}

const threeMfOf = async (options: PrintJobOptions, spec: JobSpec): Promise<Record<string, Uint8Array>> =>
  (await (options.threeMf ?? options.viewport()?.printThreeMf)?.(spec.files, spec.plateSize)) ?? {};

async function buildPayload(options: PrintJobOptions, material?: PrintMaterial): Promise<JobPayload> {
  const { report, printer, project, jobId, sceneName } = options;

  if (!report?.plan.plates.length) throw new Error('No plates to print. Add printed parts first.');

  const spec = jobSpec(report.plan, printer, project);

  if (!spec.printer)
    throw new Error(`${printer.label} has no slicer profile. Export the 3MF and set it up in your slicer.`);

  const files = await threeMfOf(options, spec);

  return {
    jobId,
    name: sceneName,
    infillPct: project.infillPct,
    printer: spec.printer,
    material,
    groups: spec.groups.map((g) => ({ ...g, bytes: files[g.material] })),
  };
}

export async function threeMfFiles(options: PrintJobOptions): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const { report, printer, project } = options;

  if (!report?.plan.plates.length) return [];

  const spec = jobSpec(report.plan, printer, project);
  const files = await threeMfOf(options, spec);

  return spec.groups.map((g) => ({ name: g.material, bytes: files[g.material] })).filter((f) => f.bytes);
}

function useSliceProgress(jobId: string, busy: boolean) {
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;

    return platformBridge.subscribeEvents((event) => {
      if (event.type === 'print-progress' && event.jobId === jobId) setProgress(String(event.message ?? ''));
    });
  }, [busy, jobId]);

  return busy ? progress : null;
}

export function usePrintJob(options: PrintJobOptions) {
  const { jobId, showToast } = options;
  const [slice, setSlice] = useState<SliceRecord | null>(null);
  const [slicing, setSlicing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = useSliceProgress(jobId, slicing);

  useEffect(() => {
    let live = true;

    printBridge
      .lastSlice(jobId)
      .then((r) => live && setSlice(r))
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [jobId]);

  const sliceReport = async (report: PrintReport | null) => {
    setSlicing(true);
    setError(null);

    try {
      const record = await printBridge.slice(await buildPayload({ ...options, report }));

      setSlice(record);

      return record;
    } catch (e) {
      setError(errorMessage(e));

      throw e;
    } finally {
      setSlicing(false);
    }
  };

  const stopSlice = () => void printBridge.stopSlice(jobId);

  const runSlice = async () => {
    showToast('Slicing…', { tone: 'progress', action: { label: 'Stop', onClick: stopSlice } });

    try {
      const record = await sliceReport(options.report);

      showToast(`Sliced ${plural(record.plates.length, 'plate')}`);

      return record;
    } catch (e) {
      showToast(errorMessage(e), { tone: 'error' });

      return null;
    }
  };

  const openInSlicer = async (material?: PrintMaterial) => {
    showToast('Preparing the project…', { tone: 'progress' });

    try {
      const opened = await printBridge.open(await buildPayload(options, material));

      showToast(
        opened.opened === 'default' ? `Opened ${options.sceneName}` : `Opened ${options.sceneName} in ${opened.opened}`,
      );
    } catch (e) {
      showToast(errorMessage(e), { tone: 'error' });
    }
  };

  return {
    slice,
    slicing,
    progress,
    error,
    runSlice,
    sliceReport,
    stopSlice,
    openInSlicer,
    reveal: () => void printBridge.reveal(jobId),
  };
}

export type PrintJob = ReturnType<typeof usePrintJob>;
