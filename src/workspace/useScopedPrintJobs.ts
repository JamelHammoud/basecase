import { usePrintJob } from './usePrintJob';
import type { useTemporaryPrinting } from './useTemporaryPrinting';
import type { PrintingOptions } from './usePrinting';
import type { usePlateWriter } from './usePlateWriter';
import type { PrintReport } from '../utils/printReport';

export function useScopedPrintJobs(input: {
  options: PrintingOptions;
  temporary: ReturnType<typeof useTemporaryPrinting>;
  report: PrintReport | null;
  shown: PrintReport | null;
  plates: ReturnType<typeof usePlateWriter>;
  write: ReturnType<typeof usePlateWriter>['write'];
}) {
  const { options, temporary, report, shown, plates, write } = input;
  const designJob = usePrintJob({ ...options, report, write: plates.write, labels: plates.key });
  const temporaryJob = usePrintJob({
    ...options,
    enabled: temporary.active,
    report: shown,
    jobId: temporary.key,
    write,
    labels: '',
  });

  return { job: temporary.active ? temporaryJob : designJob, designSlices: designJob.slices };
}
