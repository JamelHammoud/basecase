import { useState } from 'react';
import type { TemporaryPrint } from './temporaryPrint';
import type { PrintingOptions } from './usePrinting';
import type { useFitTest } from './useFitTest';
import { usePrintMode } from './usePrintMode';

export function useTemporaryPrinting(
  options: Pick<PrintingOptions, 'parts' | 'project' | 'jobId' | 'printer'>,
  fit: ReturnType<typeof useFitTest>,
) {
  const [tooling, setTooling] = useState<{ data: TemporaryPrint; scene: string } | null>(null);
  const current = toolingForScene(tooling, options);

  if (tooling && !current) setTooling(null);

  const mode = usePrintMode({ ...options, fit, temporaryAvailable: !!current });

  return {
    active: fit.active || !!current,
    tooling: !!current,
    report: current?.report ?? fit.report,
    write: current?.write ?? (fit.active ? fit.threeMf : null),
    key: current?.key ?? (fit.active ? `${options.jobId}-fit-test` : options.jobId),
    parts: current?.parts ?? fit.parts,
    mode: {
      ...mode,
      openTemporary: (value: TemporaryPrint) => {
        fit.leave();
        setTooling({ data: value, scene: options.jobId });
        mode.openTemporary();
      },
      closeTemporary: () => setTooling(null),
      closeMode: () => {
        setTooling(null);
        mode.closeMode();
      },
      openMode: (plate = 1) => {
        setTooling(null);
        mode.openMode(plate);
      },
      openRepairPlate: (id: string) => {
        setTooling(null);
        mode.openRepairPlate(id);
      },
    },
  };
}

function toolingForScene(
  tooling: { data: TemporaryPrint; scene: string } | null,
  options: Pick<PrintingOptions, 'parts' | 'project' | 'jobId' | 'printer'>,
) {
  if (
    !tooling ||
    tooling.scene !== options.jobId ||
    tooling.data.sourceParts !== options.parts ||
    tooling.data.sourceProject !== options.project ||
    JSON.stringify(tooling.data.report.printer) !== JSON.stringify(options.printer)
  )
    return null;

  return tooling.data;
}
