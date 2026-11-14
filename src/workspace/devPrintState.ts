import { jobSpec } from '../print/job';
import type { WorkspaceCore } from './useWorkspaceCore';

export function printDevActions(core: WorkspaceCore) {
  const { printing } = core;

  return {
    printState: () => ({
      open: !!printing.mode,
      printer: printing.printer.model.id,
      bed: printing.report?.plan.bed ?? null,
    }),
    printPlates: () => ({
      open: !!printing.mode,
      fitTest: !!printing.fitTest,
      plates: (printing.report?.plan.plates ?? []).map((p) => p.items.map((it) => it.id)),
    }),
    plateFiles: async (): Promise<Record<string, Uint8Array>> =>
      printing.report
        ? printing.plates.write(jobSpec(printing.report.plan, printing.printer, core.docs.projectRef.current))
        : {},
    labelNotes: () => printing.plates.notes,
  };
}
